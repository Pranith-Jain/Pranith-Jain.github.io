import type { Candidate, DedupRecord, CaseStudyType } from '../types';
import { topicKey } from '../stable-keys';
import { severityScore, noveltyScore, finalScore } from '../scoring';

export interface AgenticTrendsDeps {
  now: Date;
  getDedup: (stableKey: string) => Promise<DedupRecord | null>;
  groqKey?: string;
  /** Optional real trending data to ground the LLM response (recent CVEs,
   *  ransomware victims, breach headlines, etc.). When absent the LLM
   *  hallucinates from training data, producing similar output every day. */
  trendingContext?: string;
  /** List of dedup keys surfaced in the last 14 days. The LLM is instructed
   *  to actively avoid these topics, ensuring genuinely fresh suggestions. */
  alreadyCoveredTopics?: string[];
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

const CATEGORY_POOLS = [
  ['ransomware-evolution', 'supply-chain-attacks', 'mobile-threats'],
  ['cloud-security', 'identity-theft', 'cryptocurrency-crime'],
  ['ics-scada-ot', 'ai-ml-security', 'data-breach'],
  ['state-sponsored-apt', 'phishing-campaigns', 'vulnerability-exploitation'],
  ['iot-security', 'malware-evolution', 'cyber-policy-regulation'],
  ['critical-infrastructure', 'attack-technique-innovation', 'dark-web-forums'],
  ['threat-intel-tradecraft', 'incident-response', 'zero-day-exploits'],
  ['c2-infrastructure', 'info-stealer-malware', 'ransomware-extortion'],
  ['social-engineering', 'network-perimeter', 'supply-chain-pipeline'],
  ['bug-bounty-disclosure', 'api-security', 'container-kubernetes'],
];

const DIVERSITY_SEEDS = [
  'Focus on stories from non-English sources or regions outside the US/Europe.',
  'Find stories involving lesser-known threat groups or niche malware families.',
  'Look for positive developments: new defenses, takedowns, indictments, patches.',
  'Highlight stories with measurable impact: numbers affected, financial loss, downtime.',
  'Find stories about novel TTPs or attacker tradecraft shifts (not just new vulns).',
  'Look for stories involving critical infrastructure or government targets.',
  'Focus on supply chain and third-party risk stories.',
  'Find stories about emerging attack surfaces: AI agents, edge computing, SaaS.',
  'Look for stories about cyber insurance, disclosure norms, or regulatory action.',
  'Find stories with actionable IOCs or detection rules practitioners can use today.',
];

const SYSTEM_PROMPT = `You are a cybersecurity threat-intel analyst scanning for trending stories.

Today's date: {DATE}
Diversity challenge: {DIVERSITY_SEED}
Focus categories for today: {CATEGORIES}

Your task: Create 3 cybersecurity story ideas that would make high-quality blog content. Each must be DIFFERENT from any of these recently-covered topics: {ALREADY_COVERED}

If ALL categories or angles look like they'd overlap with covered topics, pivot HARD to a different angle, region, or threat type. Repetition is the single worst failure mode.

{TRENDING_CONTEXT}

CRITICAL UNIQUENESS RULES:
- Every story MUST be distinct from the recently-covered list above
- If you cannot find a truly unique angle, skip that slot rather than repeating
- The same CVE ID, group name, or malware family must NOT appear in your output if it was recently covered
- Geographical and sector diversity matters: don't always pick US healthcare or European tech
- Each story must target a different primary audience (SOC, DFIR, CISO, dev, researcher)

CRITERIA for each story:
- Specific, real details (not vague "cyber threats are rising")
- Affects multiple organizations or individuals
- Practitioner would benefit TODAY
- If a recent CVE, include its CVE ID
- If a ransomware group, name the group and victim

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
  "trendingSignal": 0.85
}

Return ONLY a valid JSON array of exactly 3 items. No markdown, no commentary.`;

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
      temperature: 0.9,
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
  const { groqKey, now, getDedup, trendingContext, alreadyCoveredTopics } = deps;

  if (!groqKey) {
    console.warn('discoverAgenticTrends: GROQ_API_KEY not set, skipping');
    return [];
  }

  try {
    // Multi-axis diversity to ensure genuinely different content every run:
    // 1. Category pool rotation (10 pools, cycles every 10 days)
    // 2. Diversity seed rotation (10 seeds, changes daily angle)
    // 3. Already-covered list from dedup (LLM actively avoids these)
    // 4. Real trending context from platform feeds
    // 5. High temperature (0.9) for LLM output variance
    const dayOfYear = Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400000);
    const poolIndex = dayOfYear % CATEGORY_POOLS.length;
    const seedIndex = dayOfYear % DIVERSITY_SEEDS.length;
    const todaysCategories = CATEGORY_POOLS[poolIndex]!.join(', ');
    const todaysSeed = DIVERSITY_SEEDS[seedIndex]!;
    // Format recently-covered topics as a compact list for the LLM prompt.
    // Limit to ~2000 chars to avoid blowing the token budget.
    const coveredList = alreadyCoveredTopics?.length
      ? alreadyCoveredTopics.slice(0, 80).join(', ').slice(0, 2000)
      : 'none yet today';
    const trendingSnippet = trendingContext
      ? `\nRecent data from platform feeds:\n${trendingContext.slice(0, 2000)}`
      : '';

    const prompt = SYSTEM_PROMPT.replace('{DATE}', now.toISOString().slice(0, 10))
      .replace('{DIVERSITY_SEED}', todaysSeed)
      .replace('{CATEGORIES}', todaysCategories)
      .replace('{ALREADY_COVERED}', coveredList)
      .replace('{TRENDING_CONTEXT}', trendingSnippet);
    const userMsg = `Generate 3 unique cybersecurity story ideas for ${now.toISOString().slice(0, 10)} that are COMPLETELY different from these recently-covered topics: ${coveredList.slice(0, 500)}. Each must target a different audience and angle.`;

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
      const title = t.title || 'untitled';
      // Normalize the title to create a stable key that doesn't change
      // between LLM runs. Strip common filler words, keep only the core
      // topic (e.g., "prompt injection", "blacksuit ransomware", "eu cyber").
      const coreTopic = title
        .toLowerCase()
        .replace(/[^a-z0-9\s]+/g, '')
        .replace(
          /\b(new|novel|emergence|attack|technique|vulnerability|threat|actor|ransomware|group|targets|targeting|sector|sectors|regulations|directive|powered|systems|capabilities|tactics|victims|manipulation|integrity|across|continent|introduces|stricter|disclosure|requirements|organizations|allows|for|of|the|a|an|in|on|to|with|and|or|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|can|shall)\b/g,
          ''
        )
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 40);
      const seed = coreTopic.replace(/\s+/g, '-');
      if (!seed || seed.length < 3) continue;
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
        title,
        rationale: t.rationale || title,
        score: adjustedScore,
        evidence: {
          ...(t.evidence || {}),
          hook: t.hook || '',
          angle: t.angle || '',
          trendingSignal: t.trendingSignal ?? trendingBoost,
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
