import { AdminApp } from './admin';
import { PortalApp } from './portal';
import type { PortalConfig } from './config';

/**
 * Path-routed portal root for per-organization deployments: the submitter
 * portal at every path except `/admin`, which serves that organization's
 * admin surface (org-locked ideas review, PHI decryption, ROI scoring, and
 * admin-list management). Requires the host app's SPA rewrite to fall back
 * to index.html.
 */
export function PortalWithAdmin({
  config,
  iamUrl
}: {
  config: PortalConfig;
  iamUrl?: string;
}) {
  const isAdmin =
    typeof window !== 'undefined' &&
    window.location.pathname.replace(/\/+$/, '') === '/admin';

  if (isAdmin) {
    return (
      <AdminApp
        config={{
          apiUrl: config.apiUrl,
          iamUrl: iamUrl ?? 'http://localhost:9100',
          organization: config.organization,
          branding: {
            institution: config.branding.institution,
            portalName: 'Admin Console',
            tagline: `Ideas program administration for ${config.organization.displayName}`
          },
          theme: config.theme
        }}
      />
    );
  }
  return <PortalApp config={config} />;
}
