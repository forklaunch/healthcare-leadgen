import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PortalClient,
  type EvaluationFocus,
  type IdeaEvaluation,
  type ProfileMe,
  type StorageInspector
} from './api';
import { themeStyle, type PortalConfig } from './config';
import { ScrambleText } from './scramble';
import { EncryptionShowcase } from './showcase';

type Tab = 'submit' | 'how';

const KEY_STORAGE = 'ideas-portal-access-key';

function useAccessKey(): [string | null, (k: string | null) => void] {
  const [key, setKeyState] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const fromLink = params.get('key');
    if (fromLink) {
      sessionStorage.setItem(KEY_STORAGE, fromLink);
      // Strip the key from the address bar so it isn't shoulder-surfable
      window.history.replaceState({}, '', window.location.pathname);
      return fromLink;
    }
    return sessionStorage.getItem(KEY_STORAGE);
  });
  const setKey = (k: string | null) => {
    if (k) sessionStorage.setItem(KEY_STORAGE, k);
    else sessionStorage.removeItem(KEY_STORAGE);
    setKeyState(k);
  };
  return [key, setKey];
}

function scoreClass(score: number): string {
  if (score >= 70) return 'high';
  if (score >= 45) return 'mid';
  return 'low';
}

function RequestAccessCard({
  client,
  config,
  onDone
}: {
  client: PortalClient;
  config: PortalConfig;
  onDone: (msg: string) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="card">
      <h2>Request portal access</h2>
      <p>
        Enter your details and we will email you a secure access link. The
        link is your key to the portal — no password required.
      </p>
      <label>Full name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith, RN" />
      <label>{config.organization.displayName} email</label>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={config.branding.emailPlaceholder ?? 'you@hospital.org'}
      />
      <label>Department (optional)</label>
      <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Cardiology" />
      <button
        className="primary"
        disabled={busy || !name || !email}
        onClick={async () => {
          setBusy(true);
          try {
            const msg = await client.requestAccess({
              name,
              email,
              department: department || undefined
            });
            onDone(msg);
          } finally {
            setBusy(false);
          }
        }}
      >
        Email me a secure access link
      </button>
    </div>
  );
}

function NdaGate({
  client,
  config,
  accessKey,
  me,
  onAccepted
}: {
  client: PortalClient;
  config: PortalConfig;
  accessKey: string;
  me: ProfileMe;
  onAccepted: () => void;
}) {
  const [nda, setNda] = useState<{ version: string; ndaText: string } | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    client.getNda().then(setNda);
  }, [client]);

  return (
    <div className="card">
      <h2>Mutual Non-Disclosure Agreement</h2>
      <p>
        Before submitting ideas, the mutual NDA must be executed. You sign by
        accepting below; {config.organization.displayName} counter-signs
        automatically, and both execution timestamps are retained.
      </p>
      {nda ? <div className="nda-text">{nda.ndaText}</div> : <p className="meta">Loading agreement…</p>}
      <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '1rem', textTransform: 'none', letterSpacing: 0, fontSize: '0.95rem' }}>
        <input
          type="checkbox"
          style={{ width: 'auto' }}
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
        />
        I, {me.name}, have read the agreement and execute it on my own behalf.
      </label>
      <button
        className="primary"
        disabled={!agree || busy || !nda}
        onClick={async () => {
          setBusy(true);
          try {
            await client.acceptNda(accessKey);
            onAccepted();
          } finally {
            setBusy(false);
          }
        }}
      >
        I Accept — execute mutual NDA
      </button>
    </div>
  );
}

function SubmitTab({
  client,
  config,
  accessKey,
  me,
  refreshMe
}: {
  client: PortalClient;
  config: PortalConfig;
  accessKey: string | null;
  me: ProfileMe | null;
  refreshMe: () => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<IdeaEvaluation | null>(null);
  const [prevScores, setPrevScores] = useState<Record<string, number> | null>(null);
  const [focus, setFocus] = useState<EvaluationFocus | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [improving, setImproving] = useState<EvaluationFocus | null>(null);
  const [changes, setChanges] = useState<string[] | null>(null);
  const [evaluatedDraft, setEvaluatedDraft] = useState<{ title: string; body: string } | null>(null);

  if (!accessKey || !me) {
    return (
      <>
        <section className="hero">
          <p className="eyebrow">
            {config.branding.heroEyebrow ??
              `${config.organization.displayName} · Clinical Innovation Program`}
          </p>
          <h2>
            Your clinical insight, <em>built</em> into real software.
          </h2>
          <p className="lede">
            Pitch the fix your unit needs — open to every healthcare
            professional. Ideas are sharpened by BAA-covered AI, protected by
            a mutual NDA, and sealed with hospital-grade encryption — and the
            top seven get built by ForkLaunch engineers.
          </p>
          <div className="stat-row">
            <span className="stat-chip maroon">AES-256-GCM at rest</span>
            <span className="stat-chip">Mutual NDA before anything is read</span>
            <span className="stat-chip">AI scoring under the Azure BAA</span>
            <span className="stat-chip maroon">Top 7 ideas get built</span>
          </div>
        </section>
        {flash && <div className="notice ok" style={{ marginBottom: '1rem' }}>{flash}</div>}
        <RequestAccessCard client={client} config={config} onDone={setFlash} />
        <EncryptionShowcase />
      </>
    );
  }

  if (!me.ndaAccepted) {
    return (
      <NdaGate
        client={client}
        config={config}
        accessKey={accessKey}
        me={me}
        onAccepted={refreshMe}
      />
    );
  }

  const runEvaluation = async (focusKey: EvaluationFocus | null) => {
    setEvaluating(true);
    setError(null);
    try {
      const result = await client.evaluateIdea(accessKey, {
        title,
        body,
        focus: focusKey ?? undefined
      });
      setPrevScores(
        evaluation
          ? Object.fromEntries(evaluation.dimensions.map((d) => [d.key, d.score]))
          : null
      );
      setEvaluation(result);
      setEvaluatedDraft({ title, body });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Evaluation failed');
    } finally {
      setEvaluating(false);
    }
  };

  /**
   * Focus on a dimension: the AI rewrites the draft to address that
   * dimension's feedback, the box updates, and the draft is re-scored.
   * Retries once if the focused score didn't improve.
   */
  const focusAndImprove = async (dimKey: EvaluationFocus) => {
    if (!evaluation) return;
    setFocus(dimKey);
    setImproving(dimKey);
    setError(null);
    const baseline = Object.fromEntries(
      evaluation.dimensions.map((d) => [d.key, d.score])
    );
    try {
      let draft = { title, body };
      let currentEval = evaluation;
      for (let attempt = 0; attempt < 2; attempt++) {
        const dim = currentEval.dimensions.find((d) => d.key === dimKey);
        if (!dim) break;
        const refined = await client.refineIdea(accessKey, {
          ...draft,
          focus: dimKey,
          feedback: [dim.summary, ...dim.actionableFeedback]
        });
        draft = { title: refined.title, body: refined.body };
        setTitle(refined.title);
        setBody(refined.body);
        setChanges(refined.changes);
        const newEval = await client.evaluateIdea(accessKey, {
          ...draft,
          focus: dimKey
        });
        setPrevScores(baseline);
        setEvaluation(newEval);
        setEvaluatedDraft(draft);
        const newScore =
          newEval.dimensions.find((d) => d.key === dimKey)?.score ?? 0;
        if (newScore > baseline[dimKey]) break;
        currentEval = newEval;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Draft improvement failed');
    } finally {
      setImproving(null);
    }
  };

  const aiBusy = evaluating || improving !== null;

  const draftStale =
    evaluation !== null &&
    evaluatedDraft !== null &&
    (evaluatedDraft.title !== title || evaluatedDraft.body !== body);

  return (
    <>
      <div className="card">
        <h2>
          Submit an idea
          <span className="badge ok">NDA executed ({me.acceptedNdaVersion})</span>
        </h2>
        <label>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="One-line summary" />
        <label>Describe your idea</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What problem does it solve? Who benefits? Include clinical context as needed — submissions are stored under PHI safeguards."
        />
        <p className="notice ok" style={{ marginTop: '1rem' }}>
          <strong>🛡️ BAA-protected AI.</strong> Before submitting, you can have
          your draft scored by our AI evaluator. It runs on an Azure AI
          Foundry endpoint covered by a Business Associate Agreement (BAA), so
          it is held to the same HIPAA safeguards as the rest of this portal:
          your draft is encrypted in transit, is never used to train models,
          and is not retained by the AI provider. Nothing is stored in the
          portal until you press Submit.
        </p>
        {changes && changes.length > 0 && (
          <div className="notice" style={{ marginTop: '1rem' }}>
            <strong>The AI revised your draft.</strong> Review and edit it
            freely — it's still your idea. What changed:
            <ul className="feedback" style={{ marginBottom: 0 }}>
              {changes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}
        {error && <div className="error">{error}</div>}
        <div className="btn-row">
          <button
            className="primary"
            disabled={aiBusy || busy || !title || !body}
            onClick={() => void runEvaluation(focus)}
          >
            {evaluating
              ? 'Evaluating…'
              : evaluation
                ? 'Re-evaluate with AI'
                : 'Get AI evaluation'}
          </button>
          <button
            className={evaluation ? 'primary' : 'secondary'}
            disabled={busy || aiBusy || !title || !body}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await client.submitIdea(accessKey, { title, body });
                setTitle('');
                setBody('');
                setEvaluation(null);
                setPrevScores(null);
                setFocus(null);
                setChanges(null);
                setEvaluatedDraft(null);
                refreshMe();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Submission failed');
              } finally {
                setBusy(false);
              }
            }}
          >
            Submit idea
          </button>
        </div>
      </div>
      {evaluation && (
        <div className="card">
          <h2>
            AI evaluation
            <span className="badge">{evaluation.generatedBy}</span>
            <span className="badge ok">BAA-covered</span>
          </h2>
          <p>{evaluation.summary}</p>
          {draftStale && (
            <p className="notice warn">
              You've edited your draft since this evaluation — re-evaluate to
              refresh the scores.
            </p>
          )}
          <div className="eval-grid">
            {evaluation.dimensions.map((dim) => {
              const prev = prevScores?.[dim.key];
              const delta = prev !== undefined ? dim.score - prev : null;
              const focused = focus === dim.key;
              return (
                <div key={dim.key} className={`eval-card${focused ? ' focused' : ''}`}>
                  <h3>{dim.name}</h3>
                  <div className="score-row">
                    <span className={`score ${scoreClass(dim.score)}`}>{dim.score}</span>
                    <span className="meta">/ 100</span>
                    {delta !== null && delta !== 0 && (
                      <span className={`delta ${delta > 0 ? 'up' : 'down'}`}>
                        {delta > 0 ? `▲ +${delta}` : `▼ ${delta}`}
                      </span>
                    )}
                  </div>
                  <div className="score-bar">
                    <div
                      className={`score-bar-fill ${scoreClass(dim.score)}`}
                      style={{ width: `${dim.score}%` }}
                    />
                  </div>
                  <p className="meta">{dim.summary}</p>
                  {dim.actionableFeedback.length > 0 && (
                    <ul className="feedback">
                      {dim.actionableFeedback.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  )}
                  <button
                    className={focused ? 'primary' : 'secondary'}
                    disabled={aiBusy}
                    onClick={() => void focusAndImprove(dim.key)}
                  >
                    {improving === dim.key
                      ? 'Improving your draft…'
                      : focused
                        ? 'Improve again'
                        : 'Focus on this'}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="meta" style={{ marginTop: '1rem' }}>
            Pick a dimension to focus on and the AI will rewrite your draft to
            address that dimension's feedback and raise its score. Review the
            revision, edit as you like, and repeat until you're satisfied —
            then submit.
          </p>
        </div>
      )}
      <div className="card">
        <h2>Your submissions</h2>
        {me.ideas.length === 0 ? (
          <p className="meta">Nothing submitted yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Title</th><th>Status</th><th>Submitted</th></tr>
            </thead>
            <tbody>
              {me.ideas.map((idea) => (
                <tr key={idea.id}>
                  <td>{idea.title}</td>
                  <td>{idea.status.replace('_', ' ')}</td>
                  <td className="meta">{new Date(idea.submittedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function StorageInspectorCard({
  client,
  accessKey
}: {
  client: PortalClient;
  accessKey: string;
}) {
  const [data, setData] = useState<StorageInspector | null>(null);
  const [decrypted, setDecrypted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    client.getStorageInspector(accessKey, false).then(setData);
  }, [client, accessKey]);

  if (!data) return null;

  return (
    <div className="card demo-card">
      <h2>
        See it for yourself: your record, as it actually sits in storage
        <span className="badge gold">live from Postgres</span>
      </h2>
      <p>
        This is a live look at <em>your own record</em> in our database, right
        now. Everything marked <span className="badge warn">phi</span> is
        sealed with hospital-grade encryption ({data.algorithm}) before it's
        written down — the scrambled text below is genuinely all that exists
        on disk, and all anyone without a key would ever see. Your emailed
        access key is what unseals it.
      </p>
      <button
        className="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const d = await client.getStorageInspector(accessKey, !decrypted);
          setData(d);
          setDecrypted(!decrypted);
          setBusy(false);
        }}
      >
        {decrypted ? '🔒 Re-lock (show ciphertext only)' : '🔑 Decrypt with your access key'}
      </button>
      {data.sections.map((section) => (
        <div key={section.table}>
          <h3>
            {section.entity}
            <span className="badge">table: {section.table}</span>
            {section.rowCount > 1 && (
              <span className="badge">{section.rowCount} rows (latest shown)</span>
            )}
          </h3>
          <table>
            <thead>
              <tr>
                <th>Column</th>
                <th>Class</th>
                <th>Stored in Postgres</th>
                {decrypted && <th>Decrypted</th>}
              </tr>
            </thead>
            <tbody>
              {section.fields.map((f) => (
                <tr key={f.column}>
                  <td><code>{f.column}</code></td>
                  <td>
                    <span className={`badge ${f.encrypted ? 'warn' : ''}`}>
                      {f.classification}
                    </span>
                  </td>
                  <td className="cipher">
                    {f.stored}
                    {f.note && <div className="meta">{f.note}</div>}
                  </td>
                  {decrypted && (
                    <td>
                      {f.decrypted !== undefined ? (
                        <ScrambleText text={f.decrypted} />
                      ) : (
                        <span className="meta">n/a — plaintext already</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function HowItWorksTab({
  client,
  config,
  me,
  accessKey
}: {
  client: PortalClient;
  config: PortalConfig;
  me: ProfileMe | null;
  accessKey: string | null;
}) {
  const org = config.organization.displayName;
  return (
    <>
      {me && accessKey && (
        <>
          <div className="card">
            <h2>
              Welcome back, {me.name}
              {me.ndaAccepted ? (
                <span className="badge ok">NDA executed</span>
              ) : (
                <span className="badge warn">NDA pending</span>
              )}
            </h2>
            <dl className="kv">
              <dt>Email</dt>
              <dd>{me.email}</dd>
              <dt>Organization</dt>
              <dd>{me.organizationName}</dd>
              <dt>Department</dt>
              <dd>{me.department ?? '—'}</dd>
              <dt>Access key expires</dt>
              <dd>{new Date(me.keyExpiresAt).toLocaleString()}</dd>
              <dt>Ideas submitted</dt>
              <dd>{me.ideas.length}</dd>
            </dl>
          </div>
          <StorageInspectorCard client={client} accessKey={accessKey} />
        </>
      )}
      <div className="card">
        <h2>How your ideas are protected</h2>
        <p className="notice warn">
          <strong>Note: this portal is a HIPAA simulation.</strong> It
          demonstrates how PHI-grade safeguards work by treating your name,
          email, and ideas as if they were protected health information. It
          is a demonstration, not a HIPAA-covered production system — please
          don't submit real patient information.
        </p>
        <p>
          This portal treats your identity and your ideas with the same care
          as protected health information (PHI). It runs on{' '}
          <a href="https://forklaunch.com" target="_blank" rel="noreferrer">
            ForkLaunch
          </a>
          , a platform where the safeguards are built into the software
          itself — they run automatically on every submission, not as a
          policy someone has to remember to follow. In plain terms:
        </p>
        <ol className="steps">
          <li>
            <strong>Everything is labeled before it's stored.</strong> Like
            specimen labeling in a lab, every piece of information must be
            tagged with its sensitivity level before the system will accept
            it. Software that skips the label simply won't run.
          </li>
          <li>
            <strong>Your information is sealed before it's written down.</strong>{' '}
            Anything sensitive — your name, your email, your idea — is
            encrypted the moment it's saved. Someone who stole the database
            would see only scrambled text. You don't have to take our word
            for it: with your access key, you can see your own record in its
            sealed form above, and unseal it yourself.
          </li>
          <li>
            <strong>We can find your chart without opening it.</strong> The
            system locates your record using a one-way digital fingerprint of
            your email, so routine lookups never unseal your identity.
          </li>
          <li>
            <strong>Every door has a badge check.</strong> Each part of the
            system declares who may enter — you with your emailed key, program
            administrators with their login, and no one else. The admin view
            of the waitlist is restricted to authorized staff.
          </li>
          <li>
            <strong>Even the AI works under hospital rules.</strong> The AI
            that scores and refines your drafts runs on our Azure AI Foundry
            endpoint, covered by Microsoft's Azure Business Associate
            Agreement (BAA) — the same class of HIPAA contract that governs
            hospital vendors. Your draft is encrypted in transit, is never
            used to train models, and is not retained by the AI provider.
          </li>
          <li>
            <strong>Every access leaves a footprint.</strong> Like the audit
            trail on an electronic chart, every request to the system is
            logged.
          </li>
          <li>
            <strong>Records don't linger forever.</strong> After 7 years, your
            identifying information is automatically scrubbed — the system
            enforces this on its own, no calendar reminder required.
          </li>
        </ol>
        <p className="notice ok">
          <strong>And it's fast:</strong> this entire portal — encryption,
          NDA workflow, admin review, and all — was built and deployed in
          about 30 minutes on ForkLaunch. Safeguards that are automatic don't
          slow anything down.
        </p>
      </div>

      <div className="card">
        <h2>The top 7 ideas get built</h2>
        <p>
          This isn't a suggestion box. The top seven ideas from the waitlist
          will be built into working software by a team of{' '}
          <strong>ForkLaunch builders</strong> — engineers from{' '}
          <strong>Microsoft</strong>, <strong>Y Combinator</strong> companies,{' '}
          <strong>UChicago CS</strong>, <strong>Cisco</strong>, and{' '}
          <strong>Columbia</strong>, among others. Your clinical insight,
          their engineering — on the same compliance-enforced platform this
          portal runs on. The program is open to every healthcare
          professional at {org}, not only physicians.
        </p>
      </div>

      {!(me && accessKey) && (
        <>
          <EncryptionShowcase />
          <p className="notice">
            Have a secure access link? Open it from your email and come back to
            this tab — you'll see your own records exactly as they sit in the
            database, encrypted, with a key to decrypt them yourself.
          </p>
        </>
      )}
    </>
  );
}

/**
 * The complete Ideas Portal for one customer organization. Drop into a
 * per-customer frontend with that customer's config:
 *
 *   <PortalApp config={{ apiUrl, organization, branding, theme }} />
 */
export function PortalApp({ config }: { config: PortalConfig }) {
  const [tab, setTab] = useState<Tab>('submit');
  const [accessKey] = useAccessKey();
  const [me, setMe] = useState<ProfileMe | null>(null);

  const client = useMemo(
    () => new PortalClient(config.apiUrl, config.organization.slug),
    [config.apiUrl, config.organization.slug]
  );

  const refreshMe = useCallback(() => {
    if (accessKey) client.getMe(accessKey).then(setMe);
  }, [accessKey, client]);

  useEffect(refreshMe, [refreshMe]);

  return (
    <div className="portal-root" style={themeStyle(config.theme)}>
      <header className="masthead">
        <div className="shell">
          <p className="eyebrow">{config.branding.institution}</p>
          <h1>{config.branding.portalName}</h1>
          <p>{config.branding.tagline}</p>
        </div>
      </header>
      <nav className="tabs">
        <div className="shell tabs-row">
          <button className={tab === 'submit' ? 'active' : ''} onClick={() => setTab('submit')}>
            Submit an idea
          </button>
          <button className={tab === 'how' ? 'active' : ''} onClick={() => setTab('how')}>
            How it works
            <span className="tab-dot" aria-hidden="true" title="live encryption demo" />
          </button>
        </div>
      </nav>
      <main>
        {tab === 'how' && (
          <HowItWorksTab client={client} config={config} me={me} accessKey={accessKey} />
        )}
        {tab === 'submit' && (
          <SubmitTab
            client={client}
            config={config}
            accessKey={accessKey}
            me={me}
            refreshMe={refreshMe}
          />
        )}
      </main>
    </div>
  );
}
