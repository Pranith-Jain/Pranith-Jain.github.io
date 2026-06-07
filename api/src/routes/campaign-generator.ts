import type { Context } from 'hono';
import type { Env } from '../env';
import { runCompletion, RateLimitError } from '../case-study/generation/ai-client';
import { safeJsonBody } from '../lib/safe-body';

/**
 * AI-driven threat campaign generator.
 *
 * Takes a short analyst brief — actor name, observed TTPs, target sector,
 * a handful of IOCs — and returns a structured campaign hypothesis:
 * narrative, kill-chain mapping, suggested hunts, and confidence.
 *
 * The model is constrained to the supplied inputs; it must not introduce
 * actor names, malware families, or CVEs that weren't given. We enforce
 * that with a strict system prompt and a JSON-only contract, then drop
 * any field that fails schema validation.
 *
 * This is a creative-assist, not an attribution engine. The response
 * carries an explicit `confidence` and a `caveats` list so the analyst
 * knows what the model invented vs. what it summarised.
 */

const MAX_INPUT_CHARS = 8_000;
const MAX_IOCS = 30;
const SYSTEM_PROMPT = `You are a senior cyber threat intelligence analyst. The user will give you a brief description of suspected attacker activity. Produce a STRUCTURED threat-campaign hypothesis in valid JSON ONLY — no prose, no markdown fences, no commentary outside the JSON.

Schema:
{
  "campaign_name": "short codename (3-5 words)",
  "summary": "2-3 sentence narrative of the suspected campaign",
  "actor_context": "1-2 sentences on the suspected actor and motivation — only use the actor the user named",
  "kill_chain": [{"phase": "recon|weaponization|delivery|exploitation|installation|c2|actions", "description": "what likely happens in this phase"}],
  "mitre_techniques": [{"id": "T####", "name": "technique name", "rationale": "why this maps"}],
  "hunting_hypotheses": ["specific hypothesis an analyst can run a hunt for"],
  "detection_opportunities": ["concrete detection idea (event ID, log source, sigma-friendly pseudocode)"],
  "iocs_to_pivot": ["which of the provided IOCs are highest priority to pivot on, and why"],
  "confidence": "low|medium|high",
  "caveats": ["explicit limitations or alternative hypotheses"]
}

Hard rules:
- Use ONLY actor names, malware families, CVEs, or IOC values the user provided. Do NOT invent named entities.
- MITRE techniques must be real ATT&CK IDs (T1234 or T1234.001 format). If unsure, omit rather than guess.
- Keep the JSON small — 1500 tokens is a hard ceiling. Trim arrays before bloating prose.
- Return ONLY the JSON object. No \`\`\`json fences. No leading "Here is".`;

interface CampaignInput {
  actor?: string;
  sector?: string;
  ttps?: string;
  iocs?: string[];
  notes?: string;
}

interface CampaignRequestBody {
  input?: CampaignInput;
}

interface KillChainStep {
  phase: string;
  description: string;
}
interface MitreTechRef {
  id: string;
  name: string;
  rationale: string;
}
interface CampaignDoc {
  campaign_name: string;
  summary: string;
  actor_context: string;
  kill_chain: KillChainStep[];
  mitre_techniques: MitreTechRef[];
  hunting_hypotheses: string[];
  detection_opportunities: string[];
  iocs_to_pivot: string[];
  confidence: 'low' | 'medium' | 'high';
  caveats: string[];
}

const ATTACK_ID_RE = /^T\d{4}(?:\.\d{3})?$/;
const KILL_CHAIN_PHASES = new Set([
  'recon',
  'weaponization',
  'delivery',
  'exploitation',
  'installation',
  'c2',
  'actions',
]);

function asStr(v: unknown, max = 800): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
function asStrArr(v: unknown, max = 12, eachMax = 400): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim().slice(0, eachMax))
    .filter(Boolean)
    .slice(0, max);
}

function extractBalancedJson(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]!;
    if (esc) {
      esc = false;
      continue;
    }
    if (inStr) {
      if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function validate(raw: unknown): CampaignDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const confidenceRaw = asStr(r.confidence, 16).toLowerCase();
  const confidence: CampaignDoc['confidence'] =
    confidenceRaw === 'high' || confidenceRaw === 'medium' ? confidenceRaw : 'low';

  const killChainRaw = Array.isArray(r.kill_chain) ? r.kill_chain : [];
  const killChain: KillChainStep[] = killChainRaw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({ phase: asStr(x.phase, 32).toLowerCase(), description: asStr(x.description, 400) }))
    .filter((x) => KILL_CHAIN_PHASES.has(x.phase) && x.description)
    .slice(0, 8);

  const mitreRaw = Array.isArray(r.mitre_techniques) ? r.mitre_techniques : [];
  const mitre: MitreTechRef[] = mitreRaw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({
      id: asStr(x.id, 12).toUpperCase(),
      name: asStr(x.name, 120),
      rationale: asStr(x.rationale, 300),
    }))
    .filter((x) => ATTACK_ID_RE.test(x.id) && x.name)
    .slice(0, 12);

  const doc: CampaignDoc = {
    campaign_name: asStr(r.campaign_name, 80) || 'Unnamed campaign',
    summary: asStr(r.summary, 600),
    actor_context: asStr(r.actor_context, 400),
    kill_chain: killChain,
    mitre_techniques: mitre,
    hunting_hypotheses: asStrArr(r.hunting_hypotheses, 8, 300),
    detection_opportunities: asStrArr(r.detection_opportunities, 8, 400),
    iocs_to_pivot: asStrArr(r.iocs_to_pivot, 10, 200),
    confidence,
    caveats: asStrArr(r.caveats, 6, 240),
  };

  if (!doc.summary && doc.kill_chain.length === 0 && doc.mitre_techniques.length === 0) {
    return null;
  }
  return doc;
}

function buildUserPrompt(input: CampaignInput): string {
  const parts: string[] = [];
  if (input.actor) parts.push(`Suspected actor: ${input.actor}`);
  if (input.sector) parts.push(`Targeted sector / region: ${input.sector}`);
  if (input.ttps) parts.push(`Observed TTPs / behaviour:\n${input.ttps}`);
  if (input.iocs && input.iocs.length > 0) {
    parts.push(`IOCs (do not invent any others):\n- ${input.iocs.slice(0, MAX_IOCS).join('\n- ')}`);
  }
  if (input.notes) parts.push(`Additional notes:\n${input.notes}`);
  if (parts.length === 0)
    parts.push('No inputs — return a JSON object with confidence "low" and caveats explaining the gap.');
  return parts.join('\n\n');
}

export async function campaignGeneratorHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const parsed = await safeJsonBody<CampaignRequestBody>(c, { maxBytes: 16 * 1024, maxDepth: 6 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;
  const input: CampaignInput = body.input ?? {};

  const actor = asStr(input.actor, 120);
  const sector = asStr(input.sector, 200);
  const ttps = asStr(input.ttps, 3_000);
  const notes = asStr(input.notes, 2_000);
  const iocs = asStrArr(input.iocs, MAX_IOCS, 300);

  const totalChars = actor.length + sector.length + ttps.length + notes.length + iocs.join('\n').length;
  if (totalChars === 0) {
    return c.json({ error: 'empty input — provide actor, ttps, iocs, sector or notes' }, 400);
  }
  if (totalChars > MAX_INPUT_CHARS) {
    return c.json({ error: `input too long (${totalChars}/${MAX_INPUT_CHARS} chars)` }, 400);
  }

  const userPrompt = buildUserPrompt({ actor, sector, ttps, notes, iocs });

  let completionText: string;
  let modelUsed: string;
  try {
    const out = await runCompletion(
      c.env.AI,
      { system: SYSTEM_PROMPT, user: userPrompt, maxTokens: 1500, temperature: 0.3 },
      { groqKey: c.env.GROQ_API_KEY, quality: true }
    );
    completionText = out.text;
    modelUsed = out.modelUsed;
  } catch (err) {
    if (err instanceof RateLimitError) {
      return c.json({ error: 'AI rate limited — try again in a few minutes', detail: err.message }, 429);
    }
    return c.json({ error: 'campaign generation failed', detail: (err as Error).message }, 502);
  }

  const json = extractBalancedJson(completionText);
  if (!json) {
    return c.json(
      { error: 'model returned no parseable JSON', raw: completionText.slice(0, 1000), model_used: modelUsed },
      502
    );
  }
  let modelParsed: unknown;
  try {
    modelParsed = JSON.parse(json);
  } catch {
    return c.json({ error: 'model JSON malformed', raw: json.slice(0, 1000), model_used: modelUsed }, 502);
  }
  const doc = validate(modelParsed);
  if (!doc) {
    return c.json({ error: 'model output failed schema validation', raw: modelParsed, model_used: modelUsed }, 502);
  }

  return c.json(
    {
      input: { actor, sector, ttps, iocs, notes },
      campaign: doc,
      model_used: modelUsed,
      generated_at: new Date().toISOString(),
    },
    200,
    { 'Cache-Control': 'no-store' }
  );
}
