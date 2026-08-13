import { useEffect, useState } from 'react';

const DEFAULT_LINES = [
  'Reading the draft…',
  'Scoring against the rubric…',
  'Weighing feasibility and impact…',
  'Writing actionable feedback…',
  'Almost there…'
];

/**
 * Animated "the AI is still working" indicator: pulsing dots, a cycling
 * status line, and an elapsed-seconds counter so long model calls (15–60s)
 * never look frozen.
 */
export function AiThinking({
  label,
  lines
}: {
  label: string;
  lines?: string[];
}) {
  const statusLines = lines && lines.length > 0 ? lines : DEFAULT_LINES;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  // Advance the status line every 5s but never cycle back before the end —
  // "Almost there…" should not be followed by "Reading the draft…".
  const lineIndex = Math.min(Math.floor(tick / 5), statusLines.length - 1);

  return (
    <div className="ai-thinking" role="status" aria-live="polite">
      <span className="ai-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="ai-thinking-label">{label}</span>
      <span className="meta">
        {statusLines[lineIndex]} · {tick}s
      </span>
    </div>
  );
}
