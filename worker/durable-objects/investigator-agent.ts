import type { Env } from '../env';
import type { Env as ApiEnv } from '../../api/src/env';
import type { AgentState, AgentStep, AgentToolResult, AgentToolCall } from '../../api/src/lib/agent/types';
import { buildToolRegistry } from '../../api/src/lib/agent/tools';
import { planNextStep } from '../../api/src/lib/agent/planner';
import { observeStep } from '../../api/src/lib/agent/observer';
import { synthesizeReport } from '../../api/src/lib/agent/synthesizer';

/** Truncate JSON-serializable data to a max char length. Returns valid JSON. */
function truncateData(data: unknown, maxChars: number): unknown {
  const json = JSON.stringify(data);
  if (json.length <= maxChars) return data;
  // Truncate and try to re-parse. If the cut point breaks the JSON, just
  // return a summary string instead of broken JSON.
  const truncated = json.slice(0, maxChars);
  try {
    return JSON.parse(truncated);
  } catch {
    // JSON is broken at the cut point — return a safe string summary
    return { _truncated: true, _original_chars: json.length, _preview: truncated.slice(0, 500) };
  }
}

/**
 * Alarm-driven autonomous investigator agent. Each `alarm()` runs ONE
 * planning+execution cycle, persists state, and reschedules until the
 * investigation is complete (synthesized) or errored.
 *
 * Same pattern as ReportBuilderDO: the alarm gives each step its own
 * subrequest budget so the agent can run for minutes without hitting
 * Worker CPU limits.
 */
export class InvestigatorAgentDO {
  private ctx: DurableObjectState;
  private env: Env;
  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // POST /investigate — start a new investigation
    if (url.pathname === '/investigate' && request.method === 'POST') {
      const body = (await request.json()) as { id: string; query: string; queryType?: string; maxSteps?: number };
      const state: AgentState = {
        id: body.id,
        query: body.query,
        queryType: body.queryType ?? 'generic',
        status: 'running',
        steps: [],
        currentStep: 0,
        maxSteps: body.maxSteps ?? 6,
        report: null,
        modelUsed: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        error: null,
      };
      await this.ctx.storage.put(`state:${body.id}`, state);
      await this.persist(state);
      // Kick off the first step immediately
      await this.ctx.storage.setAlarm(Date.now() + 1);
      return Response.json({ id: body.id, status: 'running' });
    }

    // GET /state — poll current investigation state
    if (url.pathname === '/state') {
      const id = url.searchParams.get('id') ?? '';
      const state = await this.ctx.storage.get<AgentState>(`state:${id}`);
      return state ? Response.json(state) : Response.json({ error: 'not found' }, { status: 404 });
    }

    // DELETE /delete — clean up DO storage
    if (url.pathname === '/delete' && request.method === 'DELETE') {
      const id = url.searchParams.get('id') ?? '';
      if (id) await this.ctx.storage.delete(`state:${id}`);
      return Response.json({ ok: true });
    }

    return new Response('not found', { status: 404 });
  }

  async alarm(): Promise<void> {
    const all = await this.ctx.storage.list<AgentState>({ prefix: 'state:' });
    let anyPending = false;

    for (const [key, state] of all) {
      if (state.status !== 'running') continue;
      anyPending = true;

      try {
        const next = await this.advanceOneStep(state);
        await this.ctx.storage.put(key, next);

        if (next.status === 'done' || next.status === 'error') {
          await this.persist(next);
        } else {
          // Schedule next step with a small delay to avoid burst
          await this.ctx.storage.setAlarm(Date.now() + 100);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`agent ${state.id}: step failed`, errMsg);
        state.status = 'error';
        state.error = errMsg;
        state.completedAt = new Date().toISOString();
        await this.ctx.storage.put(key, state);
        await this.persist(state);
      }
    }

    if (anyPending) {
      const remaining = await this.ctx.storage.list<AgentState>({ prefix: 'state:' });
      const stillRunning = [...remaining.values()].some((s) => s.status === 'running');
      if (stillRunning) await this.ctx.storage.setAlarm(Date.now() + 100);
    }
  }

  /**
   * Execute one planning+execution cycle. This is the core agent loop:
   * 1. PLAN: LLM decides which tools to call
   * 2. ACT: Execute tools in parallel
   * 3. OBSERVE: Summarize results
   * 4. DECIDE: Continue or synthesize
   */
  private async advanceOneStep(state: AgentState): Promise<AgentState> {
    const apiEnv = this.env as unknown as ApiEnv;
    const ai = apiEnv.AI;
    const groqKey = apiEnv.GROQ_API_KEY;
    // Pass admin token so tool calls bypass the external API key gate.
    // The DO calls /api/v1/* via the SELF service binding (in-process) but
    // the authenticate('external-only') middleware still requires credentials
    // for non-same-origin requests. An internal header bypasses this.
    const tools = buildToolRegistry(this.env.SELF, undefined, { 'x-internal-agent': 'investigator-do' });

    const stepNum = state.currentStep + 1;
    const stepStart = new Date().toISOString();

    // ── PLAN ─────────────────────────────────────────────────────────
    const plan = await planNextStep(ai, state.query, state.queryType, state.steps, stepNum, state.maxSteps, tools, {
      groqKey,
    });

    if (plan.shouldSynthesize || stepNum >= state.maxSteps) {
      // Enough data — synthesize the final report
      return await this.doSynthesize(state, ai, groqKey, stepNum, stepStart, plan.reasoning);
    }

    // ── ACT ──────────────────────────────────────────────────────────
    const step: AgentStep = {
      stepNumber: stepNum,
      plan: plan.reasoning,
      toolCalls: plan.toolCalls,
      results: [],
      status: 'running',
      startedAt: stepStart,
    };

    const results = await this.executeTools(plan.toolCalls, tools);
    step.results = results;
    step.completedAt = new Date().toISOString();

    // ── OBSERVE ──────────────────────────────────────────────────────
    const observation = await observeStep(ai, stepNum, plan.reasoning, results, { groqKey });
    step.observation = observation.observation;
    step.nextAction = 'continue';
    step.status = 'done';

    state.steps.push(step);
    state.currentStep = stepNum;

    return state;
  }

  /** Execute tool calls in parallel, collecting results. */
  private async executeTools(
    calls: AgentToolCall[],
    tools: ReturnType<typeof buildToolRegistry>
  ): Promise<AgentToolResult[]> {
    const toolMap = new Map(tools.map((t) => [t.name, t]));
    const results: AgentToolResult[] = [];

    const promises = calls.map(async (call): Promise<AgentToolResult> => {
      const tool = toolMap.get(call.tool);
      if (!tool)
        return {
          tool: call.tool,
          args: call.args,
          status: 'error',
          error: `Unknown tool: ${call.tool}`,
          durationMs: 0,
        };

      const start = Date.now();
      try {
        // 10s timeout per tool call
        const data = await Promise.race([
          tool.execute(call.args),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Tool timeout (10s)')), 10_000)),
        ]);
        return { tool: call.tool, args: call.args, status: 'ok', data, durationMs: Date.now() - start };
      } catch (err) {
        return {
          tool: call.tool,
          args: call.args,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - start,
        };
      }
    });

    const settled = await Promise.allSettled(promises);
    for (const s of settled) {
      results.push(
        s.status === 'fulfilled'
          ? s.value
          : { tool: 'unknown', args: {}, status: 'error', error: 'Promise rejected', durationMs: 0 }
      );
    }
    return results;
  }

  /** Synthesize the final report and mark the investigation done. */
  private async doSynthesize(
    state: AgentState,
    ai: ApiEnv['AI'],
    groqKey: string | undefined,
    stepNum: number,
    stepStart: string,
    planReasoning: string
  ): Promise<AgentState> {
    const synthesizeStep: AgentStep = {
      stepNumber: stepNum,
      plan: planReasoning,
      toolCalls: [],
      results: [],
      status: 'running',
      startedAt: stepStart,
    };

    try {
      const result = await synthesizeReport(ai, state.query, state.queryType, state.steps, { groqKey });
      state.report = result.report;
      state.modelUsed = result.modelUsed;

      synthesizeStep.observation = `Report synthesized. ${result.keyFindings.length} key findings, confidence: ${result.confidence}, ${result.iocsExtracted.length} IOCs extracted, ${result.mitreTechniques.length} MITRE techniques.`;
      synthesizeStep.status = 'done';
      synthesizeStep.completedAt = new Date().toISOString();

      state.steps.push(synthesizeStep);
      state.currentStep = stepNum;
      state.status = 'done';
      state.completedAt = new Date().toISOString();
    } catch (err) {
      synthesizeStep.status = 'error';
      synthesizeStep.completedAt = new Date().toISOString();
      state.steps.push(synthesizeStep);
      state.status = 'error';
      state.error = err instanceof Error ? `Synthesis failed: ${err.message}` : `Synthesis failed: ${String(err)}`;
      state.completedAt = new Date().toISOString();
    }

    return state;
  }

  /** Persist agent state to D1 for history and polling. */
  private async persist(state: AgentState): Promise<void> {
    const db = (this.env as unknown as ApiEnv).BRIEFINGS_DB;
    if (!db) return;

    // Truncate tool result data to keep D1 rows manageable. Full data stays
    // in the in-memory state for the synthesizer, but D1 only needs summaries.
    const trimmedSteps = state.steps.map((s) => ({
      ...s,
      results: s.results.map((r) => ({
        ...r,
        data: r.data ? truncateData(r.data, 2000) : r.data,
      })),
    }));

    await db
      .prepare(
        `INSERT INTO agent_sessions (id, query, query_type, status, steps_json, report_json, model_used, total_steps, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           status=excluded.status,
           steps_json=excluded.steps_json,
           report_json=COALESCE(excluded.report_json, agent_sessions.report_json),
           model_used=COALESCE(excluded.model_used, agent_sessions.model_used),
           total_steps=excluded.total_steps,
           updated_at=excluded.updated_at`
      )
      .bind(
        state.id,
        state.query,
        state.queryType,
        state.status,
        JSON.stringify(trimmedSteps),
        state.report ?? null,
        state.modelUsed ?? null,
        state.currentStep,
        state.startedAt,
        new Date().toISOString()
      )
      .run();
  }
}
