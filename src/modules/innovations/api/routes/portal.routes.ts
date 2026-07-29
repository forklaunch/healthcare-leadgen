import { forklaunchRouter, schemaValidator } from '@uchicago-ideas/core';
import {
  acceptNda,
  adminListIdeas,
  evaluateIdea,
  getMe,
  refineIdea,
  getNda,
  requestAccess,
  storageInspector,
  submitIdea
} from '../controllers/portal.controller';
import { ci, tokens } from '../../bootstrapper';

const openTelemetryCollector = ci.resolve(tokens.OtelCollector);

// Doctor-facing portal routes (secure-access-key gated)
export const portalRouter = forklaunchRouter(
  '/portal',
  schemaValidator,
  openTelemetryCollector
);

export const requestAccessRoute = portalRouter.post('/access-request', requestAccess);
export const getNdaRoute = portalRouter.get('/nda', getNda);
export const getMeRoute = portalRouter.get('/me', getMe);
export const acceptNdaRoute = portalRouter.post('/nda/accept', acceptNda);
export const submitIdeaRoute = portalRouter.post('/ideas', submitIdea);
export const evaluateIdeaRoute = portalRouter.post(
  '/ideas/evaluate',
  evaluateIdea
);
export const refineIdeaRoute = portalRouter.post('/ideas/refine', refineIdea);
export const storageInspectorRoute = portalRouter.get(
  '/storage-inspector',
  storageInspector
);

// Admin routes (JWT via IAM, admin role required)
export const adminRouter = forklaunchRouter(
  '/admin',
  schemaValidator,
  openTelemetryCollector
);

export const adminListIdeasRoute = adminRouter.get('/ideas', adminListIdeas);
