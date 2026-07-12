/**
 * NL → STIX Query Translator.
 *
 * Translates natural language threat intelligence queries into structured
 * STIX 2.1 queries. Uses an LLM to classify intent, extract entities, and
 * emit structured filter parameters for the PostgREST-style API.
 *
 * Query types:
 *   - threat_actor: "What is APT29 doing?" → filter by threat_actor
 *   - malware: "Tell me about Emotet" → filter by malware
 *   - cve: "Show me CVE-2024-12345" → filter by vulnerability
 *   - sector: "What's targeting healthcare?" → filter by sector
 *   - country: "Threats against Germany" → filter by country
 *   - ioc: "Check IP 1.2.3.4" → IOC lookup
 *   - campaign: "Tell me about Operation Cookie" → filter by campaign
 *   - strategic: "What are the trends in ransomware?" → strategic analysis
 *   - timerange: "What happened this week?" → time-bounded filter
 */

export type StixQueryIntent =
  | 'threat_actor'
  | 'malware'
  | 'cve'
  | 'sector'
  | 'country'
  | 'ioc'
  | 'campaign'
  | 'strategic'
  | 'timerange'
  | 'general';

export interface StixTranslation {
  /** Classified intent. */
  intent: StixQueryIntent;
  /** Natural language of the original query. */
  originalQuery: string;
  /** Extracted entities keyed by type. */
  entities: Record<string, string[]>;
  /** PostgREST-style filter parameters to apply. */
  filters: Array<{ column: string; op: string; value: unknown }>;
  /** Time range if detected, as ISO strings. */
  timeRange?: { since?: string; until?: string };
  /** Human-readable summary of what was translated. */
  summary: string;
  /** Confidence score for the translation 0-1. */
  confidence: number;
}

/** Role-specific persona context for framing translations. */
export type AnalystRole = 'ciso' | 'detection' | 'ir' | 'cti';

export const ROLE_DISPLAY_NAMES: Record<AnalystRole, string> = {
  ciso: 'CISO',
  detection: 'Detection Engineering',
  ir: 'Incident Response',
  cti: 'Threat Intelligence',
};

export const ROLE_DESCRIPTIONS: Record<AnalystRole, string> = {
  ciso: 'Strategic risk posture, business impact, executive briefings, regulatory compliance',
  detection: 'TTPs, detection rules, Sigma/YARA queries, hunting hypotheses, alert logic',
  ir: 'IOCs, triage steps, containment actions, timeline analysis, artifacts',
  cti: 'Threat actor profiles, campaign analysis, attribution, contextual relationships, trends',
};

/** Pattern-based query intent classifier — fast path before LLM. */
const INTENT_PATTERNS: Array<{ pattern: RegExp; intent: StixQueryIntent; entityKey: string }> = [
  {
    pattern: /\b(apt\d+|group\s+\d+|threat\s+actor|lazarus|sandworm|kimsuky|fancy\s*bear|cozy\s*bear|unc\d+)\b/i,
    intent: 'threat_actor',
    entityKey: 'threat_actor',
  },
  {
    pattern:
      /\b(emotet|trickbot|lockbit|conti|black\s*cat|ryuk|revil|dridex|qakbot|iceid|bumblebee|malware|ransomware)\b/i,
    intent: 'malware',
    entityKey: 'malware',
  },
  { pattern: /\b(cve-\d{4}-\d{4,})\b/i, intent: 'cve', entityKey: 'cve' },
  {
    pattern:
      /\b(healthcare|finance|government|energy|critical\s*infrastructure|education|manufacturing|retail|sector)\b/i,
    intent: 'sector',
    entityKey: 'sector',
  },
  { pattern: /\b(operation|campaign)\s+\w+/i, intent: 'campaign', entityKey: 'campaign' },
  {
    pattern: /\b(trend|landscape|evolving|shift|emerging|strategic|overview|posture|risk)\b/i,
    intent: 'strategic',
    entityKey: '',
  },
  { pattern: /\b(ip\s*\d+\.\d+\.\d+\.\d+|domain|hash|url|ioc|indicator)\b/i, intent: 'ioc', entityKey: 'ioc' },
];

/** Detect intent from the raw query text (fast regex path). */
export function classifyIntent(query: string): { intent: StixQueryIntent; entities: Record<string, string[]> } {
  const entities: Record<string, string[]> = {};
  let bestIntent: StixQueryIntent = 'general';
  let bestScore = 0;

  for (const rule of INTENT_PATTERNS) {
    const matches = query.match(rule.pattern);
    if (matches) {
      const match = matches[1] ?? matches[0];
      const score = matches[1] ? 2 : 1;
      if (score > bestScore) {
        bestIntent = rule.intent;
        bestScore = score;
      }
      if (rule.entityKey) {
        (entities[rule.entityKey] ??= []).push(match.toLowerCase());
      }
    }
  }

  // Time-range detection
  const timePatterns: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /\b(today|past\s*24\s*hours?|last\s*24\s*h)\b/i, label: '24h' },
    { pattern: /\b(this\s*week|past\s*7\s*days?|last\s*7\s*d)\b/i, label: '7d' },
    { pattern: /\b(this\s*month|past\s*30\s*days?|last\s*30\s*d)\b/i, label: '30d' },
    { pattern: /\b(this\s*quarter|past\s*90\s*days?|last\s*90\s*d)\b/i, label: '90d' },
    { pattern: /\b(this\s*year|past\s*365\s*days?)\b/i, label: '1y' },
  ];
  for (const tp of timePatterns) {
    if (tp.pattern.test(query)) {
      entities.timeframe = [tp.label];
      break;
    }
  }

  return { intent: bestIntent, entities };
}

/**
 * Build the system prompt for LLM-based STIX translation.
 * Used when the pattern-based classifier needs LLM assistance.
 */
export function buildTranslationSystemPrompt(): string {
  return `You are a STIX 2.1 query translator. Convert natural language threat intelligence questions into structured filter parameters.

Available filter columns:
  - source_type: "osint" or "darknet"
  - threat_actors: array of threat actor names
  - malware_names: array of malware names
  - campaigns: array of campaign names
  - sectors: array of target sectors
  - countries_target: array of target countries
  - countries_source: array of source countries
  - vulnerabilities: array of CVE IDs
  - title: report title text
  - stix_created_at: ISO timestamp
  - stix_published_at: ISO timestamp

Output JSON ONLY with this shape:
{
  "intent": "threat_actor|malware|cve|sector|country|ioc|campaign|strategic|timerange|general",
  "entities": { "threat_actor": [...], "malware": [...], etc },
  "filters": [{ "column": "threat_actors", "op": "cs", "value": ["APT29"] }],
  "timeRange": { "since": "2026-01-01T00:00:00Z", "until": null },
  "summary": "Brief description of what was translated",
  "confidence": 0.95
}

Rules:
- Use array contains operator "cs" for array columns
- Use "eq" for scalar columns
- Use "gte"/"lte" for timestamp ranges
- Extract all named entities explicitly
- Set confidence low if query is ambiguous
- No markdown, no text outside JSON`;
}

/**
 * Build structured filter params from an LLM translation response
 * (or from the pattern-based classifier).
 */
export function translationToFilters(t: StixTranslation): Array<{ column: string; op: string; value: unknown }> {
  const filters: Array<{ column: string; op: string; value: unknown }> = [];

  for (const [key, values] of Object.entries(t.entities)) {
    if (!values?.length) continue;
    switch (key) {
      case 'threat_actor':
        filters.push({ column: 'threat_actors', op: 'cs', value: values });
        break;
      case 'malware':
        filters.push({ column: 'malware_names', op: 'cs', value: values });
        break;
      case 'cve':
        filters.push({ column: 'vulnerabilities', op: 'cs', value: values.map((v) => v.toUpperCase()) });
        break;
      case 'sector':
        filters.push({ column: 'sectors', op: 'cs', value: values });
        break;
      case 'country':
        filters.push({ column: 'countries_target', op: 'cs', value: values });
        break;
      case 'campaign':
        filters.push({ column: 'campaigns', op: 'cs', value: values });
        break;
    }
  }

  if (t.timeRange?.since) {
    filters.push({ column: 'stix_published_at', op: 'gte', value: t.timeRange.since });
  }
  if (t.timeRange?.until) {
    filters.push({ column: 'stix_published_at', op: 'lte', value: t.timeRange.until });
  }

  return filters;
}

/**
 * Resolve a timeframe label to ISO timestamp.
 */
export function timeframeToSince(label: string): string | undefined {
  const now = new Date();
  switch (label) {
    case '24h':
      return new Date(now.getTime() - 24 * 3600_000).toISOString();
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 3600_000).toISOString();
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 3600_000).toISOString();
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 3600_000).toISOString();
    case '1y':
      return new Date(now.getTime() - 365 * 24 * 3600_000).toISOString();
    default:
      return undefined;
  }
}

/**
 * Translate a natural language query using pattern-based classifier.
 * For ambiguous or low-confidence queries, the caller can delegate to an LLM
 * using the system prompt from `buildTranslationSystemPrompt()`.
 */
export function translateQuery(query: string): StixTranslation {
  const { intent, entities } = classifyIntent(query);
  const filters: Array<{ column: string; op: string; value: unknown }> = [];
  const timeRange: { since?: string; until?: string } = {};

  // Build filters from entities
  for (const [key, values] of Object.entries(entities)) {
    if (!values?.length) continue;
    if (key === 'timeframe') {
      const since = timeframeToSince(values[0]!);
      if (since) timeRange.since = since;
      continue;
    }
    switch (key) {
      case 'threat_actor':
        filters.push({ column: 'threat_actors', op: 'cs', value: values });
        break;
      case 'malware':
        filters.push({ column: 'malware_names', op: 'cs', value: values });
        break;
      case 'cve':
        filters.push({ column: 'vulnerabilities', op: 'cs', value: values });
        break;
      case 'sector':
        filters.push({ column: 'sectors', op: 'cs', value: values });
        break;
      case 'country':
        filters.push({ column: 'countries_target', op: 'cs', value: values });
        break;
      case 'campaign':
        filters.push({ column: 'campaigns', op: 'cs', value: values });
        break;
    }
  }

  const summary = buildSummary(intent, entities, timeRange);
  const confidence = intent === 'general' ? 0.3 : 0.8;

  return {
    intent,
    originalQuery: query,
    entities,
    filters: [
      ...filters,
      ...(timeRange.since ? [{ column: 'stix_published_at', op: 'gte' as const, value: timeRange.since }] : []),
    ],
    timeRange: timeRange.since ? timeRange : undefined,
    summary,
    confidence,
  };
}

function buildSummary(
  intent: StixQueryIntent,
  entities: Record<string, string[]>,
  timeRange: { since?: string }
): string {
  const parts: string[] = [];
  const intentLabels: Record<StixQueryIntent, string> = {
    threat_actor: 'Threat actor intelligence',
    malware: 'Malware intelligence',
    cve: 'Vulnerability intelligence',
    sector: 'Sector-specific threats',
    country: 'Country-targeted threats',
    ioc: 'Indicator lookup',
    campaign: 'Campaign intelligence',
    strategic: 'Strategic threat landscape',
    timerange: 'Time-bounded intelligence',
    general: 'General intelligence search',
  };
  parts.push(intentLabels[intent] ?? 'General intelligence search');

  for (const [key, vals] of Object.entries(entities)) {
    if (vals?.length && key !== 'timeframe') {
      parts.push(`${key}: ${vals.join(', ')}`);
    }
  }
  if (timeRange.since) {
    parts.push(`since ${new Date(timeRange.since).toLocaleDateString()}`);
  }
  return parts.join(' | ');
}
