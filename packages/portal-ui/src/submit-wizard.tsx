import { useEffect, useRef, useState } from 'react';
import type {
  EvaluationFocus,
  IdeaEvaluation,
  PortalClient,
  ProfileMe,
  StorageSection
} from './api';
import type { PortalConfig } from './config';
import { AiThinking } from './thinking';
import { useGuidedFocus } from './focus';

/**
 * One-question-at-a-time submission flow. Each step owns the whole card,
 * advances on Enter (⌘↵ in the textarea), and auto-focuses its input, so
 * the physician is only ever looking at the single thing being asked.
 */
type StepId = 'title' | 'body' | 'evaluate' | 'confirm' | 'done';

const STEPS: Array<{ id: StepId; label: string }> = [
  { id: 'title', label: 'Your idea' },
  { id: 'body', label: 'How it works' },
  { id: 'evaluate', label: 'AI evaluation' },
  { id: 'confirm', label: 'Review & submit' },
  { id: 'done', label: 'Sealed' }
];

function tier(score: number): 'high' | 'mid' | 'low' {
  if (score >= 70) return 'high';
  if (score >= 45) return 'mid';
  return 'low';
}

export function SubmitWizard({
  client,
  config,
  accessKey,
  me,
  refreshMe,
  onSealed,
  onOpenVault
}: {
  client: PortalClient;
  config: PortalConfig;
  accessKey: string;
  me: ProfileMe;
  refreshMe: () => void;
  onSealed: (section: StorageSection) => void;
  onOpenVault: () => void;
}) {
  const [step, setStep] = useState<StepId>('title');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [improving, setImproving] = useState<EvaluationFocus | null>(null);
  const [evaluation, setEvaluation] = useState<IdeaEvaluation | null>(null);
  const [prevScores, setPrevScores] = useState<Record<string, number> | null>(
    null
  );
  const [changes, setChanges] = useState<string[] | null>(null);
  const [evaluatedDraft, setEvaluatedDraft] = useState<{
    title: string;
    body: string;
  } | null>(null);

  const titleRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  // Shared with the admin console so both portals scroll and pulse the
  // section that needs attention in exactly the same way.
  const { focusRef: cardRef } = useGuidedFocus(step);

  const index = STEPS.findIndex((s) => s.id === step);
  const aiBusy = evaluating || improving !== null;
  const draftStale =
    evaluation !== null &&
    evaluatedDraft !== null &&
    (evaluatedDraft.title !== title || evaluatedDraft.body !== body);

  // Focus the step's input once the new step has painted (the hook handles
  // scrolling the card itself into view).
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (step === 'title') titleRef.current?.focus();
      if (step === 'body') bodyRef.current?.focus();
    }, 260);
    return () => window.clearTimeout(id);
  }, [step]);

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
          ? Object.fromEntries(
              evaluation.dimensions.map((d) => [d.key, d.score])
            )
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

  /** Rewrite the draft to lift one lens, then re-score it. */
  const focusAndImprove = async (dimKey: EvaluationFocus) => {
    if (!evaluation) return;
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

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await client.submitIdea(accessKey, { title, body });
      refreshMe();
      const inspector = await client.getStorageInspector(accessKey, false);
      const ideaSection = inspector?.sections.find((s) => s.table === 'idea');
      setStep('done');
      if (ideaSection) onSealed(ideaSection);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    setTitle('');
    setBody('');
    setEvaluation(null);
    setPrevScores(null);
    setChanges(null);
    setEvaluatedDraft(null);
    setError(null);
    setStep('title');
  };

  const goToEvaluate = () => {
    setStep('evaluate');
    if (!evaluation || draftStale) void runEvaluation(null);
  };

  const weakest = evaluation
    ? [...evaluation.dimensions].sort((a, b) => a.score - b.score)[0]
    : null;
  const average = evaluation
    ? Math.round(
        evaluation.dimensions.reduce((s, d) => s + d.score, 0) /
          evaluation.dimensions.length
      )
    : 0;

  return (
    <div className="wizard" ref={cardRef}>
      <div className="wizard-progress" aria-hidden="true">
        <div
          className="wizard-progress-fill"
          style={{ width: `${((index + 1) / STEPS.length) * 100}%` }}
        />
      </div>
      <div className="wizard-meta">
        <span className="wizard-count">
          Step {index + 1} of {STEPS.length}
        </span>
        <span className="wizard-label">{STEPS[index]?.label}</span>
        <span className="badge ok">NDA executed ({me.acceptedNdaVersion})</span>
      </div>

      <div className="wizard-stage" key={step}>
        {step === 'title' && (
          <>
            <h2 className="wizard-q">What&apos;s your idea?</h2>
            <p className="wizard-help">
              One line is plenty — you&apos;ll explain how it works next.
            </p>
            <input
              ref={titleRef}
              className="wizard-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && title.trim()) setStep('body');
              }}
              placeholder="e.g. Pharmacist-led discharge medication reconciliation"
            />
            <div className="wizard-actions">
              <button
                className="primary"
                disabled={!title.trim()}
                onClick={() => setStep('body')}
              >
                Continue <span aria-hidden="true">→</span>
              </button>
              <span className="wizard-kbd">
                press <kbd>Enter</kbd>
              </span>
            </div>
          </>
        )}

        {step === 'body' && (
          <>
            <h2 className="wizard-q">How would it work?</h2>
            <p className="wizard-help">
              What problem does it solve, who benefits, and what changes day to
              day? Clinical detail is welcome — everything here is stored under
              PHI safeguards.
            </p>
            <textarea
              ref={bodyRef}
              className="wizard-textarea"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && body.trim())
                  goToEvaluate();
              }}
              placeholder="Describe the current workflow, what you would change, and what you would expect to improve…"
            />
            <div className="wizard-actions">
              <button className="secondary" onClick={() => setStep('title')}>
                <span aria-hidden="true">←</span> Back
              </button>
              <button
                className="primary"
                disabled={!body.trim()}
                onClick={goToEvaluate}
              >
                Get AI evaluation <span aria-hidden="true">→</span>
              </button>
              <span className="wizard-kbd">
                press <kbd>⌘</kbd>+<kbd>Enter</kbd>
              </span>
            </div>
          </>
        )}

        {step === 'evaluate' && (
          <>
            {evaluating && !evaluation ? (
              <>
                <h2 className="wizard-q">Scoring your idea…</h2>
                <p className="wizard-help">
                  Three lenses, 0–100 each, under Microsoft&apos;s Azure BAA.
                </p>
                <AiThinking
                  label="AI evaluation in progress"
                  lines={[
                    'Reading your draft…',
                    'Scoring study design…',
                    'Scoring commercialization potential…',
                    'Scoring operational speedup…',
                    'Writing actionable feedback…',
                    'Almost there…'
                  ]}
                />
              </>
            ) : evaluation ? (
              <>
                <h2 className="wizard-q">
                  Scored {average}
                  <span className="wizard-q-sub">/100 average</span>
                </h2>
                <p className="wizard-help">{evaluation.summary}</p>
                {improving !== null && (
                  <AiThinking
                    label="Rewriting your draft"
                    lines={[
                      'Re-reading your draft…',
                      'Working through the feedback…',
                      'Strengthening the focus area…',
                      'Almost there…'
                    ]}
                  />
                )}
                {evaluating && improving === null && (
                  <AiThinking label="Re-scoring your revised draft" />
                )}
                <div className="wizard-lenses">
                  {evaluation.dimensions.map((dim) => {
                    const prev = prevScores?.[dim.key];
                    const delta = prev !== undefined ? dim.score - prev : null;
                    return (
                      <div key={dim.key} className="wizard-lens">
                        <div className="wizard-lens-head">
                          <span className={`score ${tier(dim.score)}`}>
                            {dim.score}
                          </span>
                          <div>
                            <strong>{dim.name}</strong>
                            {delta !== null && delta !== 0 && (
                              <span
                                className={`delta ${delta > 0 ? 'up' : 'down'}`}
                              >
                                {delta > 0 ? `▲ +${delta}` : `▼ ${delta}`}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="score-bar">
                          <div
                            className={`score-bar-fill ${tier(dim.score)}`}
                            style={{ width: `${dim.score}%` }}
                          />
                        </div>
                        <p className="meta">{dim.summary}</p>
                        {dim.actionableFeedback.length > 0 && (
                          <ul className="feedback">
                            {dim.actionableFeedback.slice(0, 3).map((f, i) => (
                              <li key={i}>{f}</li>
                            ))}
                          </ul>
                        )}
                        <button
                          className="secondary small"
                          disabled={aiBusy || busy}
                          onClick={() =>
                            void focusAndImprove(dim.key as EvaluationFocus)
                          }
                        >
                          {improving === dim.key
                            ? 'Rewriting…'
                            : 'Strengthen this'}
                        </button>
                      </div>
                    );
                  })}
                </div>
                {changes && changes.length > 0 && (
                  <div className="notice">
                    <strong>The AI revised your draft.</strong> You can edit it
                    on the next step — it&apos;s still your idea. What changed:
                    <ul className="feedback" style={{ marginBottom: 0 }}>
                      {changes.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="wizard-actions">
                  <button className="secondary" onClick={() => setStep('body')}>
                    <span aria-hidden="true">←</span> Edit draft
                  </button>
                  {weakest && weakest.score < 70 && (
                    <button
                      className="secondary"
                      disabled={aiBusy || busy}
                      onClick={() =>
                        void focusAndImprove(weakest.key as EvaluationFocus)
                      }
                    >
                      Strengthen weakest ({weakest.name})
                    </button>
                  )}
                  <button
                    className="primary"
                    disabled={aiBusy || busy}
                    onClick={() => setStep('confirm')}
                  >
                    Continue <span aria-hidden="true">→</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="wizard-q">Ready when you are</h2>
                <div className="wizard-actions">
                  <button
                    className="primary"
                    onClick={() => void runEvaluation(null)}
                  >
                    Run AI evaluation <span aria-hidden="true">→</span>
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {step === 'confirm' && (
          <>
            <h2 className="wizard-q">Ready to submit?</h2>
            <p className="wizard-help">
              Edit anything below. On submit, your idea is encrypted with{' '}
              {config.organization.displayName}&apos;s own key before it
              touches disk — you&apos;ll see the ciphertext immediately.
            </p>
            <label>Title</label>
            <input
              className="wizard-input compact"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <label>Description</label>
            <textarea
              className="wizard-textarea compact"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            {draftStale && (
              <p className="notice warn">
                You&apos;ve edited since the last evaluation — scores shown
                earlier may no longer match.
              </p>
            )}
            <div className="wizard-actions">
              <button
                className="secondary"
                onClick={() => setStep('evaluate')}
              >
                <span aria-hidden="true">←</span> Back to scores
              </button>
              <button
                className="primary"
                disabled={busy || !title.trim() || !body.trim()}
                onClick={() => void submit()}
              >
                {busy ? 'Sealing…' : 'Submit sealed idea'}{' '}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <h2 className="wizard-q">Sealed and submitted ✓</h2>
            <p className="wizard-help">
              Your idea is encrypted at rest under{' '}
              {config.organization.displayName}&apos;s tenant key. Program
              administrators review it against the ROI axes they fund against —
              length of stay, throughput, and patient satisfaction.
            </p>
            <div className="wizard-actions">
              <button className="secondary" onClick={onOpenVault}>
                See it encrypted in your record
              </button>
              <button className="primary" onClick={startOver}>
                Submit another idea <span aria-hidden="true">→</span>
              </button>
            </div>
          </>
        )}
      </div>

      {error && <div className="error">{error}</div>}
    </div>
  );
}
