import type { Env } from '../env';
import type { Env as ApiEnv } from '../../api/src/env';
import type { AgentState, AgentStep, AgentToolResult, AgentToolCall } from '../../api/src/lib/agent/types';
import { buildToolRegistry } from '../../api/src/lib/agent/tools';
import { planNextStep } from '../../api/src/lib/agent/planner';
import { evaluateCtiExit, filterCtiToolCalls } from '../../api/src/lib/agent/cti-loop';
import { observeStep } from '../../api/src/lib/agent/observer';
import { synthesizeReport, splitSynthOutput } from '../../api/src/lib/agent/synthesizer';
import { verifyReport } from '../../api/src/lib/agent/qa-verifier';
import { signInternalToken } from '../../api/src/lib/internal-token';
import {
  buildOrchestratorPlan,
  checkSpecialistExit,
  getSpecialistPrompt,
  applySpecialistGuardrails,
} from '../../api/src/lib/agent/orchestrator';
import {
  SPECIALIST_REGISTRY,
  getToolsForSpecialist,
  type SpecialistRole,
} from '../../api/src/lib/agent/specialist-types';
import {
  createWorkingMemory,
  mergeIntoMemory,
  memoryToPrompt,
  shouldRetry,
  buildSelfCorrectionPrompt,
  type WorkingMemory,
} from '../../api/src/lib/agent/agent-framework';
import { getCachedResult, setCachedResult } from '../../api/src/lib/agent/agent-cache';

/** Truncate JSON-serializable data to a max char length. Returns valid JSON. */
function truncateData(data: unknown, maxChars: number): unknown {
  const json = JSON.stringify(data);
  if (json.length <= maxChars) return data;
  // Truncate and try to re-parse. If the cut point breaks the JSON, just
  // return a summary string instead of broken JSON.
  const truncated = json.slice(0, maxChars);
  try {
    return JSON.parse(truncated);
  } catch (_catchErr) {
    console.error('truncateData failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
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
const MAX_AGENT_WS_CONNECTIONS = 10;

export class InvestigatorAgentDO {
  private ctx: DurableObjectState;
  private env: Env;
  private sessions = new Map<string, WebSocket>();
  /** Tracks which agentId each WebSocket session is watching. */
  private sessionAgentIds = new Map<string, string>();
  private ipConnections = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade — real-time step streaming
    if (request.headers.get('upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request);
    }

    // POST /investigate — start a new investigation
    if (url.pathname === '/investigate' && request.method === 'POST') {
      const body = (await request.json()) as {
        id: string;
        query: string;
        queryType?: string;
        maxSteps?: number;
        allowedTools?: string[] | null;
        role?: string;
        rolePreamble?: string;
        responseFormat?: string;
      };
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
        role: body.role,
        allowedTools: body.allowedTools,
        rolePreamble: body.rolePreamble,
        responseFormat: body.responseFormat,
      };
      await this.ctx.storage.put(`state:${body.id}`, state);
      await this.persist(state);
      // Kick off the first step immediately
      await this.ctx.storage.setAlarm(Date.now() + 1);
      return Response.json({ id: body.id, status: 'running' });
    }

    // GET /state — poll current investigation state (kept for SSE backward compat)
    if (url.pathname === '/state') {
      const id = url.searchParams.get('id') ?? '';
      const state = await this.ctx.storage.get<AgentState>(`state:${id}`);
      return state ? Response.json(state) : Response.json({ error: 'not found' }, { status: 404 });
    }

    // DELETE /cancel — mark an investigation as cancelled
    if (url.pathname === '/cancel' && request.method === 'DELETE') {
      const id = url.searchParams.get('id') ?? '';
      if (!id) return Response.json({ error: 'id required' }, { status: 400 });
      const state = await this.ctx.storage.get<AgentState>(`state:${id}`);
      if (!state) return Response.json({ error: 'not found' }, { status: 404 });
      if (state.status === 'running') {
        state.status = 'error';
        state.error = 'Cancelled by user';
        state.completedAt = new Date().toISOString();
        await this.ctx.storage.put(`state:${id}`, state);
        await this.persist(state);
        this.broadcast({ type: 'error', error: 'Cancelled by user', agentId: id });
      }
      return Response.json({ ok: true, status: state.status });
    }

    // DELETE /delete — clean up DO storage
    if (url.pathname === '/delete' && request.method === 'DELETE') {
      const id = url.searchParams.get('id') ?? '';
      if (id) await this.ctx.storage.delete(`state:${id}`);
      return Response.json({ ok: true });
    }

    return new Response('not found', { status: 404 });
  }

  private handleWebSocketUpgrade(request: Request): Response {
    if (this.sessions.size >= MAX_AGENT_WS_CONNECTIONS) {
      return new Response('Too many connections', { status: 429 });
    }

    const clientIp = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const ipCount = this.ipConnections.get(clientIp) ?? 0;
    if (ipCount >= 5) {
      return new Response('Too many connections from this IP', { status: 429 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const sessionId = crypto.randomUUID();

    this.sessions.set(sessionId, server);
    this.ipConnections.set(clientIp, ipCount + 1);
    server.accept();

    // Listen for subscription: {"agentId":"xxx"}
    server.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (typeof msg.agentId === 'string') {
          this.sessionAgentIds.set(sessionId, msg.agentId);
        }
      } catch (_catchErr) {
        console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        // Ignore malformed messages
      }
    });

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      this.sessions.delete(sessionId);
      this.sessionAgentIds.delete(sessionId);
      const remaining = this.ipConnections.get(clientIp) ?? 1;
      if (remaining <= 1) this.ipConnections.delete(clientIp);
      else this.ipConnections.set(clientIp, remaining - 1);
    };
    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);

    server.send(JSON.stringify({ type: 'connected' }));

    return new Response(null, { status: 101, webSocket: client });
  }

  /** Broadcast a message to WebSocket clients watching this agent. */
  private broadcast(msg: unknown): void {
    if (this.sessions.size === 0) return;
    const payload = JSON.stringify(msg);
    const msgAgentId = (msg as Record<string, unknown>).agentId;
    for (const [id, ws] of this.sessions) {
      const watching = this.sessionAgentIds.get(id);
      if (watching && watching !== msgAgentId) continue;
      try {
        ws.send(payload);
      } catch (_catchErr) {
        console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        this.sessions.delete(id);
        this.sessionAgentIds.delete(id);
      }
    }
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

        // Push the new step to WebSocket clients in real-time
        if (next.steps.length > state.steps.length) {
          const newStep = next.steps[next.steps.length - 1];
          this.broadcast({ type: 'step', step: newStep });
        }

        if (next.status === 'done' || next.status === 'error') {
          await this.persist(next);
          this.broadcast({
            type: next.status,
            report: next.report,
            error: next.error,
            modelUsed: next.modelUsed,
            qa: next.qa,
            actionCard: next.actionCard,
            sources: next.sources,
          });
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
        this.broadcast({ type: 'error', error: errMsg });
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
   * 1. PLAN: LLM decides which tools to call (using specialist-specific prompt)
   * 2. ACT: Execute tools in parallel
   * 3. OBSERVE: Summarize results
   * 4. DECIDE: Continue with current specialist, switch specialist, or synthesize
   *
   * Uses working memory to carry intelligence across steps for better reasoning.
   */
  private async advanceOneStep(state: AgentState): Promise<AgentState> {
    const apiEnv = this.env as unknown as ApiEnv;
    const ai = apiEnv.AI;
    const groqKey = apiEnv.GROQ_API_KEY;
    const googleKey = apiEnv.GOOGLE_AI_STUDIO_API_KEY;
    const nvidiaKey = apiEnv.NVIDIA_API_KEY;
    const tokenSecret = this.env.INTERNAL_TOKEN_SECRET;
    if (!tokenSecret) throw new Error('INTERNAL_TOKEN_SECRET not configured');
    const internalToken = await signInternalToken('investigator-do', tokenSecret);
    const allTools = buildToolRegistry(this.env.SELF, undefined, { 'x-internal-token': internalToken });

    // Filter tools by allowedTools if set (from Vera role/mode config)
    const allowedTools = state.allowedTools;
    const availableTools =
      allowedTools && allowedTools.length > 0 ? allTools.filter((t) => allowedTools.includes(t.name)) : allTools;

    const stepNum = state.currentStep + 1;
    const stepStart = new Date().toISOString();
    const view = { stepNum, maxSteps: state.maxSteps, steps: state.steps };

    // ── WORKING MEMORY ────────────────────────────────────────────────
    // Build or restore working memory from previous steps.
    // This carries IOCs, MITRE techniques, key facts, and gaps across steps
    // so the planner has full context for better tool selection.
    let workingMemory = this.buildWorkingMemory(state);

    // ── DECIDE (pre-plan) ─────────────────────────────────────────────
    const exit = evaluateCtiExit(view);
    if (exit) {
      return await this.doSynthesize(state, ai, groqKey, googleKey, nvidiaKey, stepNum, stepStart, exit.reason);
    }

    // ── SPECIALIST MESH ───────────────────────────────────────────────
    // On step 1: build orchestrator plan and select first specialist.
    // On subsequent steps: check current specialist's exit conditions and switch.
    let currentRole: SpecialistRole | undefined = state.currentSpecialist as SpecialistRole | undefined;

    if (stepNum === 1) {
      // Build orchestration plan on step 1
      try {
        const plan = await buildOrchestratorPlan(state.query, state.queryType, { groqKey, googleKey, nvidiaKey });
        if (plan.specialistCalls.length > 0 && plan.specialistCalls[0]) {
          currentRole = plan.specialistCalls[0].role;
          state.currentSpecialist = currentRole;
        }
      } catch (_catchErr) {
        console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        // Orchestrator failure — fall through to monolithic planner
      }
    } else if (currentRole) {
      // Check if current specialist's exit conditions have fired
      const specialistCheck = checkSpecialistExit(currentRole, state.steps, stepNum, state.maxSteps);
      if (specialistCheck.shouldSwitch) {
        if (specialistCheck.nextRole) {
          // Switch to next specialist
          currentRole = specialistCheck.nextRole;
          state.currentSpecialist = currentRole;
        } else {
          // No more specialists — synthesize
          return await this.doSynthesize(
            state,
            ai,
            groqKey,
            googleKey,
            nvidiaKey,
            stepNum,
            stepStart,
            `All specialists complete (${specialistCheck.reason}). Synthesizing.`
          );
        }
      }
    }

    // ── PLAN (specialist-aware) ──────────────────────────────────────
    let specialistTools = allTools;
    let specialistPrompt = '';

    if (currentRole) {
      // Use specialist's tool subset and planner prompt
      specialistTools = getToolsForSpecialist(currentRole, allTools);
      specialistPrompt = getSpecialistPrompt(
        currentRole,
        specialistTools,
        stepNum,
        state.maxSteps,
        state.query,
        state.steps
      );

      // Add specialist context to the planner
      const specialistContext = specialistPrompt
        ? `\n<specialist_role>${SPECIALIST_REGISTRY[currentRole].label}</specialist_role>\n<specialist_instructions>${specialistPrompt}</specialist_instructions>`
        : undefined;

      const plan = await planNextStep(
        ai,
        state.query,
        state.queryType,
        state.steps,
        stepNum,
        state.maxSteps,
        specialistTools,
        {
          groqKey,
          googleKey,
          nvidiaKey,
          specialistContext,
          workingMemory,
        }
      );

      if (plan.shouldSynthesize) {
        return await this.doSynthesize(state, ai, groqKey, googleKey, nvidiaKey, stepNum, stepStart, plan.reasoning);
      }

      // Apply specialist-specific guardrails
      const validToolNames = new Set(specialistTools.map((t) => t.name));
      let toolCalls = filterCtiToolCalls(plan.toolCalls, view, validToolNames);
      toolCalls = applySpecialistGuardrails(currentRole, toolCalls, view);

      if (toolCalls.length === 0) {
        // No valid tools for this specialist — switch or synthesize
        const specialistCheck = checkSpecialistExit(currentRole, state.steps, stepNum, state.maxSteps, state.queryType);
        if (specialistCheck.shouldSwitch && specialistCheck.nextRole) {
          currentRole = specialistCheck.nextRole;
          state.currentSpecialist = currentRole;
          // Re-plan with next specialist's tools on this same step
          return await this.advanceOneStep({ ...state, currentStep: stepNum - 1 });
        }
        return await this.doSynthesize(
          state,
          ai,
          groqKey,
          googleKey,
          nvidiaKey,
          stepNum,
          stepStart,
          'No valid tools for specialist'
        );
      }

      // ── ACT ──────────────────────────────────────────────────────────
      const step: AgentStep = {
        stepNumber: stepNum,
        plan: `[${SPECIALIST_REGISTRY[currentRole].label}] ${plan.reasoning}`,
        toolCalls,
        results: [],
        status: 'running',
        startedAt: stepStart,
      };

      const results = await this.executeTools(toolCalls, specialistTools);
      step.results = results;
      step.completedAt = new Date().toISOString();

      // ── OBSERVE ──────────────────────────────────────────────────────
      const observation = await observeStep(ai, stepNum, plan.reasoning, results, { groqKey, googleKey, nvidiaKey });
      step.observation = observation.observation;
      step.nextAction = 'continue';
      step.status = 'done';

      // Update working memory with observer findings
      workingMemory = mergeIntoMemory(workingMemory, stepNum, [
        {
          tool: plan.toolCalls[0]?.tool ?? 'unknown',
          iocs: observation.iocs,
          mitre: observation.mitre,
          keyFacts: observation.keyFacts,
          confidence: observation.confidence,
          gaps: observation.gaps,
        },
      ]);

      state.steps.push(step);
      state.currentStep = stepNum;

      return state;
    }

    // ── FALLBACK: monolithic planner (no specialist matched) ──────────
    const plan = await planNextStep(
      ai,
      state.query,
      state.queryType,
      state.steps,
      stepNum,
      state.maxSteps,
      availableTools,
      {
        groqKey,
        googleKey,
        nvidiaKey,
        workingMemory,
      }
    );

    if (plan.shouldSynthesize) {
      return await this.doSynthesize(state, ai, groqKey, googleKey, nvidiaKey, stepNum, stepStart, plan.reasoning);
    }

    const validToolNames = new Set(availableTools.map((t) => t.name));
    const toolCalls = filterCtiToolCalls(plan.toolCalls, view, validToolNames);
    if (toolCalls.length === 0) {
      return await this.doSynthesize(state, ai, groqKey, googleKey, nvidiaKey, stepNum, stepStart, plan.reasoning);
    }

    const step: AgentStep = {
      stepNumber: stepNum,
      plan: plan.reasoning,
      toolCalls,
      results: [],
      status: 'running',
      startedAt: stepStart,
    };

    const results = await this.executeTools(toolCalls, availableTools);
    step.results = results;
    step.completedAt = new Date().toISOString();

    const observation = await observeStep(ai, stepNum, plan.reasoning, results, { groqKey, googleKey, nvidiaKey });
    step.observation = observation.observation;
    step.nextAction = 'continue';
    step.status = 'done';

    // Update working memory with observer findings
    workingMemory = mergeIntoMemory(workingMemory, stepNum, [
      {
        tool: plan.toolCalls[0]?.tool ?? 'unknown',
        iocs: observation.iocs,
        mitre: observation.mitre,
        keyFacts: observation.keyFacts,
        confidence: observation.confidence,
        gaps: observation.gaps,
      },
    ]);

    state.steps.push(step);
    state.currentStep = stepNum;

    return state;
  }

  /** Execute tool calls in parallel, collecting results. Uses cache for repeat calls. */
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

      // Check cache first — skip API call if we have a fresh result
      const cached = await getCachedResult(call.tool, call.args);
      if (cached !== null) {
        return { tool: call.tool, args: call.args, status: 'ok', data: cached, durationMs: 0 };
      }

      const start = Date.now();
      try {
        // Per-tool timeout: 20s for most tools, 40s for heavy fan-outs
        // (enrich_actor, check_ioc, enrich_ioc_deep) that hit multiple
        // external APIs in parallel.
        const isHeavyFanout = [
          'enrich_actor',
          'check_ioc',
          'enrich_ioc_deep',
          'actor_timeline',
          'sample_scan',
          'breach_check',
          'check_breach',
          'scan_dependencies',
          'unified_search',
          'cross_correlate',
        ].includes(call.tool);
        const timeoutMs = isHeavyFanout ? 40_000 : 20_000;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const data = await Promise.race([
          tool.execute(call.args).finally(() => clearTimeout(timer)),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Tool timeout (${timeoutMs / 1000}s)`)), timeoutMs);
          }),
        ]);

        // Cache successful results for future calls
        await setCachedResult(call.tool, call.args, data);

        return { tool: call.tool, args: call.args, status: 'ok', data, durationMs: Date.now() - start };
      } catch (err) {
        console.error('handler failed:', err instanceof Error ? err.message : String(err));
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

  /**
   * Build working memory from the current state's steps.
   * Extracts IOCs, MITRE techniques, key facts, and gaps from observer outputs.
   */
  private buildWorkingMemory(state: AgentState): WorkingMemory {
    let mem = createWorkingMemory();
    for (const step of state.steps) {
      if (!step.results) continue;
      const toolData = step.results
        .filter((r) => r.status === 'ok')
        .map((r) => ({
          tool: r.tool,
          iocs: (r.data as Record<string, unknown>)?.iocs as string[] | undefined,
          mitre: (r.data as Record<string, unknown>)?.mitre as string[] | undefined,
          keyFacts: (r.data as Record<string, unknown>)?.keyFacts as string[] | undefined,
          confidence: (r.data as Record<string, unknown>)?.confidence as string | undefined,
          gaps: (r.data as Record<string, unknown>)?.gaps as string[] | undefined,
        }));
      mem = mergeIntoMemory(mem, step.stepNumber, toolData);
    }
    return mem;
  }

  /** Synthesize the final report and mark the investigation done. Streams progress to WebSocket clients. */
  private async doSynthesize(
    state: AgentState,
    ai: ApiEnv['AI'],
    groqKey: string | undefined,
    googleKey: string | undefined,
    nvidiaKey: string | undefined,
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

    // Stream synthesis progress to WebSocket clients
    this.broadcast({
      type: 'step',
      step: { ...synthesizeStep, observation: 'Synthesizing report from collected data…' },
    });

    try {
      // Assess data quality before synthesis
      const totalOk = state.steps.reduce((n, s) => n + s.results.filter((r) => r.status === 'ok').length, 0);
      const totalErr = state.steps.reduce((n, s) => n + s.results.filter((r) => r.status === 'error').length, 0);
      const emptyResults = state.steps.reduce(
        (n, s) => n + s.results.filter((r) => r.status === 'ok' && r.data && JSON.stringify(r.data).length < 50).length,
        0
      );

      const result = await synthesizeReport(ai, state.query, state.queryType, state.steps, {
        groqKey,
        googleKey,
        nvidiaKey,
        dataQuality: { totalOk, totalErr, emptyResults },
      });

      // ── QA PHASE ─────────────────────────────────────────────────────
      // Run the QA verifier to fact-check the report against collected data.
      // This catches hallucinations, adds missing facts, and scores quality.
      const qaStepNum = stepNum + 1;
      const qaStep: AgentStep = {
        stepNumber: qaStepNum,
        plan: 'QA verification — fact-checking report against collected data',
        toolCalls: [],
        results: [],
        status: 'running',
        startedAt: new Date().toISOString(),
      };

      // Stream QA progress
      this.broadcast({
        type: 'step',
        step: { ...qaStep, observation: 'Running QA verification against collected data…' },
      });

      try {
        const qa = await verifyReport(ai, state.query, state.queryType, result.report, state.steps, {
          groqKey,
          googleKey,
          nvidiaKey,
        });

        // ── SELF-CORRECTION LOOP ──────────────────────────────────────
        // If QA score is low and there are fixable issues, re-synthesize
        // with the QA feedback and re-verify. Max 1 retry to avoid loops.
        // Skip if QA returned -1 (providers exhausted — retrying won't help).
        let finalReport = result.report;
        let finalActionCard = result.actionCard;
        let finalModelUsed = `${result.modelUsed} → QA:${qa.modelUsed}`;
        let finalQa = {
          qualityScore: qa.qualityScore,
          flaggedClaims: qa.flaggedClaims,
          missingFacts: qa.missingFacts,
        };

        if (
          qa.qualityScore >= 0 &&
          shouldRetry(qa.qualityScore, qa.flaggedClaims.length, qa.missingFacts.length, stepNum, state.maxSteps)
        ) {
          // Stream self-correction progress
          this.broadcast({
            type: 'step',
            step: { ...qaStep, observation: `QA score ${qa.qualityScore}/100 — running self-correction…` },
          });

          const workingMem = this.buildWorkingMemory(state);
          const memStr = memoryToPrompt(workingMem);
          const correctionPrompt = buildSelfCorrectionPrompt(
            result.report,
            {
              flaggedClaims: qa.flaggedClaims,
              missingFacts: qa.missingFacts,
              qualityNotes: '',
            },
            memStr
          );

          // Re-synthesize with the correction prompt appended
          const { text: correctedText, modelUsed: correctedModel } = await synthesizeReport(
            ai,
            correctionPrompt,
            state.queryType,
            state.steps,
            { groqKey, googleKey, nvidiaKey, dataQuality: { totalOk, totalErr, emptyResults } }
          );

          const { report: correctedProse, actionCard: correctedCard } = splitSynthOutput(correctedText);

          // Re-verify the corrected report
          const qa2 = await verifyReport(ai, state.query, state.queryType, correctedProse, state.steps, {
            groqKey,
            googleKey,
            nvidiaKey,
          });

          // Use the corrected version only if it scored higher
          if (qa2.qualityScore > qa.qualityScore) {
            finalReport = qa2.verifiedReport;
            finalActionCard = correctedCard ?? result.actionCard;
            finalModelUsed = `${result.modelUsed} → QA:${qa.modelUsed} → retry:${correctedModel} → QA:${qa2.modelUsed}`;
            finalQa = {
              qualityScore: qa2.qualityScore,
              flaggedClaims: qa2.flaggedClaims,
              missingFacts: qa2.missingFacts,
            };
            qaStep.observation = `QA complete (with self-correction). Score improved: ${qa.qualityScore}→${qa2.qualityScore}/100.`;
          } else {
            qaStep.observation = `QA complete. Self-correction did not improve (${qa.qualityScore}→${qa2.qualityScore}). Keeping original.`;
          }
        } else {
          qaStep.observation =
            qa.qualityScore < 0
              ? `QA skipped — all LLM providers exhausted. Original report preserved.`
              : `QA complete. Score: ${qa.qualityScore}/100. Flagged: ${qa.flaggedClaims.length} claims. Missing: ${qa.missingFacts.length} facts.`;
        }

        // Use the verified report (hallucinations removed, facts added).
        // Re-split the QA'd text so we can carry the action card through state.
        const { report: proseOnly, actionCard: qaCard } = splitSynthOutput(finalReport);
        state.report = proseOnly;
        state.actionCard = qaCard ?? finalActionCard;
        state.modelUsed = finalModelUsed;
        state.qa = finalQa;

        qaStep.status = 'done';
        qaStep.completedAt = new Date().toISOString();
      } catch (qaErr) {
        console.error('handler failed:', qaErr instanceof Error ? qaErr.message : String(qaErr));
        // QA failure is non-fatal — keep the original report
        qaStep.observation = `QA failed: ${qaErr instanceof Error ? qaErr.message : String(qaErr)}. Original report preserved.`;
        qaStep.status = 'error';
        qaStep.completedAt = new Date().toISOString();
        // The synthesizer already split; carry the action card through.
        state.report = result.report;
        state.actionCard = result.actionCard;
        state.modelUsed = result.modelUsed;
      }

      // Derive source badges from tool results
      const toolCounts = new Map<string, number>();
      for (const s of state.steps) {
        for (const r of s.results) {
          if (r.status === 'ok' && r.data) {
            const count = (toolCounts.get(r.tool) ?? 0) + 1;
            toolCounts.set(r.tool, count);
          }
        }
      }
      state.sources = [...toolCounts.entries()]
        .map(([name, items]) => ({
          name: name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          items,
        }))
        .sort((a, b) => b.items - a.items);

      state.steps.push(synthesizeStep);
      state.steps.push(qaStep);
      state.currentStep = qaStepNum;
      state.status = 'done';
      state.completedAt = new Date().toISOString();
    } catch (err) {
      console.error('handler failed:', err instanceof Error ? err.message : String(err));
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
