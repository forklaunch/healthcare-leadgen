import { OpenTelemetryCollector } from '@forklaunch/core/http';
import { Metrics } from '@uchicago-ideas/monitoring';

/** The three lenses every idea is scored through. */
export const EVALUATION_DIMENSIONS = {
  studyDesign: 'Study Design',
  commercialization: 'Commercialization Potential',
  operationalSpeedup: 'Operational Speedup'
} as const;

export type EvaluationDimensionKey = keyof typeof EVALUATION_DIMENSIONS;

export interface EvaluationDimension {
  key: string;
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

export class EvaluationUnavailableError extends Error {}

const REFINE_SYSTEM_PROMPT = `You are helping a physician strengthen an early-stage innovation idea write-up for UChicago Medicine's ideas program. You are given their current draft and evaluator feedback, with one evaluation lens chosen as the focus.

Rewrite the draft so it directly addresses every feedback item, with special depth on the focus lens — the revised draft must be materially stronger there so its score increases on re-evaluation. Rules:
- Preserve the physician's original intent, clinical context, and voice. Build on their idea; do not replace it with a different one.
- Add concrete specifics (measurable endpoints, cohort definitions, workflow steps, staffing/time estimates, market and regulatory pathway) framed as proposals and plans — never fabricate existing results, data, or approvals.
- Keep it readable prose (short paragraphs or compact bullet lists), not a form.
- The title may be sharpened but must stay recognizable.

Respond with ONLY a JSON object, no markdown fences, in exactly this shape:
{
  "title": "revised title",
  "body": "revised draft description",
  "changes": ["short bullet describing each substantive addition or change", "..."]
}`;

const SYSTEM_PROMPT = `You are an innovation evaluator for UChicago Medicine's physician ideas program. Physicians submit early-stage clinical, research, and operational ideas. Evaluate each idea honestly and rigorously through exactly three lenses:

1. studyDesign — How well could this idea be turned into a rigorous study (clinical trial, QI study, retrospective analysis)? Consider testable hypotheses, endpoints, cohort feasibility, and confounders.
2. commercialization — Could this become a product, license, or venture? Consider market size, differentiation, regulatory pathway (FDA class, reimbursement), and defensibility.
3. operationalSpeedup — Would this measurably speed up or improve operations in the physician's own unit? Consider workflow fit, time saved, staffing impact, and implementation lift.

Scores are 0-100. Be a tough but fair grader: a vague one-liner should score low; a specific, feasible, differentiated idea scores high. Feedback must be concrete and actionable — things the physician can actually change in the next revision of their write-up, not generic advice.

Respond with ONLY a JSON object, no markdown fences, in exactly this shape:
{
  "summary": "2-3 sentence overall assessment of the idea",
  "dimensions": [
    { "key": "studyDesign", "score": 0, "summary": "1-2 sentence assessment", "actionableFeedback": ["specific action", "..."] },
    { "key": "commercialization", "score": 0, "summary": "...", "actionableFeedback": ["..."] },
    { "key": "operationalSpeedup", "score": 0, "summary": "...", "actionableFeedback": ["..."] }
  ]
}`;

/**
 * Scores physician ideas via an Azure AI Foundry chat-completions deployment.
 * Configure with FOUNDRY_ENDPOINT + FOUNDRY_API_KEY (+ FOUNDRY_MODEL for
 * model-router style endpoints). Without configuration (local dev), returns a
 * clearly-labeled offline sample so the portal flow stays testable — the same
 * degrade-gracefully pattern EmailService uses for a missing Resend key.
 */
export class IdeaEvaluationService {
  constructor(
    private readonly openTelemetryCollector: OpenTelemetryCollector<Metrics>,
    private readonly foundryEndpoint: string,
    private readonly foundryApiKey: string,
    private readonly foundryModel: string,
    private readonly foundryApiVersion: string
  ) {}

  evaluate = async (data: {
    title: string;
    body: string;
    focus?: string;
  }): Promise<IdeaEvaluation> => {
    const focus = this.normalizeFocus(data.focus);

    if (!this.foundryEndpoint || !this.foundryApiKey) {
      this.openTelemetryCollector.info(
        '[evaluation] FOUNDRY_ENDPOINT/FOUNDRY_API_KEY not set — returning offline sample evaluation'
      );
      return this.offlineSample(data, focus);
    }

    const raw = await this.callFoundry(this.buildUserPrompt(data, focus));
    return this.parseEvaluation(raw, focus);
  };

  /**
   * Rewrite a draft so it addresses the evaluator feedback, deepest on the
   * focused dimension. Returns the revised draft plus a change log.
   */
  refine = async (data: {
    title: string;
    body: string;
    focus: string;
    feedback: string[];
  }): Promise<IdeaRefinement> => {
    const focus = this.normalizeFocus(data.focus) ?? 'studyDesign';

    if (!this.foundryEndpoint || !this.foundryApiKey) {
      this.openTelemetryCollector.info(
        '[evaluation] FOUNDRY_ENDPOINT/FOUNDRY_API_KEY not set — returning offline sample refinement'
      );
      return this.offlineRefinement(data, focus);
    }

    const userPrompt = [
      `Focus lens: ${EVALUATION_DIMENSIONS[focus]}`,
      '',
      `Current title: ${data.title}`,
      '',
      'Current draft:',
      data.body,
      '',
      'Evaluator feedback to address:',
      ...data.feedback.map((f) => `- ${f}`)
    ].join('\n');

    const raw = await this.callFoundry(userPrompt, REFINE_SYSTEM_PROMPT);
    return this.parseRefinement(raw, data);
  };

  private normalizeFocus = (
    focus?: string
  ): EvaluationDimensionKey | undefined =>
    focus && focus in EVALUATION_DIMENSIONS
      ? (focus as EvaluationDimensionKey)
      : undefined;

  private buildUserPrompt = (
    data: { title: string; body: string },
    focus?: EvaluationDimensionKey
  ): string => {
    const parts = [
      `Idea title: ${data.title}`,
      '',
      'Idea description:',
      data.body
    ];
    if (focus) {
      parts.push(
        '',
        `The physician has chosen to focus on improving "${EVALUATION_DIMENSIONS[focus]}". ` +
          'Still score all three dimensions, but make the actionable feedback for ' +
          `"${EVALUATION_DIMENSIONS[focus]}" especially deep and step-by-step (4-6 items), ` +
          'referencing specifics from the idea. Keep the other two dimensions to 2-3 items.'
      );
    }
    return parts.join('\n');
  };

  /**
   * Calls the Foundry deployment. Accepts either a full chat-completions URL
   * or a resource base URL (both Azure OpenAI and Foundry Models formats are
   * derived automatically). Sends both auth header styles for compatibility.
   */
  private callFoundry = async (
    userPrompt: string,
    systemPrompt: string = SYSTEM_PROMPT
  ): Promise<string> => {
    const url = this.resolveUrl();
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'api-key': this.foundryApiKey,
          Authorization: `Bearer ${this.foundryApiKey}`
        },
        body: JSON.stringify({
          ...(this.foundryModel ? { model: this.foundryModel } : {}),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          // Reasoning-class models reject max_tokens/custom temperature, and
          // spend from this budget on reasoning before any visible output
          max_completion_tokens: 4000
        })
      });
    } catch (error) {
      this.openTelemetryCollector.error(
        `[evaluation] Foundry request failed: ${(error as Error).message}`
      );
      throw new EvaluationUnavailableError(
        'The AI evaluation service could not be reached'
      );
    }

    if (!response.ok) {
      const detail = await response.text();
      this.openTelemetryCollector.error(
        `[evaluation] Foundry returned ${response.status}: ${detail.slice(0, 300)}`
      );
      throw new EvaluationUnavailableError(
        'The AI evaluation service returned an error'
      );
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new EvaluationUnavailableError(
        'The AI evaluation service returned an empty response'
      );
    }
    return content;
  };

  private resolveUrl = (): string => {
    const endpoint = this.foundryEndpoint.replace(/\/+$/, '');
    if (endpoint.includes('/chat/completions')) {
      return endpoint;
    }
    if (endpoint.includes('services.ai.azure.com')) {
      return `${endpoint}/models/chat/completions?api-version=${this.foundryApiVersion}`;
    }
    if (endpoint.includes('openai.azure.com')) {
      return `${endpoint}/openai/deployments/${this.foundryModel}/chat/completions?api-version=${this.foundryApiVersion}`;
    }
    // OpenAI-compatible base URL (e.g. a gateway)
    return `${endpoint}/chat/completions`;
  };

  /** Parse the model's JSON, tolerating markdown fences and stray prose. */
  private parseEvaluation = (
    raw: string,
    focus?: EvaluationDimensionKey
  ): IdeaEvaluation => {
    let parsed: {
      summary?: string;
      dimensions?: Array<{
        key?: string;
        score?: number;
        summary?: string;
        actionableFeedback?: string[];
      }>;
    };
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start === -1 || end <= start) throw new Error('no JSON object found');
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch (error) {
      this.openTelemetryCollector.error(
        `[evaluation] Could not parse model output: ${(error as Error).message}`
      );
      throw new EvaluationUnavailableError(
        'The AI evaluation service returned an unreadable response'
      );
    }

    const byKey = new Map(
      (parsed.dimensions ?? []).map((d) => [d.key, d] as const)
    );
    const dimensions = (
      Object.entries(EVALUATION_DIMENSIONS) as Array<
        [EvaluationDimensionKey, string]
      >
    ).map(([key, name]) => {
      const d = byKey.get(key);
      return {
        key,
        name,
        score: clampScore(d?.score),
        summary: d?.summary?.trim() || 'No assessment returned.',
        actionableFeedback: (d?.actionableFeedback ?? [])
          .filter((f): f is string => typeof f === 'string' && f.trim() !== '')
          .map((f) => f.trim())
      };
    });

    return {
      summary: parsed.summary?.trim() || 'No overall summary returned.',
      focus,
      generatedBy: this.foundryModel || 'foundry',
      dimensions
    };
  };

  private parseRefinement = (
    raw: string,
    fallback: { title: string; body: string }
  ): IdeaRefinement => {
    let parsed: { title?: string; body?: string; changes?: string[] };
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start === -1 || end <= start) throw new Error('no JSON object found');
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch (error) {
      this.openTelemetryCollector.error(
        `[evaluation] Could not parse refinement output: ${(error as Error).message}`
      );
      throw new EvaluationUnavailableError(
        'The AI refinement service returned an unreadable response'
      );
    }
    if (!parsed.body?.trim()) {
      throw new EvaluationUnavailableError(
        'The AI refinement service returned an empty draft'
      );
    }
    return {
      title: parsed.title?.trim() || fallback.title,
      body: parsed.body.trim(),
      changes: (parsed.changes ?? [])
        .filter((c): c is string => typeof c === 'string' && c.trim() !== '')
        .map((c) => c.trim())
    };
  };

  /** Deterministic stand-in refinement for unconfigured local dev. */
  private offlineRefinement = (
    data: { title: string; body: string; feedback: string[] },
    focus: EvaluationDimensionKey
  ): IdeaRefinement => ({
    title: data.title,
    body:
      `${data.body}\n\n${EVALUATION_DIMENSIONS[focus]} plan (offline sample — connect a Foundry endpoint for a real revision):\n` +
      data.feedback.map((f) => `- Addressing: ${f}`).join('\n'),
    changes: [
      `Appended an offline sample ${EVALUATION_DIMENSIONS[focus].toLowerCase()} plan section`,
      'Set FOUNDRY_ENDPOINT, FOUNDRY_API_KEY, and FOUNDRY_MODEL for a real AI revision.'
    ]
  });

  /** Deterministic stand-in evaluation for unconfigured local dev. */
  private offlineSample = (
    data: { title: string; body: string },
    focus?: EvaluationDimensionKey
  ): IdeaEvaluation => {
    // Rough length-based spread so drafts visibly change scores as they grow
    const detail = Math.min(40, Math.floor(data.body.length / 40));
    const dimensions = (
      Object.entries(EVALUATION_DIMENSIONS) as Array<
        [EvaluationDimensionKey, string]
      >
    ).map(([key, name], index) => ({
      key,
      name,
      score: clampScore(35 + detail + index * 5 + (focus === key ? 5 : 0)),
      summary: `Offline sample assessment of "${data.title}" for ${name.toLowerCase()} — connect a Foundry endpoint for a real evaluation.`,
      actionableFeedback: [
        `Add concrete specifics the ${name.toLowerCase()} lens can grade (metrics, cohort, workflow step).`,
        'Set FOUNDRY_ENDPOINT, FOUNDRY_API_KEY, and FOUNDRY_MODEL to enable real AI scoring.'
      ]
    }));
    return {
      summary:
        'Offline sample evaluation — the Foundry endpoint is not configured, so these scores are placeholders based on draft length only.',
      focus,
      generatedBy: 'offline-sample',
      dimensions
    };
  };
}

function clampScore(score: unknown): number {
  const n = typeof score === 'number' && Number.isFinite(score) ? score : 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
