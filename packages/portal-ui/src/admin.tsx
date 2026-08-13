import { useEffect, useMemo, useState } from 'react';
import {
  AdminClient,
  type AddAdminResult,
  type AdminIdea,
  type AdminSummary,
  type RoiScore
} from './api';
import { themeStyle, type AdminConfig } from './config';
import { ScrambleText } from './scramble';
import { AiThinking } from './thinking';

function tier(score: number): 'high' | 'mid' | 'low' {
  if (score >= 70) return 'high';
  if (score >= 45) return 'mid';
  return 'low';
}

const ROI_AXIS_SHORT: Record<string, string> = {
  lengthOfStay: 'LOS',
  throughput: 'Throughput',
  patientSatisfaction: 'Satisfaction'
};

function Cipher({ value }: { value: string }) {
  return (
    <span className="vault-value admin-cipher" title="Encrypted at rest (AES-256-GCM, per-tenant key)">
      {value.length > 96 ? `${value.slice(0, 96)}…` : value}
    </span>
  );
}

/**
 * Admin portal, hosted inside each organization's own frontend (or centrally
 * when no organization lock is configured). PHI renders encrypted-first: the
 * table initially shows the at-rest ciphertext, and plaintext is fetched and
 * revealed only when the administrator explicitly decrypts. Includes AI ROI
 * scoring on the axes administrators fund against — length-of-stay reduction,
 * throughput improvement, patient satisfaction — plus admin-list management.
 */
export function AdminApp({ config }: { config: AdminConfig }) {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState<'ideas' | 'admins'>('ideas');
  const [ideas, setIdeas] = useState<AdminIdea[] | null>(null);
  const [decrypted, setDecrypted] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [orgFilter, setOrgFilter] = useState<string>(
    config.organization?.slug ?? ''
  );
  const [allOrgs, setAllOrgs] = useState<Array<[string, string]>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scoring, setScoring] = useState<Set<string>>(new Set());
  const [sweeping, setSweeping] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedIdea, setExpandedIdea] = useState<string | null>(null);
  const [sortByRoi, setSortByRoi] = useState(false);
  const [restoringSession, setRestoringSession] = useState(true);
  const [admins, setAdmins] = useState<AdminSummary[] | null>(null);
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [addResult, setAddResult] = useState<AddAdminResult | null>(null);

  const orgLocked = Boolean(config.organization);

  const client = useMemo(
    () => new AdminClient(config.apiUrl, config.iamUrl),
    [config.apiUrl, config.iamUrl]
  );

  // Refresh survival: the better-auth session cookie outlives both the page
  // and the short-lived JWT, so re-mint a token from it on mount instead of
  // bouncing back to the sign-in form.
  useEffect(() => {
    client
      .restoreSession()
      .then((restored) => {
        if (restored) setToken(restored);
      })
      .finally(() => setRestoringSession(false));
  }, [client]);

  useEffect(() => {
    if (token) {
      setIdeas(null);
      client
        .listIdeas(token, orgFilter || undefined, decrypted)
        .catch(async (e) => {
          // Expired JWT with a live session: silently re-mint and retry once.
          const fresh = await client.restoreSession();
          if (!fresh) throw e;
          setToken(fresh);
          return client.listIdeas(fresh, orgFilter || undefined, decrypted);
        })
        .then((result) => {
          setIdeas(result);
          // The filter dropdown is built from the unfiltered listing so
          // narrowing to one org doesn't collapse the other options.
          if (!orgLocked && !orgFilter) {
            const seen = new Map<string, string>();
            for (const idea of result) {
              seen.set(idea.organizationId, idea.organizationName);
            }
            setAllOrgs([...seen.entries()]);
          }
        })
        .catch((e) => setError(e.message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, token, orgFilter]);

  useEffect(() => {
    if (token && tab === 'admins' && !admins) {
      client
        .listAdmins(token)
        .then(setAdmins)
        .catch((e) => setError(e.message));
    }
  }, [client, token, tab, admins]);

  const decryptPhi = async () => {
    if (!token) return;
    setRevealing(true);
    setError(null);
    try {
      const result = await client.listIdeas(
        token,
        orgFilter || undefined,
        true
      );
      setIdeas(result);
      setDecrypted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Decryption failed');
    } finally {
      setRevealing(false);
    }
  };

  const sealPhi = async () => {
    if (!token) return;
    setDecrypted(false);
    setExpanded(null);
    setIdeas(null);
    try {
      setIdeas(await client.listIdeas(token, orgFilter || undefined, false));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reload failed');
    }
  };

  const applyScore = (ideaId: string, roiScore: RoiScore) => {
    setIdeas((current) =>
      current
        ? current.map((i) => (i.id === ideaId ? { ...i, roiScore } : i))
        : current
    );
  };

  const scoreOne = async (idea: AdminIdea) => {
    if (!token) return;
    setScoring((s) => new Set(s).add(idea.id));
    setError(null);
    try {
      applyScore(
        idea.id,
        await client.scoreIdeaRoi(token, idea.id, idea.organizationId)
      );
      setExpanded(idea.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ROI scoring failed');
    } finally {
      setScoring((s) => {
        const next = new Set(s);
        next.delete(idea.id);
        return next;
      });
    }
  };

  // Scores sequentially: each call is an LLM analysis, and hammering the
  // endpoint in parallel mostly earns rate limits, not speed.
  const scoreAllUnscored = async () => {
    if (!token || !ideas) return;
    setSweeping(true);
    setError(null);
    try {
      for (const idea of ideas.filter((i) => !i.roiScore)) {
        setScoring((s) => new Set(s).add(idea.id));
        try {
          applyScore(
            idea.id,
            await client.scoreIdeaRoi(token, idea.id, idea.organizationId)
          );
        } finally {
          setScoring((s) => {
            const next = new Set(s);
            next.delete(idea.id);
            return next;
          });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ROI scoring failed');
    } finally {
      setSweeping(false);
    }
  };

  const addAdmin = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    setAddResult(null);
    try {
      const result = await client.addAdmin(token, {
        email: newAdminEmail,
        name: newAdminName
      });
      setAddResult(result);
      setNewAdminEmail('');
      setNewAdminName('');
      setAdmins(null); // refetch
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add administrator');
    } finally {
      setBusy(false);
    }
  };

  const visibleIdeas = useMemo(() => {
    if (!ideas) return ideas;
    if (!sortByRoi || !decrypted) return ideas;
    return [...ideas].sort(
      (a, b) => (b.roiScore?.roiIndex ?? -1) - (a.roiScore?.roiIndex ?? -1)
    );
  }, [ideas, sortByRoi, decrypted]);

  const unscoredCount = ideas?.filter((i) => !i.roiScore).length ?? 0;

  const branding = {
    institution:
      config.branding?.institution ??
      config.organization?.displayName ??
      'Ideas Program',
    portalName: config.branding?.portalName ?? 'Admin Console',
    tagline:
      config.branding?.tagline ??
      (config.organization
        ? `Ideas program administration for ${config.organization.displayName}`
        : 'Consolidated ideas waitlist across all member organizations')
  };

  const colSpan = orgLocked ? 5 : 6;

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
        {!token && restoringSession ? (
          <div className="card" style={{ maxWidth: 460, margin: '2rem auto' }}>
            <p className="meta">Restoring your session…</p>
          </div>
        ) : !token ? (
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
          <>
            <div className="tabs admin-tabs">
              <button
                className={tab === 'ideas' ? 'active' : ''}
                onClick={() => setTab('ideas')}
              >
                Ideas
              </button>
              <button
                className={tab === 'admins' ? 'active' : ''}
                onClick={() => setTab('admins')}
              >
                Administrators
              </button>
              <button
                className="admin-signout"
                onClick={async () => {
                  await client.logout();
                  setToken(null);
                  setIdeas(null);
                  setDecrypted(false);
                  setAdmins(null);
                }}
              >
                Sign out
              </button>
            </div>

            {tab === 'ideas' ? (
              <div className="card">
                <div className="admin-toolbar">
                  <h2 style={{ margin: 0 }}>Ideas waitlist</h2>
                  <div className="admin-toolbar-actions">
                    {decrypted ? (
                      <>
                        <button
                          className="secondary"
                          disabled={sweeping || unscoredCount === 0}
                          onClick={scoreAllUnscored}
                          title="AI-score every unscored idea on the administrator ROI axes"
                        >
                          {sweeping
                            ? 'Scoring…'
                            : unscoredCount === 0
                              ? 'All ideas scored'
                              : `Score ROI for ${unscoredCount} unscored`}
                        </button>
                        <label className="admin-sort">
                          <input
                            type="checkbox"
                            checked={sortByRoi}
                            onChange={(e) => setSortByRoi(e.target.checked)}
                          />
                          Sort by ROI
                        </label>
                        <button className="secondary" onClick={sealPhi}>
                          Re-seal PHI
                        </button>
                      </>
                    ) : (
                      <button
                        className="primary"
                        disabled={revealing || !ideas?.length}
                        onClick={decryptPhi}
                      >
                        {revealing ? 'Decrypting…' : '🔓 Decrypt PHI'}
                      </button>
                    )}
                    {!orgLocked && (
                      <select
                        value={orgFilter}
                        onChange={(e) => {
                          setOrgFilter(e.target.value);
                          setDecrypted(false);
                        }}
                        aria-label="Filter by organization"
                      >
                        <option value="">All organizations</option>
                        {allOrgs.map(([slug, name]) => (
                          <option key={slug} value={slug}>
                            {name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                <p className="meta" style={{ marginTop: '0.35rem' }}>
                  {decrypted ? (
                    <>
                      PHI decrypted for this session with the per-tenant key.
                      ROI scoring analyzes each idea on the three axes
                      administrators fund against: length-of-stay reduction,
                      throughput improvement, and patient satisfaction.
                    </>
                  ) : (
                    <>
                      Submissions are shown exactly as they rest in the
                      database — AES-256-GCM ciphertext under each
                      organization&apos;s tenant key. Decrypt to review PHI and
                      run ROI scoring.
                    </>
                  )}
                </p>
                {error && <div className="error">{error}</div>}
                {revealing && (
                  <AiThinking
                    label="Decrypting PHI"
                    lines={[
                      'Deriving the tenant key…',
                      'Decrypting submissions…',
                      'Almost there…'
                    ]}
                  />
                )}
                {(sweeping || scoring.size > 0) && (
                  <AiThinking
                    label={
                      sweeping
                        ? `Scoring ROI with AI (${scoring.size} in flight)`
                        : 'Scoring ROI with AI'
                    }
                    lines={[
                      'Reading the submission…',
                      'Estimating length-of-stay impact…',
                      'Estimating throughput impact…',
                      'Estimating patient-satisfaction impact…',
                      'Writing validation steps…',
                      'Almost there…'
                    ]}
                  />
                )}
                {!visibleIdeas ? (
                  <p className="meta">Loading…</p>
                ) : visibleIdeas.length === 0 ? (
                  <p className="meta">No ideas submitted yet.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Idea</th>
                        {!orgLocked && <th>Organization</th>}
                        <th>Submitted by</th>
                        <th>NDA</th>
                        <th>ROI</th>
                        <th>Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleIdeas.map((idea) => {
                        const roi = idea.roiScore;
                        const isScoring = scoring.has(idea.id);
                        const isOpen = expanded === idea.id;
                        const isIdeaOpen = expandedIdea === idea.id;
                        return [
                          <tr key={idea.id}>
                            <td>
                              <button
                                className="idea-expand"
                                onClick={() =>
                                  setExpandedIdea(isIdeaOpen ? null : idea.id)
                                }
                                title={
                                  isIdeaOpen
                                    ? 'Collapse the full idea'
                                    : 'Read the full idea'
                                }
                              >
                                {decrypted && idea.title ? (
                                  <>
                                    <strong>
                                      <ScrambleText text={idea.title} />
                                    </strong>
                                    <div className="meta admin-body">
                                      <ScrambleText text={idea.body ?? ''} />
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <Cipher value={idea.stored.title} />
                                    <div className="admin-body">
                                      <Cipher value={idea.stored.body} />
                                    </div>
                                  </>
                                )}
                                <span className="meta idea-expand-hint">
                                  {isIdeaOpen ? '▾ collapse' : '▸ read full idea'}
                                </span>
                              </button>
                            </td>
                            {!orgLocked && (
                              <td>
                                <span className="badge gold" style={{ marginLeft: 0 }}>
                                  {idea.organizationName}
                                </span>
                              </td>
                            )}
                            <td>
                              {decrypted && idea.doctorName ? (
                                <>
                                  <ScrambleText text={idea.doctorName} />
                                  <div className="meta">
                                    {idea.doctorEmail}
                                    {idea.doctorDepartment ? ` · ${idea.doctorDepartment}` : ''}
                                  </div>
                                </>
                              ) : (
                                <Cipher value={idea.stored.doctorName} />
                              )}
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
                            <td className="roi-cell">
                              {!decrypted ? (
                                idea.stored.roiScore ? (
                                  <Cipher value={idea.stored.roiScore.slice(0, 24)} />
                                ) : (
                                  <span className="meta">—</span>
                                )
                              ) : roi ? (
                                <>
                                  <button
                                    className="roi-index"
                                    onClick={() => setExpanded(isOpen ? null : idea.id)}
                                    title="Show the full ROI breakdown"
                                  >
                                    <span className={`score ${tier(roi.roiIndex)}`}>
                                      {roi.roiIndex}
                                    </span>
                                    <span className="meta">/100 {isOpen ? '▾' : '▸'}</span>
                                  </button>
                                  <div className="roi-minis">
                                    {roi.dimensions.map((d) => (
                                      <span key={d.key} className="meta roi-mini">
                                        {ROI_AXIS_SHORT[d.key] ?? d.name}{' '}
                                        <b className={`score ${tier(d.score)}`}>{d.score}</b>
                                      </span>
                                    ))}
                                  </div>
                                  <button
                                    className="secondary small"
                                    disabled={isScoring || sweeping}
                                    onClick={() => scoreOne(idea)}
                                  >
                                    {isScoring ? 'Scoring…' : 'Re-score'}
                                  </button>
                                </>
                              ) : (
                                <button
                                  className="secondary small"
                                  disabled={isScoring || sweeping}
                                  onClick={() => scoreOne(idea)}
                                >
                                  {isScoring ? 'Scoring…' : 'Score ROI'}
                                </button>
                              )}
                            </td>
                            <td className="meta">{new Date(idea.submittedAt).toLocaleString()}</td>
                          </tr>,
                          isIdeaOpen ? (
                            <tr key={`${idea.id}-full`} className="idea-full-row">
                              <td colSpan={colSpan}>
                                {decrypted && idea.title ? (
                                  <div className="idea-full">
                                    <h3>{idea.title}</h3>
                                    <p className="idea-full-body">{idea.body}</p>
                                    <p className="meta">
                                      Submitted by {idea.doctorName} (
                                      {idea.doctorEmail}
                                      {idea.doctorDepartment
                                        ? ` · ${idea.doctorDepartment}`
                                        : ''}
                                      ) · {new Date(idea.submittedAt).toLocaleString()}
                                    </p>
                                  </div>
                                ) : (
                                  <div className="idea-full">
                                    <p className="meta">
                                      Full at-rest ciphertext — decrypt PHI to
                                      read the idea.
                                    </p>
                                    <p className="vault-value idea-full-cipher">
                                      {idea.stored.title}
                                    </p>
                                    <p className="vault-value idea-full-cipher">
                                      {idea.stored.body}
                                    </p>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ) : null,
                          decrypted && roi && isOpen ? (
                            <tr key={`${idea.id}-roi`} className="roi-detail-row">
                              <td colSpan={colSpan}>
                                <div className="roi-detail">
                                  <p className="roi-summary">{roi.summary}</p>
                                  <div className="roi-grid">
                                    {roi.dimensions.map((d) => (
                                      <div key={d.key} className="roi-dimension">
                                        <div className="score-row">
                                          <span className={`score ${tier(d.score)}`}>{d.score}</span>
                                          <span className="meta">/100</span>
                                          <strong style={{ marginLeft: '0.35rem' }}>{d.name}</strong>
                                        </div>
                                        <div className="score-bar">
                                          <div
                                            className={`score-bar-fill ${tier(d.score)}`}
                                            style={{ width: `${d.score}%` }}
                                          />
                                        </div>
                                        <p className="meta">{d.rationale}</p>
                                        <p className="roi-validate-label">Validate before funding</p>
                                        <ul className="roi-validate">
                                          {d.validationSteps.map((step) => (
                                            <li key={step}>{step}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    ))}
                                  </div>
                                  <p className="meta">
                                    Scored by {roi.generatedBy} ·{' '}
                                    {new Date(roi.scoredAt).toLocaleString()}
                                  </p>
                                </div>
                              </td>
                            </tr>
                          ) : null
                        ];
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              <div className="card" style={{ maxWidth: 720 }}>
                <h2>Administrators</h2>
                <p className="meta">
                  People on this list can sign in to any organization&apos;s
                  admin surface, decrypt PHI, and run ROI scoring.
                </p>
                {error && <div className="error">{error}</div>}
                {!admins ? (
                  <p className="meta">Loading…</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Added</th>
                      </tr>
                    </thead>
                    <tbody>
                      {admins.map((a) => (
                        <tr key={a.email}>
                          <td>{a.name}</td>
                          <td>{a.email}</td>
                          <td>
                            <span className="badge gold" style={{ marginLeft: 0 }}>
                              {a.role}
                            </span>
                          </td>
                          <td className="meta">{new Date(a.addedAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <h3 style={{ marginTop: '1.4rem' }}>Add an administrator</h3>
                <label>Name</label>
                <input
                  value={newAdminName}
                  onChange={(e) => setNewAdminName(e.target.value)}
                  placeholder="Jordan Rivera"
                />
                <label>Email</label>
                <input
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="jordan@hospital.org"
                />
                <button
                  className="primary"
                  disabled={busy || !newAdminName || !newAdminEmail}
                  onClick={addAdmin}
                  style={{ marginTop: '0.7rem' }}
                >
                  {busy ? 'Adding…' : 'Add to admin list'}
                </button>
                {addResult && (
                  <div className="admin-invite">
                    {addResult.created && addResult.temporaryPassword ? (
                      <>
                        <strong>{addResult.email}</strong> was provisioned. Their
                        one-time temporary password is{' '}
                        <code className="vault-value admin-temp-pass">
                          {addResult.temporaryPassword}
                        </code>{' '}
                        — share it securely; it is shown only once, and they
                        should change it after first sign-in.
                      </>
                    ) : (
                      <>
                        <strong>{addResult.email}</strong> already had an
                        account and is now on the admin list.
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
