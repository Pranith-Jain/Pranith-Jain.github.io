import type { Context } from 'hono';
import type { Env } from '../env';
import { queryCorpus } from '../lib/rag-embedder';
import { findUngroundedCves, findInvalidMitreIds } from '../lib/ai-output-validator';

// ── Types ─────────────────────────────────────────────────────────────────

export interface AchEvidence {
  claim: string;
  source: string;
  relevance: 'high' | 'medium' | 'low';
}

export interface AchHypothesis {
  id: string;
  label: string;
  description: string;
  confidence: number; // 0–100
  evidence_for: AchEvidence[];
  evidence_against: AchEvidence[];
  diagnostic_value: 'high' | 'medium' | 'low';
  /** What new evidence would change this hypothesis's rank */
  what_would_change: string;
}

export interface AchResponse {
  topic: string;
  question: string;
  generated_at: string;
  hypotheses: AchHypothesis[];
  key_assumptions: string[];
  recommended_collection: string[];
  model_used: string;
  _validation?: {
    ungrounded_cves?: string[];
    invalid_mitre_ids?: string[];
  };
}

// ── LLM prompt builder ────────────────────────────────────────────────────

function buildAchSystemPrompt(): string {
  return `<role>You are a senior CTI analyst performing Analysis of Competing Hypotheses (ACH). Your task is to generate a structured ACH matrix for an intelligence question.</role>

<task>
Given the provided context about a threat intelligence topic, generate 3-5 competing hypotheses that explain the available evidence. For each hypothesis:
  - Provide a concise label and description
  - List evidence FOR the hypothesis (extracted from context)
  - List evidence AGAINST the hypothesis (extracted from context, or gaps that weaken it)
  - Rate each evidence item's relevance (high/medium/low)
  - Estimate confidence (0–100) based on strength of supporting evidence vs contradictory
  - Rate diagnostic value (how much would new evidence change this hypothesis's probability)
  - Describe what specific new evidence would change your assessment of this hypothesis

Then identify:
  - 2-4 key assumptions underlying the analysis (unstated premises that if wrong would invalidate the assessment)
  - 2-3 recommended collection priorities (what new intelligence would most help discriminate between hypotheses)
</task>

<ground_rules>
- Every evidence claim MUST cite its source using the XML ref attributes provided
- Do NOT invent evidence — only use what's in the provided context
- Confidence scores must reflect the reliability of sources (Admiralty grading: A=highest, F=lowest)
- Hypotheses should be genuinely competing — they should represent different explanations for the same observations
- If the data strongly favors one hypothesis, reflect that in the confidence gap between hypotheses
- Output ONLY valid JSON matching the schema below, no markdown wrapping
</ground_rules>

<output_schema>
{
  "question": "string — the analytical question being addressed",
  "hypotheses": [
    {
      "label": "short label e.g. 'State-sponsored APT'",
      "description": "2-3 sentence explanation of this hypothesis",
      "confidence": 0-100,
      "evidence_for": [{ "claim": "string", "source": "source name from ref", "relevance": "high|medium|low" }],
      "evidence_against": [{ "claim": "string", "source": "source name from ref", "relevance": "high|medium|low" }],
      "diagnostic_value": "high|medium|low",
      "what_would_change": "specific evidence that would change this assessment"
    }
  ],
  "key_assumptions": ["string"],
  "recommended_collection": ["string"]
}
</output_schema>`;
}

function buildAchUserPrompt(topic: string, corpusContext: string, sourceContext: string): string {
  return `<topic>${topic}</topic>

<retrieved_corpus>
${corpusContext || 'No corpus context retrieved.'}
</retrieved_corpus>

<live_sources>
${sourceContext || 'No live source data.'}
</live_sources>`;
}

// ── Corpus context gathering ──────────────────────────────────────────────

async function gatherAchContext(
  env: Env,
  topic: string
): Promise<{ corpus: string; sources: string; sourceNames: string[] }> {
  const sourceNames: string[] = [];

  // Vectorize corpus
  let corpus = '';
  try {
    if (env.VECTORIZE) {
      const results = await queryCorpus(env, topic, 12, undefined);
      if (results.length > 0) {
        corpus = results
          .map(
            (r, i) =>
              `<corpus ref="C${i + 1}" score="${r.score.toFixed(3)}" source="${r.metadata.source_type ?? 'unknown'}">\n${r.metadata.text ?? ''}\n</corpus>`
          )
          .join('\n\n');
      }
    }
  } catch {
    /* non-fatal */
  }

  // Recent telegram leaks from D1
  let sources = '';
  try {
    const db = env.BRIEFINGS_DB;
    if (db) {
      const rows = (await db
        .prepare(
          `SELECT message_text, channel_handle, discovered_at FROM telegram_leak_entries WHERE message_text IS NOT NULL AND length(message_text) > 20 ORDER BY discovered_at DESC LIMIT 15`
        )
        .all()) as { results?: Array<{ message_text: string; channel_handle: string; discovered_at: string }> };
      if (rows.results && rows.results.length > 0) {
        sources = rows.results
          .map(
            (r, i) =>
              `<telegram ref="T${i + 1}" channel="${r.channel_handle}" date="${r.discovered_at}">\n${r.message_text.slice(0, 500)}\n</telegram>`
          )
          .join('\n\n');
        sourceNames.push('telegram-leak-monitor');
      }
    }
  } catch {
    /* non-fatal */
  }

  return { corpus, sources, sourceNames };
}

// ── LLM call ──────────────────────────────────────────────────────────────

async function callLlm(env: Env, system: string, user: string): Promise<string> {
  const key = env.GROQ_API_KEY;
  if (key) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        // ACH scoring is a single LLM call; 30s matches the LLM
        // call ceiling used by the other Groq-bound routes.
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          max_completion_tokens: 4000,
          temperature: 0.2,
          reasoning_effort: 'medium',
        }),
      });
      if (res.ok) {
        const data = await res.json<{ choices?: Array<{ message?: { content?: string } }> }>();
        return data?.choices?.[0]?.message?.content ?? '';
      }
    } catch {
      /* fall through */
    }
  }

  const res = (await env.AI.run(
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast' as Parameters<typeof env.AI.run>[0],
    {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 4000,
      temperature: 0.2,
    } as Parameters<typeof env.AI.run>[1]
  )) as { response?: string };
  return res.response ?? '';
}

// ── Handler ───────────────────────────────────────────────────────────────

export async function achHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<{ topic: string }>();
    const topic = body.topic?.trim();
    if (!topic || topic.length < 3) {
      return c.json({ error: 'topic is required (min 3 chars)' }, 400);
    }

    const { corpus, sources } = await gatherAchContext(c.env, topic);
    const sourceData = corpus + '\n' + sources;

    const system = buildAchSystemPrompt();
    const user = buildAchUserPrompt(topic, corpus, sources);
    const raw = await callLlm(c.env, system, user);
    if (!raw) return c.json({ error: 'LLM returned empty response' }, 502);

    // Parse JSON from LLM response — handle potential markdown wrapping
    let parsed: Omit<AchResponse, 'topic' | 'generated_at' | 'model_used'>;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      return c.json({ error: 'LLM response was not valid JSON', raw }, 502);
    }

    // Validate grounding: check for hallucinated CVEs and invalid ATT&CK IDs
    const rawText = JSON.stringify(parsed);
    const ungroundedCves = findUngroundedCves(rawText, sourceData);
    const invalidMitre = findInvalidMitreIds(rawText);

    const response: AchResponse = {
      ...parsed,
      topic,
      generated_at: new Date().toISOString(),
      model_used: 'llama-4-scout-17b-16e-instruct',
      _validation: {
        ungrounded_cves: ungroundedCves.length > 0 ? ungroundedCves : undefined,
        invalid_mitre_ids: invalidMitre.length > 0 ? invalidMitre : undefined,
      },
    };

    return c.json(response, 200, { 'Cache-Control': 'no-store' });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
