import { createHash, randomBytes } from 'node:crypto';
import { OpenTelemetryCollector } from '@forklaunch/core/http';
import { EntityManager } from '@mikro-orm/core';
import { Metrics } from '@uchicago-ideas/monitoring';
import { IdeaStatusEnum } from '../enum/idea-status.enum';
import { CURRENT_NDA_VERSION } from '../nda/mutual-nda';
import { getOrganization, type Organization } from '../organizations';
import {
  AccessKeyEntity,
  type Doctor,
  DoctorEntity,
  IdeaEntity,
  NdaAcceptanceEntity
} from '../../persistence/entities';
import { EmailService } from './email.service';
import {
  IdeaEvaluationService,
  type IdeaEvaluation,
  type IdeaRefinement
} from './idea-evaluation.service';

/** Default tenant, kept for backward compatibility with older callers. */
export const UCHICAGO_TENANT_ID = 'uchicago-medicine';

const ACCESS_KEY_TTL_DAYS = 14;

export class InvalidAccessKeyError extends Error {}
export class NdaNotAcceptedError extends Error {}

export function hashAccessKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function emailLookupHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export class PortalService {
  constructor(
    private readonly em: EntityManager,
    private readonly emailService: EmailService,
    private readonly ideaEvaluationService: IdeaEvaluationService,
    private readonly openTelemetryCollector: OpenTelemetryCollector<Metrics>,
    private readonly organization: Organization = getOrganization()
  ) {}

  /**
   * Register (or re-key) a doctor and email them a fresh secure access key.
   * Always responds identically whether or not the email was already
   * registered — no account enumeration.
   */
  requestAccess = async (data: {
    name: string;
    email: string;
    department?: string;
  }): Promise<void> => {
    const lookupHash = emailLookupHash(data.email);
    let doctor = await this.em.findOne(DoctorEntity, {
      emailLookupHash: lookupHash
    });
    if (!doctor) {
      doctor = this.em.create(DoctorEntity, {
        name: data.name,
        email: data.email.trim().toLowerCase(),
        emailLookupHash: lookupHash,
        department: data.department ?? null,
        organizationId: this.organization.slug
      });
    }

    const plaintextKey = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + ACCESS_KEY_TTL_DAYS * 24 * 60 * 60 * 1000
    );
    this.em.create(AccessKeyEntity, {
      keyHash: hashAccessKey(plaintextKey),
      expiresAt,
      lastUsedAt: null,
      revokedAt: null,
      doctor,
      organizationId: this.organization.slug
    });
    await this.em.flush();

    await this.emailService.sendAccessKeyEmail(
      doctor.email,
      doctor.name,
      plaintextKey,
      expiresAt,
      this.organization
    );
  };

  /** Validate a presented key and return its doctor, stamping lastUsedAt. */
  private resolveKey = async (
    plaintextKey: string
  ): Promise<{ doctor: Doctor; keyExpiresAt: Date }> => {
    const accessKey = await this.em.findOne(
      AccessKeyEntity,
      { keyHash: hashAccessKey(plaintextKey) },
      { populate: ['doctor'] }
    );
    if (
      !accessKey ||
      accessKey.revokedAt !== null ||
      accessKey.expiresAt.getTime() < Date.now()
    ) {
      throw new InvalidAccessKeyError('Access key is invalid or expired');
    }
    accessKey.lastUsedAt = new Date();
    await this.em.flush();
    return { doctor: accessKey.doctor, keyExpiresAt: accessKey.expiresAt };
  };

  private latestNda = async (doctorId: string) =>
    await this.em.findOne(
      NdaAcceptanceEntity,
      { doctor: doctorId, ndaVersion: CURRENT_NDA_VERSION },
      { orderBy: { doctorSignedAt: 'DESC' } }
    );

  /** Doctor info + NDA status + own ideas, unlocked by the emailed key. */
  getMe = async (plaintextKey: string) => {
    const { doctor, keyExpiresAt } = await this.resolveKey(plaintextKey);
    const nda = await this.latestNda(doctor.id);
    const ideas = await this.em.find(
      IdeaEntity,
      { doctor: doctor.id },
      { orderBy: { createdAt: 'DESC' } }
    );
    return {
      name: doctor.name,
      email: doctor.email,
      department: doctor.department ?? undefined,
      organization: this.organization.slug,
      organizationName: this.organization.displayName,
      ndaAccepted: nda !== null,
      currentNdaVersion: CURRENT_NDA_VERSION,
      acceptedNdaVersion: nda?.ndaVersion,
      keyExpiresAt: keyExpiresAt.toISOString(),
      ideas: ideas.map((idea) => ({
        id: idea.id,
        title: idea.title,
        body: idea.body,
        status: idea.status,
        submittedAt: idea.createdAt.toISOString()
      }))
    };
  };

  /**
   * Record the mutual NDA: doctor signs by click-through, the organization
   * counter-executes in the same transaction. Idempotent per NDA version.
   */
  acceptNda = async (plaintextKey: string, ipAddress?: string) => {
    const { doctor } = await this.resolveKey(plaintextKey);
    let nda = await this.latestNda(doctor.id);
    if (!nda) {
      const now = new Date();
      nda = this.em.create(NdaAcceptanceEntity, {
        ndaVersion: CURRENT_NDA_VERSION,
        doctorSignedAt: now,
        orgCountersignedAt: now,
        signerNameSnapshot: doctor.name,
        signerIpAddress: ipAddress ?? null,
        doctor,
        organizationId: this.organization.slug
      });
      await this.em.flush();
    }
    return {
      accepted: true,
      version: nda.ndaVersion,
      doctorSignedAt: nda.doctorSignedAt.toISOString(),
      orgCountersignedAt: nda.orgCountersignedAt.toISOString()
    };
  };

  /** Submit an idea. Requires an executed NDA for the current version. */
  submitIdea = async (
    plaintextKey: string,
    data: { title: string; body: string }
  ) => {
    const { doctor } = await this.resolveKey(plaintextKey);
    const nda = await this.latestNda(doctor.id);
    if (!nda) {
      throw new NdaNotAcceptedError(
        'The mutual NDA must be accepted before submitting ideas'
      );
    }
    const idea = this.em.create(IdeaEntity, {
      title: data.title,
      body: data.body,
      status: IdeaStatusEnum.SUBMITTED,
      doctor,
      organizationId: this.organization.slug
    });
    await this.em.flush();
    return {
      id: idea.id,
      title: idea.title,
      body: idea.body,
      status: idea.status,
      submittedAt: idea.createdAt.toISOString()
    };
  };

  /**
   * AI-evaluate a draft idea (not persisted). Same gating as submission:
   * valid key + executed NDA, since the draft is treated as PHI-grade.
   */
  evaluateIdea = async (
    plaintextKey: string,
    data: { title: string; body: string; focus?: string }
  ): Promise<IdeaEvaluation> => {
    const { doctor } = await this.resolveKey(plaintextKey);
    const nda = await this.latestNda(doctor.id);
    if (!nda) {
      throw new NdaNotAcceptedError(
        'The mutual NDA must be accepted before evaluating ideas'
      );
    }
    return this.ideaEvaluationService.evaluate(data);
  };

  /**
   * AI-refine a draft idea to address evaluator feedback (not persisted).
   * Same gating as evaluation: valid key + executed NDA.
   */
  refineIdea = async (
    plaintextKey: string,
    data: { title: string; body: string; focus: string; feedback: string[] }
  ): Promise<IdeaRefinement> => {
    const { doctor } = await this.resolveKey(plaintextKey);
    const nda = await this.latestNda(doctor.id);
    if (!nda) {
      throw new NdaNotAcceptedError(
        'The mutual NDA must be accepted before refining ideas'
      );
    }
    return this.ideaEvaluationService.refine(data);
  };

  /**
   * Live proof of encryption at rest, unlocked by the doctor's emailed key.
   * Reads the doctor's own rows twice: raw SQL (bypasses the ORM's
   * EncryptedType, returning the ciphertext exactly as Postgres stores it)
   * and via the ORM (which decrypts). Only ever exposes the caller's own
   * records.
   */
  storageInspector = async (plaintextKey: string, decrypt: boolean) => {
    const { doctor } = await this.resolveKey(plaintextKey);
    const conn = this.em.getConnection();

    const docRows = (await conn.execute(
      'select name, email, email_lookup_hash, department from doctor where id = ?',
      [doctor.id]
    )) as Array<Record<string, string | null>>;
    const raw = docRows[0] ?? {};

    const ideaRawRows = (await conn.execute(
      'select id, title, body, status from idea where doctor_id = ? order by created_at desc',
      [doctor.id]
    )) as Array<Record<string, string>>;
    const ideas = await this.em.find(
      IdeaEntity,
      { doctor: doctor.id },
      { orderBy: { createdAt: 'DESC' } }
    );
    const latestIdeaRaw = ideaRawRows[0];
    const latestIdea = latestIdeaRaw
      ? ideas.find((i) => i.id === latestIdeaRaw.id)
      : undefined;

    const ndaRawRows = (await conn.execute(
      'select signer_name_snapshot, signer_ip_address, nda_version from nda_acceptance where doctor_id = ? order by doctor_signed_at desc limit 1',
      [doctor.id]
    )) as Array<Record<string, string | null>>;
    const ndaRaw = ndaRawRows[0];
    const nda = await this.latestNda(doctor.id);

    const field = (
      column: string,
      classification: 'phi' | 'pii' | 'none',
      stored: string | null | undefined,
      decrypted: string | null | undefined,
      note?: string
    ) => ({
      column,
      classification,
      encrypted: classification !== 'none',
      stored: stored ?? '(null)',
      // Plaintext leaves the service only when the caller explicitly asks
      // to decrypt (the portal's "decrypt with your key" action).
      decrypted: decrypt ? (decrypted ?? undefined) : undefined,
      note
    });

    const sections = [
      {
        entity: 'Doctor',
        table: 'doctor',
        rowCount: 1,
        fields: [
          field('name', 'phi', raw.name, doctor.name),
          field('email', 'phi', raw.email, doctor.email),
          field(
            'email_lookup_hash',
            'none',
            raw.email_lookup_hash,
            undefined,
            'SHA-256 of the normalized email — lets us find your record without ever decrypting the email column'
          ),
          field('department', 'phi', raw.department, doctor.department ?? undefined)
        ]
      }
    ];

    if (latestIdeaRaw && latestIdea) {
      sections.push({
        entity: 'Idea',
        table: 'idea',
        rowCount: ideaRawRows.length,
        fields: [
          field('title', 'phi', latestIdeaRaw.title, latestIdea.title),
          field('body', 'phi', latestIdeaRaw.body, latestIdea.body),
          field(
            'status',
            'none',
            latestIdeaRaw.status,
            undefined,
            'Workflow metadata — no PHI, so stored in plaintext and queryable'
          )
        ]
      });
    }

    if (ndaRaw && nda) {
      sections.push({
        entity: 'NdaAcceptance',
        table: 'nda_acceptance',
        rowCount: 1,
        fields: [
          field(
            'signer_name_snapshot',
            'phi',
            ndaRaw.signer_name_snapshot,
            nda.signerNameSnapshot
          ),
          field(
            'signer_ip_address',
            'pii',
            ndaRaw.signer_ip_address,
            nda.signerIpAddress ?? undefined
          ),
          field(
            'nda_version',
            'none',
            ndaRaw.nda_version,
            undefined,
            'Contract metadata retained in plaintext for the execution record'
          )
        ]
      });
    }

    return {
      algorithm: 'AES-256-GCM',
      keyDerivation: 'HKDF-SHA256, derived per tenant from the master key',
      storedFormat: 'v2:<iv>:<authTag>:<ciphertext> (all base64)',
      tenant: this.organization.slug,
      sections
    };
  };

  /** Admin view: every idea with submitter identity and NDA execution. */
  adminListIdeas = async () => {
    const ideas = await this.em.find(
      IdeaEntity,
      {},
      { populate: ['doctor'], orderBy: { createdAt: 'DESC' } }
    );
    const ndas = await this.em.find(NdaAcceptanceEntity, {
      doctor: { $in: [...new Set(ideas.map((i) => i.doctor.id))] }
    });
    const ndaByDoctor = new Map(ndas.map((n) => [n.doctor.id, n]));
    return {
      ideas: ideas.map((idea) => {
        const nda = ndaByDoctor.get(idea.doctor.id);
        return {
          id: idea.id,
          title: idea.title,
          body: idea.body,
          status: idea.status,
          submittedAt: idea.createdAt.toISOString(),
          organizationId: this.organization.slug,
          organizationName: this.organization.displayName,
          doctorName: idea.doctor.name,
          doctorEmail: idea.doctor.email,
          doctorDepartment: idea.doctor.department ?? undefined,
          ndaVersion: nda?.ndaVersion,
          ndaExecutedAt: nda?.orgCountersignedAt.toISOString()
        };
      })
    };
  };
}
