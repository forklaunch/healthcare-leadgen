import { OpenTelemetryCollector } from '@forklaunch/core/http';
import { Metrics } from '@uchicago-ideas/monitoring';

/** The three lenses every idea is scored through. */
export const EVALUATION_DIMENSIONS = {
  studyDesign: 'Study Design',
  commercialization: 'Commercialization Potential',
  operationalSpeedup: 'Operational Speedup'
} as const;

export type EvaluationDimensionKey = keyof typeof EVALUATION_DIMENSIONS;

/** The three ROI axes hospital administrators score ideas on. */
export const ROI_DIMENSIONS = {
  lengthOfStay: 'Length-of-Stay Reduction',
  throughput: 'Throughput Improvement',
  patientSatisfaction: 'Patient Satisfaction'
} as const;

export type RoiDimensionKey = keyof typeof ROI_DIMENSIONS;

export interface RoiDimension {
  key: string;
  name: string;
  score: number;
  rationale: string;
  /** What earned points: specifics in the idea that support this axis. */
  strengths: string[];
  /** What cost points: gaps, risks, or unknowns that held the score down. */
  concerns: string[];
  validationSteps: string[];
}

/** Implementation cost comparison: building on ForkLaunch vs from scratch. */
export interface BuildEstimate {
  /** trivial | moderate | complex | very-complex */
  complexity: string;
  forklaunch: { devWeeks: number; costUsd: number };
  custom: { devWeeks: number; costUsd: number };
  savingsPct: number;
  rationale: string;
}

export interface RoiScore {
  summary: string;
  roiIndex: number;
  generatedBy: string;
  scoredAt: string;
  dimensions: RoiDimension[];
  buildEstimate?: BuildEstimate;
}

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

const ROI_SYSTEM_PROMPT = `You are a hospital operations and finance analyst scoring ideas submitted to a health system's innovation program. Your audience is hospital administrators who decide which ideas to fund based on return on investment. Score each idea honestly and rigorously on exactly three ROI axes:

1. lengthOfStay — Potential to reduce inpatient length of stay. Consider which patient populations and DRGs are affected, expected reduction in bed-days, discharge-process impact, and how directly the idea acts on known LOS drivers (discharge planning, care coordination, complication avoidance).
2. throughput — Potential to increase throughput: more patients served with the same capacity. Consider OR/procedure-room utilization, clinic slot yield, ED boarding and door-to-provider time, turnover time, and bottleneck relief.
3. patientSatisfaction — Potential to improve patient satisfaction and experience (HCAHPS and equivalent). Consider communication, waiting, care transitions, and whether the improvement is one patients actually perceive.

Scores are 0-100 and reflect ROI potential, not idea quality in the abstract: a scientifically interesting idea with no operational lever scores low; a mundane idea that clearly removes a bottleneck scores high. Be a tough grader — reserve 80+ for ideas with a direct, plausible, quantifiable mechanism.

For each axis give:
- rationale: 1-2 sentences grounded in the idea's specifics
- strengths: 1-3 bullets naming exactly what in the idea EARNED points on this axis
- concerns: 1-3 bullets naming the gaps, risks, or unknowns that HELD THE SCORE DOWN (be specific — these explain the score to a skeptical administrator)
- validationSteps: 2-4 concrete data pulls or measurements an administrator should run to validate the ROI before funding (e.g. "Pull average LOS for DRG 470 patients in the affected unit for the last 12 months")

Also estimate the software implementation cost IF the idea requires building software (most workflow/digital ideas do). Compare two paths honestly:
- forklaunch: built on the ForkLaunch platform — scaffolded services, built-in per-tenant PHI encryption + RLS, auth, deploys, observability, and shared-infrastructure hosting are inherited rather than built. Typically cuts infrastructure/compliance engineering by 60-80% for CRUD-and-workflow apps; less dramatic for algorithmically novel systems.
- custom: built from scratch on raw cloud primitives, including the HIPAA-grade encryption, tenancy, auth, deploy pipeline, and monitoring work ForkLaunch would otherwise provide.
Use $12,500 per dev-week blended. If the idea needs no software at all, set complexity "none" and zero the numbers.

Respond with ONLY a JSON object, no markdown fences, in exactly this shape:
{
  "summary": "2-3 sentence overall ROI assessment written for a hospital administrator",
  "dimensions": [
    { "key": "lengthOfStay", "score": 0, "rationale": "...", "strengths": ["..."], "concerns": ["..."], "validationSteps": ["...", "..."] },
    { "key": "throughput", "score": 0, "rationale": "...", "strengths": ["..."], "concerns": ["..."], "validationSteps": ["..."] },
    { "key": "patientSatisfaction", "score": 0, "rationale": "...", "strengths": ["..."], "concerns": ["..."], "validationSteps": ["..."] }
  ],
  "buildEstimate": {
    "complexity": "trivial|moderate|complex|very-complex|none",
    "forklaunch": { "devWeeks": 0, "costUsd": 0 },
    "custom": { "devWeeks": 0, "costUsd": 0 },
    "savingsPct": 0,
    "rationale": "1-2 sentences on what drives the estimate and the delta"
  }
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

  /**
   * Scores an idea on the three administrator ROI axes: length-of-stay
   * reduction, throughput improvement, and patient satisfaction.
   */
  scoreRoi = async (data: { title: string; body: string }): Promise<RoiScore> => {
    if (!this.foundryEndpoint || !this.foundryApiKey) {
      this.openTelemetryCollector.info(
        '[evaluation] FOUNDRY_ENDPOINT/FOUNDRY_API_KEY not set — returning offline sample ROI score'
      );
      return this.offlineRoiSample(data);
    }

    const raw = await this.callFoundry(
      [`Idea title: ${data.title}`, '', 'Idea description:', data.body].join(
        '\n'
      ),
      ROI_SYSTEM_PROMPT
    );
    return this.parseRoi(raw);
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

  private parseRoi = (raw: string): RoiScore => {
    let parsed: {
      summary?: string;
      dimensions?: Array<{
        key?: string;
        score?: number;
        rationale?: string;
        strengths?: string[];
        concerns?: string[];
        validationSteps?: string[];
      }>;
      buildEstimate?: {
        complexity?: string;
        forklaunch?: { devWeeks?: number; costUsd?: number };
        custom?: { devWeeks?: number; costUsd?: number };
        savingsPct?: number;
        rationale?: string;
      };
    };
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start === -1 || end <= start) throw new Error('no JSON object found');
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch (error) {
      this.openTelemetryCollector.error(
        `[evaluation] Could not parse ROI output: ${(error as Error).message}`
      );
      throw new EvaluationUnavailableError(
        'The AI ROI scoring service returned an unreadable response'
      );
    }

    const cleanList = (xs?: string[]) =>
      (xs ?? [])
        .filter((s): s is string => typeof s === 'string' && s.trim() !== '')
        .map((s) => s.trim());

    const byKey = new Map(
      (parsed.dimensions ?? []).map((d) => [d.key, d] as const)
    );
    const dimensions = (
      Object.entries(ROI_DIMENSIONS) as Array<[RoiDimensionKey, string]>
    ).map(([key, name]) => {
      const d = byKey.get(key);
      return {
        key,
        name,
        score: clampScore(d?.score),
        rationale: d?.rationale?.trim() || 'No assessment returned.',
        strengths: cleanList(d?.strengths),
        concerns: cleanList(d?.concerns),
        validationSteps: cleanList(d?.validationSteps)
      };
    });

    const be = parsed.buildEstimate;
    const buildEstimate: BuildEstimate | undefined = be
      ? {
          complexity: be.complexity?.trim() || 'moderate',
          forklaunch: {
            devWeeks: Math.max(0, Math.round(be.forklaunch?.devWeeks ?? 0)),
            costUsd: Math.max(0, Math.round(be.forklaunch?.costUsd ?? 0))
          },
          custom: {
            devWeeks: Math.max(0, Math.round(be.custom?.devWeeks ?? 0)),
            costUsd: Math.max(0, Math.round(be.custom?.costUsd ?? 0))
          },
          savingsPct: Math.max(0, Math.min(100, Math.round(be.savingsPct ?? 0))),
          rationale: be.rationale?.trim() || ''
        }
      : undefined;

    return {
      summary: parsed.summary?.trim() || 'No overall ROI summary returned.',
      roiIndex: Math.round(
        dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length
      ),
      generatedBy: this.foundryModel || 'foundry',
      scoredAt: new Date().toISOString(),
      dimensions,
      buildEstimate
    };
  };

  /** Deterministic stand-in ROI score for unconfigured local dev. */
  private offlineRoiSample = (data: {
    title: string;
    body: string;
  }): RoiScore => {
    const detail = Math.min(40, Math.floor(data.body.length / 40));
    const dimensions = (
      Object.entries(ROI_DIMENSIONS) as Array<[RoiDimensionKey, string]>
    ).map(([key, name], index) => ({
      key,
      name,
      score: clampScore(30 + detail + index * 7),
      rationale: `Offline sample ROI assessment of "${data.title}" for ${name.toLowerCase()} — connect a Foundry endpoint for a real analysis.`,
      strengths: ['Offline sample — draft length only.'],
      concerns: ['Offline sample — no real analysis performed.'],
      validationSteps: [
        `Identify the baseline metric this idea would move for ${name.toLowerCase()}.`,
        'Set FOUNDRY_ENDPOINT, FOUNDRY_API_KEY, and FOUNDRY_MODEL to enable real AI scoring.'
      ]
    }));
    return {
      summary:
        'Offline sample ROI score — the Foundry endpoint is not configured, so these scores are placeholders based on draft length only.',
      roiIndex: Math.round(
        dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length
      ),
      generatedBy: 'offline-sample',
      scoredAt: new Date().toISOString(),
      dimensions,
      buildEstimate: {
        complexity: 'moderate',
        forklaunch: { devWeeks: 6, costUsd: 75000 },
        custom: { devWeeks: 22, costUsd: 275000 },
        savingsPct: 73,
        rationale:
          'Offline sample estimate — connect a Foundry endpoint for a real analysis.'
      }
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
