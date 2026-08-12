import { randomBytes } from 'node:crypto';
import { EntityManager } from '@mikro-orm/postgresql';
import { ROLES } from '@uchicago-ideas/core';
import type { BetterAuth } from '../../auth';
import { Member } from '../../persistence/entities/member.entity';
import { Organization } from '../../persistence/entities/organization.entity';
import { User } from '../../persistence/entities/user.entity';

/** The IAM organization whose members form the ideas-program admin list. */
export const ADMIN_ORG_SLUG = 'ideas-program';
export const ADMIN_ORG_NAME = 'Ideas Program';

export class AdminOrgMissingError extends Error {}

export interface AdminSummary {
  email: string;
  name: string;
  role: string;
  addedAt: string;
}

export interface AddAdminResult {
  email: string;
  name: string;
  created: boolean;
  /** Present only when a brand-new user was provisioned. Shown once. */
  temporaryPassword?: string;
}

/**
 * Manages the ideas-program admin list: the members of the shared IAM
 * organization whose role grants access to the per-application admin portal.
 * New users are provisioned through better-auth (so password hashing and
 * session semantics stay canonical) and handed a one-time temporary password.
 */
export class AdminManagementService {
  constructor(
    private readonly em: EntityManager,
    private readonly auth: BetterAuth
  ) {}

  private getAdminOrg = async () => {
    const org = await this.em.findOne(Organization, { slug: ADMIN_ORG_SLUG });
    if (!org) {
      throw new AdminOrgMissingError(
        `The ${ADMIN_ORG_NAME} organization (${ADMIN_ORG_SLUG}) does not exist yet`
      );
    }
    return org;
  };

  listAdmins = async (): Promise<AdminSummary[]> => {
    const org = await this.getAdminOrg();
    const members = await this.em.find(Member, {
      organizationId: org.id,
      role: { $in: [ROLES.ADMIN, 'owner'] }
    });
    const users = await this.em.find(User, {
      id: { $in: members.map((m) => m.userId) }
    });
    const userById = new Map(users.map((u) => [u.id, u]));
    return members
      .map((m) => {
        const user = userById.get(m.userId);
        return {
          email: user?.email ?? '(unknown)',
          name: user?.name ?? '(unknown)',
          role: m.role,
          addedAt: m.createdAt.toISOString()
        };
      })
      .sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  };

  addAdmin = async (data: {
    email: string;
    name: string;
  }): Promise<AddAdminResult> => {
    const org = await this.getAdminOrg();
    const email = data.email.trim().toLowerCase();

    let user = await this.em.findOne(User, { email });
    let temporaryPassword: string | undefined;
    let created = false;

    if (!user) {
      // Provision through better-auth so the credential is a real,
      // sign-in-able account with a canonical scrypt hash.
      temporaryPassword = randomBytes(9).toString('base64url');
      const [firstName, ...rest] = data.name.trim().split(/\s+/);
      await this.auth.api.signUpEmail({
        body: {
          email,
          password: temporaryPassword,
          name: data.name.trim(),
          firstName: firstName ?? data.name.trim(),
          lastName: rest.join(' ') || firstName || ''
        }
      });
      user = await this.em.findOneOrFail(User, { email });
      created = true;
    }

    const existingMember = await this.em.findOne(Member, {
      organizationId: org.id,
      userId: user.id
    });
    if (existingMember) {
      if (
        existingMember.role !== ROLES.ADMIN &&
        existingMember.role !== 'owner'
      ) {
        existingMember.role = ROLES.ADMIN;
        await this.em.flush();
      }
    } else {
      this.em.create(Member, {
        organizationId: org.id,
        userId: user.id,
        role: ROLES.ADMIN
      });
      await this.em.flush();
    }

    return { email, name: user.name, created, temporaryPassword };
  };
}
