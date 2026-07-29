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

export interface AdminIdea extends IdeaSummary {
  organizationId: string;
  organizationName: string;
  doctorName: string;
  doctorEmail: string;
  doctorDepartment?: string;
  ndaVersion?: string;
  ndaExecutedAt?: string;
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
    const tokenRes = await fetch(`${this.iamUrl}/api/auth/token`, {
      credentials: 'include'
    });
    if (!tokenRes.ok) throw new Error('Could not establish a session token');
    const { token } = await tokenRes.json();
    return token;
  }

  async listIdeas(
    token: string,
    organization?: string
  ): Promise<AdminIdea[]> {
    const query = organization
      ? `?organization=${encodeURIComponent(organization)}`
      : '';
    const res = await fetch(`${this.apiUrl}/admin/ideas${query}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Not authorized to view ideas');
    const json = await res.json();
    return json.ideas;
  }
}
