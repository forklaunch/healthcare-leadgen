import { useEffect, useMemo, useState } from 'react';
import { AdminClient, type AdminIdea } from './api';
import { themeStyle, type AdminConfig } from './config';

/**
 * Standalone admin portal: IAM sign-in plus the consolidated ideas waitlist
 * across every customer organization, with a per-organization filter.
 */
export function AdminApp({ config }: { config: AdminConfig }) {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ideas, setIdeas] = useState<AdminIdea[] | null>(null);
  const [orgFilter, setOrgFilter] = useState<string>('');
  const [allOrgs, setAllOrgs] = useState<Array<[string, string]>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const client = useMemo(
    () => new AdminClient(config.apiUrl, config.iamUrl),
    [config.apiUrl, config.iamUrl]
  );

  useEffect(() => {
    if (token) {
      setIdeas(null);
      client
        .listIdeas(token, orgFilter || undefined)
        .then((result) => {
          setIdeas(result);
          // The filter dropdown is built from the unfiltered listing so
          // narrowing to one org doesn't collapse the other options.
          if (!orgFilter) {
            const seen = new Map<string, string>();
            for (const idea of result) {
              seen.set(idea.organizationId, idea.organizationName);
            }
            setAllOrgs([...seen.entries()]);
          }
        })
        .catch((e) => setError(e.message));
    }
  }, [client, token, orgFilter]);

  const organizations = allOrgs;

  const branding = {
    institution: config.branding?.institution ?? 'Ideas Program',
    portalName: config.branding?.portalName ?? 'Admin Console',
    tagline:
      config.branding?.tagline ??
      'Consolidated ideas waitlist across all member organizations'
  };

  return (
    <div className="portal-root" style={themeStyle(config.theme)}>
      <header className="masthead">
        <div className="shell">
          <p className="eyebrow">{branding.institution}</p>
          <h1>{branding.portalName}</h1>
          <p>{branding.tagline}</p>
        </div>
      </header>
      <main>
        {!token ? (
          <div className="card" style={{ maxWidth: 460, margin: '2rem auto' }}>
            <h2>Administrator sign in</h2>
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <div className="error">{error}</div>}
            <button
              className="primary"
              disabled={busy || !email || !password}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  setToken(await client.login(email, password));
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Sign in failed');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Sign in
            </button>
          </div>
        ) : (
          <div className="card">
            <div className="admin-toolbar">
              <h2 style={{ margin: 0 }}>Ideas waitlist</h2>
              <select
                value={orgFilter}
                onChange={(e) => setOrgFilter(e.target.value)}
                aria-label="Filter by organization"
              >
                <option value="">All organizations</option>
                {organizations.map(([slug, name]) => (
                  <option key={slug} value={slug}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            {error && <div className="error">{error}</div>}
            {!ideas ? (
              <p className="meta">Loading…</p>
            ) : ideas.length === 0 ? (
              <p className="meta">No ideas submitted yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Idea</th>
                    <th>Organization</th>
                    <th>Submitted by</th>
                    <th>NDA</th>
                    <th>Status</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {ideas.map((idea) => (
                    <tr key={idea.id}>
                      <td>
                        <strong>{idea.title}</strong>
                        <div className="meta admin-body">{idea.body}</div>
                      </td>
                      <td>
                        <span className="badge gold" style={{ marginLeft: 0 }}>
                          {idea.organizationName}
                        </span>
                      </td>
                      <td>
                        {idea.doctorName}
                        <div className="meta">
                          {idea.doctorEmail}
                          {idea.doctorDepartment ? ` · ${idea.doctorDepartment}` : ''}
                        </div>
                      </td>
                      <td>
                        {idea.ndaExecutedAt ? (
                          <span className="badge ok" style={{ marginLeft: 0 }}>
                            {idea.ndaVersion}
                          </span>
                        ) : (
                          <span className="badge warn" style={{ marginLeft: 0 }}>missing</span>
                        )}
                      </td>
                      <td>{idea.status.replace('_', ' ')}</td>
                      <td className="meta">{new Date(idea.submittedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
