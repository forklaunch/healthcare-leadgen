/**
 * Guided journey strip: shows where the user is in the flow and what each
 * stage gives them, GTM-validator style. `current` is 1-based; 0 renders
 * the static "how it works" preview (logged-out hero).
 */
export interface GuidedStep {
  title: string;
  detail: string;
}

export function GuidedSteps({
  steps,
  current
}: {
  steps: GuidedStep[];
  current: number;
}) {
  return (
    <ol className="guided-steps" data-preview={current === 0 || undefined}>
      {steps.map((step, i) => {
        const n = i + 1;
        const state =
          current === 0
            ? 'preview'
            : n < current
              ? 'done'
              : n === current
                ? 'active'
                : 'todo';
        return (
          <li key={step.title} className={`guided-step ${state}`}>
            <span className="guided-step-marker" aria-hidden="true">
              {state === 'done' ? '✓' : n}
            </span>
            <span className="guided-step-text">
              <strong>{step.title}</strong>
              <span className="meta">{step.detail}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export const DOCTOR_STEPS: GuidedStep[] = [
  { title: 'Draft', detail: 'Describe the problem and your fix' },
  { title: 'AI evaluation', detail: 'Scored /100 through three lenses' },
  { title: 'Strengthen', detail: 'One-click AI revisions raise weak scores' },
  { title: 'Submit sealed', detail: 'Encrypted with your hospital’s key' },
  { title: 'Review', detail: 'Program admins fund the strongest ideas' }
];

export const ADMIN_STEPS: GuidedStep[] = [
  { title: 'Decrypt', detail: 'PHI unseals only on your explicit action' },
  { title: 'Review scores', detail: 'ROI on the axes you fund against' },
  { title: 'Dig into why', detail: 'Strengths, concerns, build cost' },
  { title: 'Validate & fund', detail: 'Data pulls to run before committing' }
];
