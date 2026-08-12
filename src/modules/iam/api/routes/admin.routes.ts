import { forklaunchRouter, schemaValidator } from '@uchicago-ideas/core';
import { ci, tokens } from '../../bootstrapper';
import { addAdmin, listAdmins } from '../controllers/admin.controller';

const openTelemetryCollector = ci.resolve(tokens.OtelCollector);

// Ideas-program admin-list management (JWT, admin/owner role required)
export const adminRouter = forklaunchRouter(
  '/admins',
  schemaValidator,
  openTelemetryCollector
);

export const listAdminsRoute = adminRouter.get('/', listAdmins);
export const addAdminRoute = adminRouter.post('/', addAdmin);
