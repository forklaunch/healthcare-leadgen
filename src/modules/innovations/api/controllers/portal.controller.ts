import { handlers, optional, ROLES, schemaValidator, string } from '@uchicago-ideas/core';
import { buildNdaText, CURRENT_NDA_VERSION } from '../../domain/nda/mutual-nda';
import {
  getOrganization,
  ORGANIZATIONS,
  UnknownOrganizationError
} from '../../domain/organizations';
import {
  AcceptNdaResponseSchema,
  AdminIdeasResponseSchema,
  DoctorMeResponseSchema,
  EvaluateIdeaSchema,
  IdeaEvaluationResponseSchema,
  IdeaRefinementResponseSchema,
  RefineIdeaSchema,
  IdeaSummarySchema,
  NdaResponseSchema,
  RequestAccessResponseSchema,
  RequestAccessSchema,
  StorageInspectorResponseSchema,
  SubmitIdeaSchema
} from '../../domain/schemas/portal.schema';
import { EvaluationUnavailableError } from '../../domain/services/idea-evaluation.service';
import {
  InvalidAccessKeyError,
  NdaNotAcceptedError
} from '../../domain/services/portal.service';
import { ci, tokens } from '../../bootstrapper';

const scopeFactory = () => ci.createScope();
const portalServiceFactory = ci.scopedResolver(tokens.PortalService);
const JWKS_PUBLIC_KEY_URL = ci.resolve(tokens.JWKS_PUBLIC_KEY_URL);

/**
 * Resolve a tenant-scoped portal service from the request's x-organization
 * header. A missing header falls back to the default tenant (UChicago) so
 * pre-multi-tenant clients keep working; an unknown slug is a 400.
 */
const tenantScopedPortalService = (organizationSlug?: string) => {
  const organization = getOrganization(organizationSlug);
  return portalServiceFactory({
    scope: scopeFactory(),
    context: { tenantId: organization.slug, organization }
  });
};

export const requestAccess = handlers.post(
  schemaValidator,
  '/access-request',
  {
    name: 'Request Portal Access',
    summary:
      'Registers a healthcare professional and emails them a secure access key (magic link)',
    access: 'public',
    requestHeaders: { 'x-organization': optional(string) },
    body: RequestAccessSchema,
    responses: {
      202: RequestAccessResponseSchema,
      400: string
    }
  },
  async (req, res) => {
    try {
      await tenantScopedPortalService(
        req.headers['x-organization']
      ).requestAccess(req.body);
      res.status(202).json({
        message:
          'If the address is eligible, a secure access link has been emailed.'
      });
    } catch (error) {
      if (error instanceof UnknownOrganizationError) {
        res.status(400).send(error.message);
        return;
      }
      throw error;
    }
  }
);

export const getNda = handlers.get(
  schemaValidator,
  '/nda',
  {
    name: 'Get Mutual NDA',
    summary:
      "Returns the current mutual NDA text and version, templated for the requesting organization",
    access: 'public',
    requestHeaders: { 'x-organization': optional(string) },
    responses: {
      200: NdaResponseSchema,
      400: string
    }
  },
  async (req, res) => {
    try {
      const organization = getOrganization(req.headers['x-organization']);
      res.status(200).json({
        version: CURRENT_NDA_VERSION,
        ndaText: buildNdaText(organization)
      });
    } catch (error) {
      if (error instanceof UnknownOrganizationError) {
        res.status(400).send(error.message);
        return;
      }
      throw error;
    }
  }
);

export const getMe = handlers.get(
  schemaValidator,
  '/me',
  {
    name: 'Get Profile',
    summary:
      'Returns the profile, NDA status, and submitted ideas for a secure access key',
    access: 'public',
    requestHeaders: {
      'x-access-key': string,
      'x-organization': optional(string)
    },
    responses: {
      200: DoctorMeResponseSchema,
      400: string,
      401: string
    }
  },
  async (req, res) => {
    try {
      res
        .status(200)
        .json(
          await tenantScopedPortalService(req.headers['x-organization']).getMe(
            req.headers['x-access-key']
          )
        );
    } catch (error) {
      if (error instanceof UnknownOrganizationError) {
        res.status(400).send(error.message);
        return;
      }
      if (error instanceof InvalidAccessKeyError) {
        res.status(401).send('Access key is invalid or expired');
        return;
      }
      throw error;
    }
  }
);

export const acceptNda = handlers.post(
  schemaValidator,
  '/nda/accept',
  {
    name: 'Accept Mutual NDA',
    summary:
      'Executes the mutual NDA: the submitter signs and the organization counter-signs',
    access: 'public',
    requestHeaders: {
      'x-access-key': string,
      'x-organization': optional(string)
    },
    responses: {
      200: AcceptNdaResponseSchema,
      400: string,
      401: string
    }
  },
  async (req, res) => {
    try {
      res
        .status(200)
        .json(
          await tenantScopedPortalService(
            req.headers['x-organization']
          ).acceptNda(req.headers['x-access-key'], req.ip)
        );
    } catch (error) {
      if (error instanceof UnknownOrganizationError) {
        res.status(400).send(error.message);
        return;
      }
      if (error instanceof InvalidAccessKeyError) {
        res.status(401).send('Access key is invalid or expired');
        return;
      }
      throw error;
    }
  }
);

export const submitIdea = handlers.post(
  schemaValidator,
  '/ideas',
  {
    name: 'Submit Idea',
    summary: 'Submits an idea (requires an executed mutual NDA)',
    access: 'public',
    requestHeaders: {
      'x-access-key': string,
      'x-organization': optional(string)
    },
    body: SubmitIdeaSchema,
    responses: {
      201: IdeaSummarySchema,
      400: string,
      401: string,
      403: string
    }
  },
  async (req, res) => {
    try {
      res
        .status(201)
        .json(
          await tenantScopedPortalService(
            req.headers['x-organization']
          ).submitIdea(req.headers['x-access-key'], req.body)
        );
    } catch (error) {
      if (error instanceof UnknownOrganizationError) {
        res.status(400).send(error.message);
        return;
      }
      if (error instanceof InvalidAccessKeyError) {
        res.status(401).send('Access key is invalid or expired');
        return;
      }
      if (error instanceof NdaNotAcceptedError) {
        res
          .status(403)
          .send('The mutual NDA must be accepted before submitting ideas');
        return;
      }
      throw error;
    }
  }
);

export const evaluateIdea = handlers.post(
  schemaValidator,
  '/ideas/evaluate',
  {
    name: 'Evaluate Idea',
    summary:
      'AI-scores a draft idea on study design, commercialization potential, and operational speedup (requires an executed mutual NDA); nothing is persisted',
    access: 'public',
    requestHeaders: {
      'x-access-key': string,
      'x-organization': optional(string)
    },
    body: EvaluateIdeaSchema,
    responses: {
      200: IdeaEvaluationResponseSchema,
      400: string,
      401: string,
      403: string,
      502: string
    }
  },
  async (req, res) => {
    try {
      res
        .status(200)
        .json(
          await tenantScopedPortalService(
            req.headers['x-organization']
          ).evaluateIdea(req.headers['x-access-key'], req.body)
        );
    } catch (error) {
      if (error instanceof UnknownOrganizationError) {
        res.status(400).send(error.message);
        return;
      }
      if (error instanceof InvalidAccessKeyError) {
        res.status(401).send('Access key is invalid or expired');
        return;
      }
      if (error instanceof NdaNotAcceptedError) {
        res
          .status(403)
          .send('The mutual NDA must be accepted before evaluating ideas');
        return;
      }
      if (error instanceof EvaluationUnavailableError) {
        res.status(502).send(error.message);
        return;
      }
      throw error;
    }
  }
);

export const refineIdea = handlers.post(
  schemaValidator,
  '/ideas/refine',
  {
    name: 'Refine Idea',
    summary:
      'AI-revises a draft idea to address evaluator feedback, deepest on the focused dimension (requires an executed mutual NDA); nothing is persisted',
    access: 'public',
    requestHeaders: {
      'x-access-key': string,
      'x-organization': optional(string)
    },
    body: RefineIdeaSchema,
    responses: {
      200: IdeaRefinementResponseSchema,
      400: string,
      401: string,
      403: string,
      502: string
    }
  },
  async (req, res) => {
    try {
      res
        .status(200)
        .json(
          await tenantScopedPortalService(
            req.headers['x-organization']
          ).refineIdea(req.headers['x-access-key'], req.body)
        );
    } catch (error) {
      if (error instanceof UnknownOrganizationError) {
        res.status(400).send(error.message);
        return;
      }
      if (error instanceof InvalidAccessKeyError) {
        res.status(401).send('Access key is invalid or expired');
        return;
      }
      if (error instanceof NdaNotAcceptedError) {
        res
          .status(403)
          .send('The mutual NDA must be accepted before refining ideas');
        return;
      }
      if (error instanceof EvaluationUnavailableError) {
        res.status(502).send(error.message);
        return;
      }
      throw error;
    }
  }
);

export const storageInspector = handlers.get(
  schemaValidator,
  '/storage-inspector',
  {
    name: 'Storage Inspector',
    summary:
      "Shows the caller's own records exactly as stored in Postgres (ciphertext); pass decrypt=true to also return plaintext decrypted with the tenant key",
    access: 'public',
    requestHeaders: {
      'x-access-key': string,
      'x-organization': optional(string)
    },
    query: { decrypt: optional(string) },
    responses: {
      200: StorageInspectorResponseSchema,
      400: string,
      401: string
    }
  },
  async (req, res) => {
    try {
      res
        .status(200)
        .json(
          await tenantScopedPortalService(
            req.headers['x-organization']
          ).storageInspector(
            req.headers['x-access-key'],
            req.query.decrypt === 'true'
          )
        );
    } catch (error) {
      if (error instanceof UnknownOrganizationError) {
        res.status(400).send(error.message);
        return;
      }
      if (error instanceof InvalidAccessKeyError) {
        res.status(401).send('Access key is invalid or expired');
        return;
      }
      throw error;
    }
  }
);

export const adminListIdeas = handlers.get(
  schemaValidator,
  '/ideas',
  {
    name: 'Admin List Ideas',
    summary:
      'Lists submitted ideas across all organizations (or one, via ?organization=) with submitter and NDA execution info',
    access: 'protected',
    auth: {
      jwt: {
        jwksPublicKeyUrl: JWKS_PUBLIC_KEY_URL
      },
      allowedRoles: new Set([ROLES.ADMIN])
    },
    query: { organization: optional(string) },
    responses: {
      200: AdminIdeasResponseSchema,
      400: string
    }
  },
  async (req, res) => {
    try {
      const slugs = req.query.organization
        ? [getOrganization(req.query.organization).slug]
        : Object.keys(ORGANIZATIONS);
      // Each org is read through its own tenant-scoped service so row
      // filtering and per-tenant decryption keys apply per organization.
      const results = await Promise.all(
        slugs.map((slug) => tenantScopedPortalService(slug).adminListIdeas())
      );
      const ideas = results
        .flatMap((r) => r.ideas)
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
      res.status(200).json({ ideas });
    } catch (error) {
      if (error instanceof UnknownOrganizationError) {
        res.status(400).send(error.message);
        return;
      }
      throw error;
    }
  }
);
