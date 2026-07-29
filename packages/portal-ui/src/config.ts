/** Theme overrides applied as CSS custom properties on the portal root. */
export interface PortalTheme {
  /** Primary brand color (masthead, buttons). */
  brand?: string;
  brandDark?: string;
  brandDeep?: string;
  /** Accent color (rules, badges, tab underline). */
  accent?: string;
  accentBright?: string;
  accentSoft?: string;
  /** Page + card surfaces. */
  paper?: string;
  card?: string;
}

export interface PortalBranding {
  /** Letterhead eyebrow, e.g. "The University of Chicago Medicine". */
  institution: string;
  /** Wordmark, e.g. "Ideas Portal". */
  portalName: string;
  /** Masthead tagline. */
  tagline: string;
  /** Hero eyebrow for the logged-out landing. */
  heroEyebrow?: string;
  /** Placeholder for the email field, e.g. "you@uchicagomedicine.org". */
  emailPlaceholder?: string;
}

export interface PortalConfig {
  /** Innovations backend base URL, e.g. http://localhost:9101 */
  apiUrl: string;
  /** Organization served by this frontend deployment. */
  organization: {
    /** Tenant slug sent as x-organization, e.g. "mcg". */
    slug: string;
    /** Display name used throughout the copy, e.g. "MCG Health". */
    displayName: string;
  };
  branding: PortalBranding;
  theme?: PortalTheme;
}

export interface AdminConfig {
  /** Innovations backend base URL. */
  apiUrl: string;
  /** IAM base URL for administrator sign-in, e.g. http://localhost:9100 */
  iamUrl: string;
  branding?: Partial<PortalBranding>;
  theme?: PortalTheme;
}

const THEME_VARS: Record<keyof PortalTheme, string> = {
  brand: '--brand',
  brandDark: '--brand-dark',
  brandDeep: '--brand-deep',
  accent: '--accent',
  accentBright: '--accent-bright',
  accentSoft: '--accent-soft',
  paper: '--paper',
  card: '--card'
};

/** Convert a theme into a CSS-variable style object for the root element. */
export function themeStyle(theme?: PortalTheme): Record<string, string> {
  const style: Record<string, string> = {};
  if (!theme) return style;
  for (const [key, cssVar] of Object.entries(THEME_VARS)) {
    const value = theme[key as keyof PortalTheme];
    if (value) style[cssVar] = value;
  }
  return style;
}
