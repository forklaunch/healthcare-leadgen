export interface IdeaSummary {
  id: string;
  title: string;
  body: string;
  status: string;
  submittedAt: string;
}

export interface ProfileMe {
  name: string;
  email: string;
  department?: string;
  organization: string;
  organizationName: string;
  ndaAccepted: boolean;
  currentNdaVersion: string;
  acceptedNdaVersion?: string;
  keyExpiresAt: string;
  ideas: IdeaSummary[];
}

export interface RoiDimension {
  key: 'lengthOfStay' | 'throughput' | 'patientSatisfaction';
  name: string;
  score: number;
  rationale: string;
  strengths?: string[];
  concerns?: string[];
  validationSteps: string[];
}

/** Implementation cost comparison: building on ForkLaunch vs from scratch. */
/** Build + run cost, both ways; firstYearUsd is build + 12 months. */
export interface BuildEstimate {
  complexity: string;
  /** Agentic engineering hours to build, on a flat platform subscription. */
  forklaunch: {
    agenticHours: number;
    buildCostUsd: number;
    monthlyUsd: number;
    firstYearUsd: number;
  };
  /** Traditional build, plus the infrastructure and upkeep it carries. */
  custom: {
    devWeeks: number;
    buildCostUsd: number;
    monthlyUsd: number;
    firstYearUsd: number;
  };
  savingsPct: number;
  rationale: string;
  /** Rate card + provenance, so the panel can show its work. */
  assumptions?: {
    agenticHourRateUsd: number;
    devWeekRateUsd: number;
    forklaunchMonthlyUsd: number;
    estimatedByAi: string[];
    fixed: string[];
    basis: string;
  };
}

export interface RoiScore {
  summary: string;
  roiIndex: number;
  generatedBy: string;
  scoredAt: string;
  dimensions: RoiDimension[];
  buildEstimate?: BuildEstimate;
}

/** At-rest ciphertext for the PHI columns, exactly as stored in Postgres. */
export interface AdminIdeaStored {
  title: string;
  body: string;
  doctorName: string;
  doctorEmail: string;
  doctorDepartment?: string;
  roiScore?: string;
}

/**
 * An idea as the admin API returns it: ciphertext always, plaintext fields
 * only present when the listing was requested with decrypt=true.
 */
export interface AdminIdea {
  id: string;
  status: string;
  submittedAt: string;
  organizationId: string;
  organizationName: string;
  ndaVersion?: string;
  ndaExecutedAt?: string;
  stored: AdminIdeaStored;
  title?: string;
  body?: string;
  doctorName?: string;
  doctorEmail?: string;
  doctorDepartment?: string;
  roiScore?: RoiScore;
}

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
  temporaryPassword?: string;
}

export type EvaluationFocus =
  | 'studyDesign'
  | 'commercialization'
  | 'operationalSpeedup';

export interface EvaluationDimension {
  key: EvaluationFocus;
  name: string;
  score: number;
  summary: string;
  actionableFeedback: string[];
}

export interface IdeaEvaluation {
  summary: string;
  focus?: string;
  generatedBy: string;
  dimensions: EvaluationDimension[];
}

export interface IdeaRefinement {
  title: string;
  body: string;
  changes: string[];
}

export interface StorageField {
  column: string;
  classification: string;
  encrypted: boolean;
  stored: string;
  decrypted?: string;
  note?: string;
}

export interface StorageSection {
  entity: string;
  table: string;
  rowCount: number;
  fields: StorageField[];
}

export interface StorageInspector {
  algorithm: string;
  keyDerivation: string;
  storedFormat: string;
  tenant: string;
  sections: StorageSection[];
}

/**
 * Portal API client bound to one organization: every request carries the
 * x-organization header so the backend scopes rows and encryption keys to
 * the right tenant.
 */
export class PortalClient {
  constructor(
    private readonly apiUrl: string,
    private readonly organization: string
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { 'x-organization': this.organization, ...extra };
  }

  async requestAccess(data: {
    name: string;
    email: string;
    department?: string;
  }): Promise<string> {
    const res = await fetch(`${this.apiUrl}/portal/access-request`, {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json' }),
      body: JSON.stringify(data)
    });
    const json = await res.json();
    return json.message;
  }

  async getNda(): Promise<{ version: string; ndaText: string }> {
    const res = await fetch(`${this.apiUrl}/portal/nda`, {
      headers: this.headers()
    });
    return res.json();
  }

  async getMe(key: string): Promise<ProfileMe | null> {
    const res = await fetch(`${this.apiUrl}/portal/me`, {
      headers: this.headers({ 'x-access-key': key })
    });
    if (!res.ok) return null;
    return res.json();
  }

  async acceptNda(key: string): Promise<void> {
    const res = await fetch(`${this.apiUrl}/portal/nda/accept`, {
      method: 'POST',
      headers: this.headers({ 'x-access-key': key })
    });
    if (!res.ok) throw new Error(await res.text());
  }

  async submitIdea(
    key: string,
    data: { title: string; body: string }
  ): Promise<IdeaSummary> {
    const res = await fetch(`${this.apiUrl}/portal/ideas`, {
      method: 'POST',
      headers: this.headers({
        'content-type': 'application/json',
        'x-access-key': key
      }),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async evaluateIdea(
    key: string,
    data: { title: string; body: string; focus?: EvaluationFocus }
  ): Promise<IdeaEvaluation> {
    const res = await fetch(`${this.apiUrl}/portal/ideas/evaluate`, {
      method: 'POST',
      headers: this.headers({
        'content-type': 'application/json',
        'x-access-key': key
      }),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async refineIdea(
    key: string,
    data: {
      title: string;
      body: string;
      focus: EvaluationFocus;
      feedback: string[];
    }
  ): Promise<IdeaRefinement> {
    const res = await fetch(`${this.apiUrl}/portal/ideas/refine`, {
      method: 'POST',
      headers: this.headers({
        'content-type': 'application/json',
        'x-access-key': key
      }),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async getStorageInspector(
    key: string,
    decrypt: boolean
  ): Promise<StorageInspector | null> {
    const res = await fetch(
      `${this.apiUrl}/portal/storage-inspector${decrypt ? '?decrypt=true' : ''}`,
      { headers: this.headers({ 'x-access-key': key }) }
    );
    if (!res.ok) return null;
    return res.json();
  }
}

/** Admin API client: IAM sign-in plus the consolidated cross-org listing. */
export class AdminClient {
  constructor(
    private readonly apiUrl: string,
    private readonly iamUrl: string
  ) {}

  async login(email: string, password: string): Promise<string> {
    const signIn = await fetch(`${this.iamUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    if (!signIn.ok) throw new Error('Invalid email or password');
    // Admin roles are surfaced from the active organization, so activate the
    // shared ideas-program org before minting the JWT.
    await fetch(`${this.iamUrl}/api/auth/organization/set-active`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ organizationSlug: 'ideas-program' })
    });
    const tokenRes = await fetch(`${this.iamUrl}/api/auth/token`, {
      credentials: 'include'
    });
    if (!tokenRes.ok) throw new Error('Could not establish a session token');
    const { token } = await tokenRes.json();
    return token;
  }

  /**
   * Re-mints a JWT from the better-auth session cookie, so a page refresh
   * (or a short-lived token expiring) doesn't force a re-login while the
   * session is still valid. Returns null when there is no live session.
   */
  async restoreSession(): Promise<string | null> {
    try {
      const res = await fetch(`${this.iamUrl}/api/auth/token`, {
        credentials: 'include'
      });
      if (!res.ok) return null;
      const { token } = await res.json();
      return token ?? null;
    } catch {
      return null;
    }
  }

  async logout(): Promise<void> {
    try {
      await fetch(`${this.iamUrl}/api/auth/sign-out`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch {
      // best-effort; local state is cleared regardless
    }
  }

  /**
   * Lists ideas. Without `decrypt`, PHI fields arrive as at-rest ciphertext
   * only (`stored`); pass decrypt=true to include decrypted plaintext.
   */
  async listIdeas(
    token: string,
    organization?: string,
    decrypt = false
  ): Promise<AdminIdea[]> {
    const params = new URLSearchParams();
    if (organization) params.set('organization', organization);
    if (decrypt) params.set('decrypt', 'true');
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${this.apiUrl}/admin/ideas${query}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Not authorized to view ideas');
    const json = await res.json();
    return json.ideas;
  }

  /** Records the administrator's review decision for one idea. */
  async setIdeaStatus(
    token: string,
    ideaId: string,
    organizationId: string,
    status: 'under_review' | 'accepted' | 'declined'
  ): Promise<{ id: string; status: string }> {
    const res = await fetch(
      `${this.apiUrl}/admin/ideas/${encodeURIComponent(ideaId)}/status?organization=${encodeURIComponent(organizationId)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ status })
      }
    );
    if (!res.ok) throw new Error('Could not record the decision');
    return res.json();
  }

  async listAdmins(token: string): Promise<AdminSummary[]> {
    const res = await fetch(`${this.iamUrl}/admins`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Not authorized to view the admin list');
    return res.json();
  }

  async addAdmin(
    token: string,
    data: { email: string; name: string }
  ): Promise<AddAdminResult> {
    const res = await fetch(`${this.iamUrl}/admins`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Could not add administrator');
    return res.json();
  }

  /**
   * AI-scores one idea on the administrator ROI axes (length-of-stay
   * reduction, throughput, patient satisfaction). The result is persisted
   * server-side; re-scoring overwrites the previous score.
   */
  async scoreIdeaRoi(
    token: string,
    ideaId: string,
    organizationId: string
  ): Promise<RoiScore> {
    const res = await fetch(
      `${this.apiUrl}/admin/ideas/${encodeURIComponent(ideaId)}/roi-score?organization=${encodeURIComponent(organizationId)}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    if (!res.ok) {
      throw new Error(
        res.status === 502
          ? 'The AI scoring service is unavailable — try again shortly'
          : 'ROI scoring failed'
      );
    }
    return res.json();
  }
}
