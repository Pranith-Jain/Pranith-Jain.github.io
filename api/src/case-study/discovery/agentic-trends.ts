import type { Candidate, DedupRecord, CaseStudyType } from '../types';
import { topicKey } from '../stable-keys';
import { recencyScore, severityScore, noveltyScore, finalScore } from '../scoring';

export interface AgenticTrendsDeps {
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
  groqKey?: string;
}

interface TrendCandidate {
  title: string;
  type: CaseStudyType;
  rationale: string;
  hook: string;
  angle: string;
  evidence: Record<string, unknown>;
  trendingSignal: number;
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

const SYSTEM_PROMPT = `You are a cybersecurity threat-intel analyst scanning for trending stories.

Today's date: {DATE}

Your task: Identify 5 genuinely trending cybersecurity stories RIGHT NOW that would make high-quality blog content. Look for:

1. **Active exploitation** — CVEs with proof-of-concept, active campaigns, real victims
2. **Emerging threat-actor activity** — new groups, shifted TTPs, notable campaigns
3. **Ransomware evolution** — new encryptors, extortion tactics, notable victims
4. **Novel attack techniques** — research papers, tooling, methodology shifts
5. **Policy/regulation shifts** — new disclosure rules, sanctions, cyber norms
6. **AI/ML security** — novel attacks on AI systems, AI-driven threats

CRITERIA for a "trending" story:
- It has real, specific details (not vague "cyber threats are rising")
- It affects multiple organizations or individuals
- It represents a notable change from the norm
- A practitioner would benefit from knowing about it TODAY

For each story, output a JSON object with these fields:
{
  "title": "Specific, compelling title (like a blog post title)",
  "type": "cve | actor | ransomware | breach | trend | analysis | aisec",
  "rationale": "One-line why this matters right now",
  "hook": "A strong, specific hook sentence that would stop a practitioner mid-scroll",
  "angle": "The unique analytical angle — what makes THIS story different from similar ones",
  "evidence": {
    "entities": ["specific actor names, CVE IDs, malware families"],
    "sources": ["likely sources covering this"],
    "impact": "specific impact description",
    "urgency": "why now — e.g. 'exploitation observed in the wild', 'new variant detected'"
  },
  "trendingSignal": 0.5 to 1.0 score
}

Return ONLY a valid JSON array. No markdown, no commentary.`;

function parseTrendResponse(text: string): TrendCandidate[] {
  const cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (parsed.trends && Array.isArray(parsed.trends)) return parsed.trends;
    if (parsed.candidates && Array.isArray(parsed.candidates)) return parsed.candidates;
    return [];
  } catch {
    const matches = cleaned.match(/\[[\s\S]*?\]/);
    if (matches) {
      try {
        return JSON.parse(matches[0]);
      } catch {
        return [];
      }
    }
    return [];
  }
}

const TYPE_MAP: Record<string, CaseStudyType> = {
  cve: 'cve',
  actor: 'actor',
  ransomware: 'ransom',
  breach: 'breach',
  trend: 'trend',
  analysis: 'analysis',
  aisec: 'aisec',
  malware: 'malware',
};

async function callGroq(key: string, prompt: string, userMsg: string): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: userMsg },
      ],
      max_completion_tokens: 4000,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`groq HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = j?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('groq empty response');
  return text;
}

export async function discoverAgenticTrends(deps: AgenticTrendsDeps): Promise<Candidate[]> {
  const { groqKey, now, getDedup } = deps;

  if (!groqKey) {
    console.warn('discoverAgenticTrends: GROQ_API_KEY not set, skipping');
    return [];
  }

  try {
    const prompt = SYSTEM_PROMPT.replace('{DATE}', now.toISOString().slice(0, 10));
    const userMsg = `What are the top trending cybersecurity stories as of ${now.toISOString().slice(0, 10)}? Focus on stories with real, specific details that a detection engineer or threat intel analyst would need to know about today.`;

    const text = await callGroq(groqKey, prompt, userMsg);
    console.log(JSON.stringify({ runner: 'agentic-trends', rawLength: text.length, preview: text.slice(0, 200) }));

    const trends = parseTrendResponse(text);
    if (trends.length === 0) {
      console.warn('discoverAgenticTrends: LLM returned no parseable trends');
      return [];
    }

    const candidates: Candidate[] = [];
    const seenKeys = new Set<string>();

    for (const t of trends) {
      const seed = t.title
        .slice(0, 80)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');
      const key = topicKey('agentic', seed);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const dedup = await getDedup(key);
      const trendingBoost = Math.min(1, Math.max(0, t.trendingSignal ?? 0.5));
      const score = finalScore({
        recency: 1.0,
        severity: severityScore({}),
        novelty: noveltyScore(dedup, now),
        sourceWeight: 0.8,
      });
      const adjustedScore = Number((score * 0.6 + trendingBoost * 0.4).toFixed(4));
      const type = TYPE_MAP[t.type?.toLowerCase()] ?? 'trend';

      candidates.push({
        key,
        type,
        title: t.title,
        rationale: t.rationale,
        score: adjustedScore,
        evidence: {
          ...t.evidence,
          hook: t.hook,
          angle: t.angle,
          trendingSignal: t.trendingSignal,
          source: 'agentic-trends',
          generatedAt: now.toISOString(),
        },
        discoveredAt: now.toISOString(),
        status: 'pending',
      });
    }

    console.log(
      JSON.stringify({
        runner: 'agentic-trends',
        trendsRequested: trends.length,
        candidatesGenerated: candidates.length,
      })
    );
    return candidates;
  } catch (err) {
    console.warn('discoverAgenticTrends failed:', err instanceof Error ? err.message : String(err));
    return [];
  }
}
