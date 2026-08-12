import {
  array,
  boolean,
  email,
  handlers,
  optional,
  ROLES,
  schemaValidator,
  string
} from '@uchicago-ideas/core';
import {
  AdminOrgMissingError
} from '../../domain/services/admin-management.service';
import { ci, tokens } from '../../bootstrapper';

const serviceFactory = ci.scopedResolver(tokens.AdminManagementService);
const JWKS_PUBLIC_KEY_URL = ci.resolve(tokens.JWKS_PUBLIC_KEY_URL);

const AdminSummarySchema = {
  email: string,
  name: string,
  role: string,
  addedAt: string
};

export const listAdmins = handlers.get(
  schemaValidator,
  '/',
  {
    name: 'List Admins',
    summary: 'Lists the ideas-program admin list',
    access: 'protected',
    auth: {
      jwt: { jwksPublicKeyUrl: JWKS_PUBLIC_KEY_URL },
      allowedRoles: new Set([ROLES.ADMIN, 'owner'])
    },
    responses: {
      200: array(AdminSummarySchema),
      409: string
    }
  },
  async (req, res) => {
    try {
      res.status(200).json(await serviceFactory().listAdmins());
    } catch (error) {
      if (error instanceof AdminOrgMissingError) {
        res.status(409).send(error.message);
        return;
      }
      throw error;
    }
  }
);

export const addAdmin = handlers.post(
  schemaValidator,
  '/',
  {
    name: 'Add Admin',
    summary:
      'Adds a person to the ideas-program admin list, provisioning an account with a one-time temporary password if they are new',
    access: 'protected',
    auth: {
      jwt: { jwksPublicKeyUrl: JWKS_PUBLIC_KEY_URL },
      allowedRoles: new Set([ROLES.ADMIN, 'owner'])
    },
    body: {
      email: email,
      name: string
    },
    responses: {
      201: {
        email: string,
        name: string,
        created: boolean,
        temporaryPassword: optional(string)
      },
      409: string
    }
  },
  async (req, res) => {
    try {
      res.status(201).json(await serviceFactory().addAdmin(req.body));
    } catch (error) {
      if (error instanceof AdminOrgMissingError) {
        res.status(409).send(error.message);
        return;
      }
      throw error;
    }
  }
);
