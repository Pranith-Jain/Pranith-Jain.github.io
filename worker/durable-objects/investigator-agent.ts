import type { Env } from '../env';
import type { Env as ApiEnv } from '../../api/src/env';
import type { AgentState, AgentStep, AgentToolResult, AgentToolCall, IocEntry } from '../../api/src/lib/agent/types';
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
  extractFindings,
} from '../../api/src/lib/agent/orchestrator';
import {
  SPECIALIST_REGISTRY,
  SPECIALIST_TOOLS,
  getToolsForSpecialist,
  getSpecialistsForQueryType,
  resolveRoutingQueryType,
  type SpecialistRole,
  type SpecialistFinding,
} from '../../api/src/lib/agent/specialist-types';
import { runParallelSpecialists, type SpecialistExecutor } from '../../api/src/lib/agent/parallel-specialists';
import {
  rebuildWorkingMemory,
  memoryToPrompt,
  shouldRetry,
  buildSelfCorrectionPrompt,
  type WorkingMemory,
} from '../../api/src/lib/agent/agent-framework';
import { getCachedResult, setCachedResult } from '../../api/src/lib/agent/agent-cache';
import { suggestAlternative } from '../../api/src/lib/agent/tool-retry';
import { saveInvestigationMemory } from '../../api/src/lib/agent/investigation-memory';
import {
  createCostTracker,
  isOverBudget,
  costSummary,
  recordCompletion,
  type InvestigationCost,
} from '../../api/src/lib/agent/cost-tracker';
import { checkDuplicate, registerInvestigation } from '../../api/src/lib/agent/request-dedup';
import { extractGraphFromSteps } from '../../api/src/lib/agent/ioc-graph';
import { createVersionedReport, addVersion, getVersionDiff } from '../../api/src/lib/agent/report-versioning';

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
 * Map a specialist finding to an action-card IOC entry type. Returns null for
 * finding kinds that aren't IOC-table material (techniques, campaigns, generic
 * intel) so they're excluded from the IOC list.
 */
function classifyFindingIocType(f: SpecialistFinding): IocEntry['type'] | null {
  switch (f.type) {
    case 'actor':
      return 'actor';
    case 'cve':
      return 'cve';
    case 'domain':
      return 'domain';
    case 'hash':
      return 'hash';
    case 'ioc': {
      const v = f.value.trim();
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) return 'ipv4';
      if (/^[a-f0-9]{32,64}$/i.test(v)) return 'hash';
      if (/^https?:\/\//i.test(v)) return 'url';
      if (/^[^@\s]+@[^@\s]+$/.test(v)) return 'email';
      return 'domain';
    }
    default:
      return null;
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
  /** Per-investigation cost trackers. */
  private costTrackers = new Map<string, InvestigationCost>();
  /** Cached degraded-tools note for adaptive tool selection (5-min TTL). */
  private degradedToolsCache: { at: number; note: string } | null = null;
  /** Cached confidence-calibration hint (10-min TTL). */
  private calibrationHintCache: { at: number; hint: string } | null = null;

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
      // Check for duplicate investigation
      const existingId = await checkDuplicate(body.query);
      if (existingId) {
        return Response.json({ id: existingId, status: 'running', duplicate: true });
      }

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
      // Register for dedup tracking
      await registerInvestigation(body.query, body.id);
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
      const agentId = this.sessionAgentIds.get(sessionId);
      this.sessionAgentIds.delete(sessionId);
      const remaining = this.ipConnections.get(clientIp) ?? 1;
      if (remaining <= 1) this.ipConnections.delete(clientIp);
      else this.ipConnections.set(clientIp, remaining - 1);
      // Evict the cost tracker for the agent this session was watching so
      // abandoned/crashed investigations don't leak memory. Completed
      // investigations delete their own entry (line ~906), but a client
      // disconnecting mid-investigation would otherwise leave it behind.
      if (agentId) this.costTrackers.delete(agentId);
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
            reportVersioning: next.reportVersioning,
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
    const workingMemory = this.buildWorkingMemory(state);

    // Adaptive tool selection: planner hint for tools with high recent failure.
    const degradedNote = await this.degradedToolsNote();

    // ── COST TRACKING ────────────────────────────────────────────────
    // Track token usage and costs per investigation.
    const costTracker = this.costTrackers.get(state.id) ?? createCostTracker();
    this.costTrackers.set(state.id, costTracker);
    const recordUsage = (model: string, inputText: string, outputText: string, role: string) =>
      recordCompletion(costTracker, model, inputText, outputText, role);

    // Check budget before proceeding
    if (isOverBudget(costTracker)) {
      return await this.doSynthesize(
        state,
        ai,
        groqKey,
        googleKey,
        nvidiaKey,
        stepNum,
        stepStart,
        'Budget exceeded — synthesizing with collected data.'
      );
    }

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

      // Cross-investigation memory: look up related past investigations and
      // build a prior-intelligence note for the planner (closed feedback loop).
      if (!state.priorIntelligence) {
        try {
          const db = (this.env as unknown as ApiEnv).BRIEFINGS_DB;
          if (db) {
            const { extractQueryEntities, hasIndicators, entitiesToMemoryIndicators } =
              await import('../../api/src/lib/agent/query-entities');
            const entities = extractQueryEntities(state.query);
            if (hasIndicators(entities)) {
              const { lookupMemory, buildPriorIntelNote } =
                await import('../../api/src/lib/agent/investigation-memory');
              const related = await lookupMemory(db, entitiesToMemoryIndicators(entities));
              state.priorIntelligence = buildPriorIntelNote(related);
            }
          }
        } catch (_catchErr) {
          console.error('memory lookup failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
          // Non-fatal — proceed without prior intelligence
        }
      }

      // Run independent specialists' first step concurrently. Returns null (fall
      // back to the sequential path above) when <2 specialists are independent
      // or on any error, so this is purely additive.
      const burst = await this.tryParallelBurst(state, ai, groqKey, googleKey, nvidiaKey, allTools, workingMemory);
      if (burst) return burst;
    } else if (currentRole) {
      // Check if current specialist's exit conditions have fired
      const specialistCheck = checkSpecialistExit(
        currentRole,
        state.steps,
        stepNum,
        state.maxSteps,
        state.queryType,
        state.query
      );
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
      const specialistContext =
        (specialistPrompt
          ? `\n<specialist_role>${SPECIALIST_REGISTRY[currentRole].label}</specialist_role>\n<specialist_instructions>${specialistPrompt}</specialist_instructions>`
          : '') +
          degradedNote +
          (state.priorIntelligence ?? '') || undefined;

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
        const specialistCheck = checkSpecialistExit(
          currentRole,
          state.steps,
          stepNum,
          state.maxSteps,
          state.queryType,
          state.query
        );
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
      step.observerFindings = {
        iocs: observation.iocs,
        mitre: observation.mitre,
        keyFacts: observation.keyFacts,
        confidence: observation.confidence,
        gaps: observation.gaps,
      };
      step.nextAction = 'continue';
      step.status = 'done';

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
        specialistContext: degradedNote + (state.priorIntelligence ?? '') || undefined,
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
    step.observerFindings = {
      iocs: observation.iocs,
      mitre: observation.mitre,
      keyFacts: observation.keyFacts,
      confidence: observation.confidence,
      gaps: observation.gaps,
    };
    step.nextAction = 'continue';
    step.status = 'done';

    state.steps.push(step);
    state.currentStep = stepNum;

    return state;
  }

  /**
   * Run a contiguous prefix of independent specialists concurrently for their
   * first step. Only specialists whose tool sets don't overlap any
   * already-selected specialist are included (stops at the first overlap, so no
   * specialist is skipped). Returns the updated state, or null to fall back to
   * the sequential path. Purely additive — any error returns null.
   */
  private async tryParallelBurst(
    state: AgentState,
    ai: ApiEnv['AI'],
    groqKey: string | undefined,
    googleKey: string | undefined,
    nvidiaKey: string | undefined,
    allTools: ReturnType<typeof buildToolRegistry>,
    workingMemory: WorkingMemory
  ): Promise<AgentState | null> {
    try {
      const roles = getSpecialistsForQueryType(state.queryType, state.query);
      const burst: SpecialistRole[] = [];
      const usedTools = new Set<string>();
      for (const role of roles) {
        const tools = SPECIALIST_TOOLS[role];
        if (tools.some((t) => usedTools.has(t))) break;
        burst.push(role);
        for (const t of tools) usedTools.add(t);
      }
      if (burst.length < 2) return null;

      const opts = { groqKey, googleKey, nvidiaKey };
      const executor: SpecialistExecutor = {
        plan: (role, tools, steps, sn, ms) => {
          const prompt = getSpecialistPrompt(role, tools, sn, ms, state.query, steps);
          const specialistContext = prompt
            ? `\n<specialist_role>${SPECIALIST_REGISTRY[role].label}</specialist_role>\n<specialist_instructions>${prompt}</specialist_instructions>`
            : undefined;
          return planNextStep(ai, state.query, state.queryType, steps, sn, ms, tools, {
            ...opts,
            specialistContext,
            workingMemory,
          });
        },
        execute: (calls, tools) => this.executeTools(calls, tools),
        observe: (sn, reasoning, results) => observeStep(ai, sn, reasoning, results, opts),
        guard: (role, calls, view) => {
          const valid = new Set(getToolsForSpecialist(role, allTools).map((t) => t.name));
          return applySpecialistGuardrails(role, filterCtiToolCalls(calls, view, valid), view);
        },
      };

      const results = await runParallelSpecialists(burst, allTools, 1, executor);
      const newSteps = results.flatMap((r) => r.steps);
      if (newSteps.length === 0) return null;

      let sn = state.currentStep;
      for (const s of newSteps) {
        sn += 1;
        s.stepNumber = sn;
      }
      state.steps.push(...newSteps);
      state.currentStep = sn;
      // Continue the chain from the last burst specialist; the next alarm's
      // checkSpecialistExit advances to the following specialist.
      state.currentSpecialist = burst[burst.length - 1];
      state.usedParallelBurst = true;
      return state;
    } catch (err) {
      console.error(
        'parallel burst failed, falling back to sequential:',
        err instanceof Error ? err.message : String(err)
      );
      return null;
    }
  }

  /** Execute tool calls in parallel, collecting results. Uses cache for repeat calls. */
  private async executeTools(
    calls: AgentToolCall[],
    tools: ReturnType<typeof buildToolRegistry>
  ): Promise<AgentToolResult[]> {
    const toolMap = new Map(tools.map((t) => [t.name, t]));
    const results: AgentToolResult[] = [];
    const allToolNames = new Set(tools.map((t) => t.name));
    const calledKeys = new Set(calls.map((c) => `${c.tool}:${JSON.stringify(c.args)}`));

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
        // Tool retry: try an alternative tool if available
        const alt = suggestAlternative(call, allToolNames, calledKeys);
        if (alt) {
          const altTool = toolMap.get(alt.tool);
          if (altTool) {
            try {
              const altStart = Date.now();
              const altData = await Promise.race([
                altTool.execute(alt.args),
                new Promise<never>((_, reject) => {
                  setTimeout(() => reject(new Error('Alt tool timeout')), 20_000);
                }),
              ]);
              await setCachedResult(alt.tool, alt.args, altData);
              return { tool: alt.tool, args: alt.args, status: 'ok', data: altData, durationMs: Date.now() - altStart };
            } catch {
              // Alt also failed — fall through to error
            }
          }
        }

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
   * Build working memory from the current state's steps. Delegates to the
   * shared pure helper so the reconstruction logic is unit-testable.
   */
  private buildWorkingMemory(state: AgentState): WorkingMemory {
    return rebuildWorkingMemory(state.steps);
  }

  /**
   * Adaptive tool selection: return a planner hint listing tools with a high
   * recent failure rate (from historical metrics) so the agent deprioritizes
   * them. Cached for 5 minutes to avoid a D1 read per step.
   */
  private async degradedToolsNote(): Promise<string> {
    const now = Date.now();
    if (this.degradedToolsCache && now - this.degradedToolsCache.at < 5 * 60 * 1000) {
      return this.degradedToolsCache.note;
    }
    let note = '';
    try {
      const db = (this.env as unknown as ApiEnv).BRIEFINGS_DB;
      if (db) {
        const { getToolHealth, selectDegradedTools } = await import('../../api/src/lib/agent/observability');
        const degraded = selectDegradedTools(await getToolHealth(db));
        if (degraded.length > 0) {
          note = `\n<degraded_tools>Deprioritize these tools (high recent failure rate): ${degraded.join(', ')}. Prefer alternatives when available.</degraded_tools>`;
        }
      }
    } catch (err) {
      console.error('degradedToolsNote failed:', err instanceof Error ? err.message : String(err));
    }
    this.degradedToolsCache = { at: now, note };
    return note;
  }

  /**
   * Confidence calibration: return a synthesizer hint built from historical
   * confidence-accuracy stats, so the agent calibrates confidence honestly.
   * Cached for 10 minutes.
   */
  private async calibrationHint(): Promise<string> {
    const now = Date.now();
    if (this.calibrationHintCache && now - this.calibrationHintCache.at < 10 * 60 * 1000) {
      return this.calibrationHintCache.hint;
    }
    let hint = '';
    try {
      const db = (this.env as unknown as ApiEnv).BRIEFINGS_DB;
      if (db) {
        const { getCalibrationHint } = await import('../../api/src/lib/agent/confidence-calibration');
        hint = await getCalibrationHint(db);
      }
    } catch (err) {
      console.error('calibrationHint failed:', err instanceof Error ? err.message : String(err));
    }
    this.calibrationHintCache = { at: now, hint };
    return hint;
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
        calibrationHint: await this.calibrationHint(),
        onToken: (token) => this.broadcast({ type: 'token', token }),
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

        // Track report versions so the self-correction before/after is auditable.
        let versioned = addVersion(createVersionedReport(state.id), result.report, {
          qualityScore: qa.qualityScore,
          modelUsed: qa.modelUsed,
          reason: 'Initial synthesis + QA',
        });

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
          const { report: correctedText, modelUsed: correctedModel } = await synthesizeReport(
            ai,
            state.query,
            state.queryType,
            state.steps,
            {
              groqKey,
              googleKey,
              nvidiaKey,
              dataQuality: { totalOk, totalErr, emptyResults },
              correctionPrompt,
            }
          );

          const { report: correctedProse, actionCard: correctedCard } = splitSynthOutput(correctedText);

          // Re-verify the corrected report
          const qa2 = await verifyReport(ai, state.query, state.queryType, correctedProse, state.steps, {
            groqKey,
            googleKey,
            nvidiaKey,
          });

          // Record the corrected draft as version 2 (whether or not it wins).
          versioned = addVersion(versioned, correctedProse, {
            qualityScore: qa2.qualityScore,
            modelUsed: qa2.modelUsed,
            reason: 'Self-correction retry',
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

        // Surface the version history + compact diff when a correction happened.
        if (versioned.versions.length > 1) {
          const diff = getVersionDiff(versioned, 1, versioned.currentVersion);
          state.reportVersioning = {
            versions: versioned.versions.map((v) => ({
              version: v.version,
              qualityScore: v.qualityScore,
              modelUsed: v.modelUsed,
              reason: v.reason,
            })),
            diff: diff
              ? {
                  fromVersion: diff.fromVersion,
                  toVersion: diff.toVersion,
                  fromScore: diff.fromScore,
                  toScore: diff.toScore,
                  additions: diff.additions,
                  deletions: diff.deletions,
                }
              : undefined,
          };
        }

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

      // Derive the relationship graph deterministically from tool results and
      // attach it to the action card for the UI (no LLM involved → no hallucination).
      if (state.actionCard) {
        const graph = extractGraphFromSteps(state.steps);
        if (graph.nodes.length > 0) state.actionCard.graph = graph;
      }

      // Extract typed findings from all tool results (orchestrator's
      // extractFindings, previously dead code) and merge tool-grounded IOCs into
      // the action card, deduped against whatever the synthesizer emitted.
      const findings: SpecialistFinding[] = [];
      const seenFinding = new Set<string>();
      for (const s of state.steps) {
        for (const r of s.results) {
          if (r.status !== 'ok' || !r.data) continue;
          for (const f of extractFindings(r, undefined, s.stepNumber)) {
            const key = `${f.type}:${f.value.toLowerCase()}`;
            if (seenFinding.has(key)) continue;
            seenFinding.add(key);
            findings.push(f);
          }
        }
      }
      state.findings = findings;

      if (state.actionCard) {
        const existing = new Set(state.actionCard.iocs.map((i) => i.value.toLowerCase()));
        const confMap = { high: 'Confirmed', medium: 'Probable', low: 'Possible' } as const;
        for (const f of findings) {
          if (existing.has(f.value.toLowerCase())) continue;
          const type = classifyFindingIocType(f);
          if (!type) continue;
          state.actionCard.iocs.push({ type, value: f.value, confidence: confMap[f.confidence], source: f.source });
          existing.add(f.value.toLowerCase());
        }
      }

      state.steps.push(synthesizeStep);
      state.steps.push(qaStep);
      state.currentStep = qaStepNum;
      state.status = 'done';
      state.completedAt = new Date().toISOString();

      // Save investigation memory for cross-session context
      const db = (this.env as unknown as ApiEnv).BRIEFINGS_DB;
      if (db) {
        const mem = this.buildWorkingMemory(state);
        await saveInvestigationMemory(db, {
          query: state.query,
          queryType: state.queryType,
          iocs: mem.iocs.map((i) => ({ type: i.type, value: i.value, confidence: i.confidence })),
          actors: mem.actors,
          mitre: mem.mitre.map((m) => m.id),
          cves: mem.cves,
          keyFindings: mem.keyFacts.slice(0, 10),
          qualityScore: state.qa?.qualityScore ?? 0,
          modelUsed: state.modelUsed ?? '',
          completedAt: state.completedAt,
        });

        // Record metrics for observability
        const { recordMetrics } = await import('../../api/src/lib/agent/observability');
        const durationMs = new Date(state.completedAt).getTime() - new Date(state.startedAt).getTime();
        const toolsUsed = [...new Set(state.steps.flatMap((s) => s.results.map((r) => r.tool)))];
        const toolTimings = state.steps.flatMap((s) =>
          s.results.map((r) => ({ name: r.tool, ms: r.durationMs, ok: r.status === 'ok' }))
        );
        const diff = state.reportVersioning?.diff;
        await recordMetrics(db, {
          query: state.query,
          status: state.status,
          totalSteps: state.steps.length,
          durationMs,
          qualityScore: state.qa?.qualityScore ?? 0,
          modelUsed: state.modelUsed ?? '',
          toolsUsed,
          toolTimings,
          meta: {
            parallelBurst: state.usedParallelBurst === true,
            selfCorrection: (state.reportVersioning?.versions.length ?? 0) > 1,
            scoreDelta: diff ? diff.toScore - diff.fromScore : undefined,
            routingRefined: resolveRoutingQueryType(state.query, state.queryType) !== state.queryType,
            findings: state.findings?.length ?? 0,
            graphNodes: state.actionCard?.graph?.nodes.length ?? 0,
          },
          error: state.error ?? undefined,
          completedAt: state.completedAt,
        });

        // Record confidence calibration — predicted verdict confidence vs the
        // QA-derived actual outcome. Feeds getCalibrationStats accuracy tracking.
        const { recordCalibration } = await import('../../api/src/lib/agent/confidence-calibration');
        const predictedConfidence = state.actionCard?.verdict.confidence ?? 'medium';
        const calScore = state.qa?.qualityScore ?? 0;
        await recordCalibration(db, {
          query: state.query,
          predictedConfidence,
          actualOutcome: calScore >= 75 ? 'correct' : calScore >= 50 ? 'partial' : 'incorrect',
          qualityScore: calScore,
          modelUsed: state.modelUsed ?? '',
          recordedAt: state.completedAt,
        });
      }

      // Clean up cost tracker
      this.costTrackers.delete(state.id);
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
