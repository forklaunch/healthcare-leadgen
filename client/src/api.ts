const API_URL = 'http://localhost:9101';
const IAM_URL = 'http://localhost:9100';

export interface IdeaSummary {
  id: string;
  title: string;
  body: string;
  status: string;
  submittedAt: string;
}

export interface DoctorMe {
  name: string;
  email: string;
  department?: string;
  ndaAccepted: boolean;
  currentNdaVersion: string;
  acceptedNdaVersion?: string;
  keyExpiresAt: string;
  ideas: IdeaSummary[];
}

export interface AdminIdea extends IdeaSummary {
  doctorName: string;
  doctorEmail: string;
  doctorDepartment?: string;
  ndaVersion?: string;
  ndaExecutedAt?: string;
}

export async function requestAccess(data: {
  name: string;
  email: string;
  department?: string;
}): Promise<string> {
  const res = await fetch(`${API_URL}/portal/access-request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  return json.message;
}

export async function getNda(): Promise<{ version: string; ndaText: string }> {
  const res = await fetch(`${API_URL}/portal/nda`);
  return res.json();
}

export async function getMe(key: string): Promise<DoctorMe | null> {
  const res = await fetch(`${API_URL}/portal/me`, {
    headers: { 'x-access-key': key }
  });
  if (!res.ok) return null;
  return res.json();
}

export async function acceptNda(key: string): Promise<void> {
  const res = await fetch(`${API_URL}/portal/nda/accept`, {
    method: 'POST',
    headers: { 'x-access-key': key }
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function submitIdea(
  key: string,
  data: { title: string; body: string }
): Promise<IdeaSummary> {
  const res = await fetch(`${API_URL}/portal/ideas`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-access-key': key },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
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

export async function evaluateIdea(
  key: string,
  data: { title: string; body: string; focus?: EvaluationFocus }
): Promise<IdeaEvaluation> {
  const res = await fetch(`${API_URL}/portal/ideas/evaluate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-access-key': key },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export interface IdeaRefinement {
  title: string;
  body: string;
  changes: string[];
}

export async function refineIdea(
  key: string,
  data: {
    title: string;
    body: string;
    focus: EvaluationFocus;
    feedback: string[];
  }
): Promise<IdeaRefinement> {
  const res = await fetch(`${API_URL}/portal/ideas/refine`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-access-key': key },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
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

export async function getStorageInspector(
  key: string,
  decrypt: boolean
): Promise<StorageInspector | null> {
  const res = await fetch(
    `${API_URL}/portal/storage-inspector${decrypt ? '?decrypt=true' : ''}`,
    { headers: { 'x-access-key': key } }
  );
  if (!res.ok) return null;
  return res.json();
}

export async function adminLogin(
  email: string,
  password: string
): Promise<string> {
  const signIn = await fetch(`${IAM_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password })
  });
  if (!signIn.ok) throw new Error('Invalid email or password');
  const tokenRes = await fetch(`${IAM_URL}/api/auth/token`, {
    credentials: 'include'
  });
  if (!tokenRes.ok) throw new Error('Could not establish a session token');
  const { token } = await tokenRes.json();
  return token;
}

export async function adminListIdeas(token: string): Promise<AdminIdea[]> {
  const res = await fetch(`${API_URL}/admin/ideas`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Not authorized to view ideas');
  const json = await res.json();
  return json.ideas;
}
