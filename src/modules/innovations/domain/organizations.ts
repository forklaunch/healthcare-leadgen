/**
 * Registry of tenant organizations served by this backend. Every portal
 * request carries an `x-organization` header (defaulting to UChicago for
 * backward compatibility); rows are stored under the org's slug and the
 * tenant filter keeps each org's data isolated.
 *
 * Portal URLs are per-customer frontends (one deployment each); override via
 * PORTAL_URL_<SLUG_SNAKE_UPPER> env vars in production.
 */

export interface Organization {
  /** Tenant id stored on rows (organizationId). */
  slug: string;
  /** Short name used in UI copy and emails. */
  displayName: string;
  /** Legal counterparty name used in the mutual NDA. */
  legalName: string;
  /** Base URL of this customer's portal frontend (magic-link target). */
  portalUrl: string;
}

function portalUrl(slug: string, fallback: string): string {
  const envKey = `PORTAL_URL_${slug.toUpperCase().replaceAll('-', '_')}`;
  return process.env[envKey] ?? fallback;
}

export const ORGANIZATIONS: Record<string, Organization> = {
  'uchicago-medicine': {
    slug: 'uchicago-medicine',
    displayName: 'UChicago Medicine',
    legalName: 'the University of Chicago Medical Center',
    portalUrl: portalUrl('uchicago-medicine', 'http://localhost:5174')
  },
  mcg: {
    slug: 'mcg',
    displayName: 'MCG Health',
    legalName: 'the Medical College of Georgia at Augusta University',
    portalUrl: portalUrl('mcg', 'http://localhost:5175')
  },
  'memorial-health': {
    slug: 'memorial-health',
    displayName: 'Memorial Health',
    legalName: 'Memorial Health University Medical Center',
    portalUrl: portalUrl('memorial-health', 'http://localhost:5176')
  }
};

export const DEFAULT_ORGANIZATION_SLUG = 'uchicago-medicine';

export class UnknownOrganizationError extends Error {}

/** Resolve an org by slug; missing header falls back to the default tenant. */
export function getOrganization(slug?: string): Organization {
  const org = ORGANIZATIONS[slug ?? DEFAULT_ORGANIZATION_SLUG];
  if (!org) {
    throw new UnknownOrganizationError(`Unknown organization: ${slug}`);
  }
  return org;
}
