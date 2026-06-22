/**
 * CTI Prediction Engine — AI-powered attack pattern forecasting
 *
 * Builds context from collected IOCs, CVEs, and news, then sends it
 * to Workers AI to generate novel attack pattern predictions grounded
 * in the real threat data.
 */

import type { D1Database, Ai } from '@cloudflare/workers-types';

interface PredictionContext {
  total_iocs: number;
  type_breakdown: Record<string, number>;
  top_families: Array<{ family: string; count: number }>;
  active_sources: string[];
  trending_families: Array<{ family: string; count: number }>;
  recent_news_headlines: Array<{ title: string; source: string }>;
  active_cves: Array<{ cve_id: string; source: string }>;
}

interface Prediction {
  pattern_id: string;
  title: string;
  threat_level: string;
  confidence: number;
  summary: string;
  attack_flow: Array<{ phase: string; technique_id: string; technique: string; description: string }>;
  target_sectors: string[];
  target_regions: string[];
  mitre_techniques: string[];
  malware_evolution: string;
  novel_aspects: string[];
  indicators_to_watch: { behavioral: string[]; network: string[]; file: string[] };
  defensive_recommendations: string[];
  reasoning: string;
  based_on_sources: string[];
}

async function buildPredictionContext(db: D1Database): Promise<PredictionContext> {
  const [iocCount, typeRes, familyRes, sourceRes, trendingRes, newsRes, cveRes] = await Promise.all([
    db.prepare('SELECT COUNT(*) as n FROM cti_iocs').first(),
    db.prepare('SELECT type, COUNT(*) as n FROM cti_iocs WHERE decay_score > 0.3 GROUP BY type ORDER BY n DESC').all(),
    db
      .prepare(
        "SELECT malware_family as family, COUNT(*) as n FROM cti_iocs WHERE malware_family != '' AND decay_score > 0.3 GROUP BY malware_family ORDER BY n DESC LIMIT 10"
      )
      .all(),
    db
      .prepare('SELECT source, COUNT(*) as n FROM cti_iocs WHERE decay_score > 0.3 GROUP BY source ORDER BY n DESC')
      .all(),
    db
      .prepare(
        "SELECT malware_family as family, COUNT(*) as n FROM cti_iocs WHERE malware_family != '' AND last_seen > datetime('now', '-7 days') GROUP BY malware_family ORDER BY n DESC LIMIT 8"
      )
      .all(),
    db.prepare('SELECT title, source FROM cti_news ORDER BY fetched_at DESC LIMIT 20').all(),
    db
      .prepare(
        "SELECT value as cve_id, source FROM cti_iocs WHERE type = 'cve' AND decay_score > 0.5 ORDER BY confidence DESC LIMIT 15"
      )
      .all(),
  ]);

  const typeBreakdown: Record<string, number> = {};
  for (const r of typeRes.results) typeBreakdown[String(r.type)] = Number(r.n);

  return {
    total_iocs: Number(iocCount?.n || 0),
    type_breakdown: typeBreakdown,
    top_families: familyRes.results.map((r) => ({ family: String(r.family), count: Number(r.n) })),
    active_sources: sourceRes.results.map((r) => String(r.source)),
    trending_families: trendingRes.results.map((r) => ({ family: String(r.family), count: Number(r.n) })),
    recent_news_headlines: newsRes.results.map((r) => ({ title: String(r.title), source: String(r.source) })),
    active_cves: cveRes.results.map((r) => ({ cve_id: String(r.cve_id), source: String(r.source) })),
  };
}

export async function generatePredictions(
  db: D1Database,
  ai: Ai,
  opts: { count?: number; focus_sector?: string; focus_region?: string } = {}
): Promise<{ success: boolean; predictions: Prediction[]; context: PredictionContext; error?: string }> {
  const ctx = await buildPredictionContext(db);
  const count = opts.count || 3;

  const malwareLines = ctx.top_families.length
    ? ctx.top_families.map((f) => `  - ${f.family} (${f.count} observations)`).join('\n')
    : '  (no named malware families in current dataset)';

  const cveLines = ctx.active_cves.length
    ? ctx.active_cves.map((v) => `  - ${v.cve_id} [source: ${v.source}]`).join('\n')
    : '  (no CVEs in current dataset)';

  const newsLines = ctx.recent_news_headlines.length
    ? ctx.recent_news_headlines.map((n) => `  - [${n.source}] ${n.title}`).join('\n')
    : '  (no recent news)';

  const focusPrompt = [
    opts.focus_sector ? `Focus on attacks targeting the ${opts.focus_sector} sector.` : '',
    opts.focus_region ? `Focus on attacks targeting ${opts.focus_region} region.` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = `You are a Cyber Threat Intelligence prediction engine. Analyze the real threat data below and generate ${count} novel attack pattern predictions.

${focusPrompt}

THREAT INTELLIGENCE DATA:
- Total IOCs in database: ${ctx.total_iocs}
- Type breakdown: ${JSON.stringify(ctx.type_breakdown)}
- Active sources: ${ctx.active_sources.join(', ')}

ACTIVE MALWARE FAMILIES (ranked by frequency):
${malwareLines}

TRENDING FAMILIES (last 7 days):
${ctx.trending_families.map((f) => `  - ${f.family}: ${f.count} observations`).join('\n') || '  (no trend data)'}

ACTIVE CVEs:
${cveLines}

RECENT THREAT HEADLINES:
${newsLines}

TASK: Generate exactly ${count} novel attack patterns grounded in the data above.
Think step by step:

1. THREAT ACTOR PROFILING: Pick active malware families from the data. Use their known behavior to predict next moves.
2. VULNERABILITY SELECTION: From the CVE list above, find CVEs that match the malware's typical targets.
3. NOVEL COMBINATION: Combine trending malware + CVE + geographic signals into never-seen attack chains.
4. ATTACK CHAIN: Build a realistic 5-7 phase kill chain using real MITRE ATT&CK technique IDs.

OUTPUT RULES:
- Return ONLY a valid JSON array. No preamble, no markdown.
- Start with [ and end with ]
- Each element must match the schema below.
- Use only real MITRE ATT&CK technique IDs (T1xxx format).

JSON SCHEMA:
[{
  "pattern_id": "VP-HEXHEX",
  "title": "Specific title referencing real malware or CVE from the data",
  "threat_level": "CRITICAL|HIGH|MEDIUM",
  "confidence": 70,
  "summary": "2-3 sentences explaining what is novel about this pattern",
  "attack_flow": [
    {"phase": "initial-access", "technique_id": "T1190", "technique": "Exploit Public-Facing Application", "description": "Specific action"},
    {"phase": "execution", "technique_id": "T1059.001", "technique": "PowerShell", "description": "Payload detail"},
    {"phase": "persistence", "technique_id": "T1053.005", "technique": "Scheduled Task", "description": "Persistence mechanism"},
    {"phase": "command-and-control", "technique_id": "T1071.001", "technique": "Web Protocols", "description": "C2 mechanism"},
    {"phase": "impact", "technique_id": "T1486", "technique": "Data Encrypted for Impact", "description": "Final objective"}
  ],
  "target_sectors": ["Finance", "Healthcare"],
  "target_regions": ["North America", "Europe"],
  "mitre_techniques": ["T1190", "T1059.001", "T1053.005", "T1071.001", "T1486"],
  "malware_evolution": "How a named malware family evolves here",
  "novel_aspects": ["novel element 1", "novel element 2"],
  "indicators_to_watch": {"behavioral": ["indicator1"], "network": ["pattern1"], "file": ["artifact1"]},
  "defensive_recommendations": ["SIEM rule", "hardening action"],
  "reasoning": "Which specific malware families, CVEs, and IOCs from the data led to this prediction",
  "based_on": ["malware family from data", "CVE-from-data"]
}]

Return ONLY the JSON array.`;

  try {
    const result = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000,
      temperature: 0.7,
    });

    const response = (result as { response?: string }).response || '';
    // Strip markdown fences
    let raw = response.trim();
    if (raw.startsWith('```')) {
      raw = raw.split('```')[1] || raw;
      if (raw.startsWith('json')) raw = raw.slice(4);
    }

    // Try to extract JSON array
    const startIdx = raw.indexOf('[');
    const endIdx = raw.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1) {
      return { success: false, predictions: [], context: ctx, error: 'No JSON array found in AI response' };
    }

    const predictions: Prediction[] = JSON.parse(raw.slice(startIdx, endIdx + 1));

    // Store predictions
    const stmt = db.prepare(`
      INSERT INTO cti_predictions (prediction_id, title, threat_level, confidence, summary, attack_flow, target_sectors, target_regions, mitre_techniques, malware_evolution, novel_aspects, indicators_to_watch, defensive_recommendations, reasoning, based_on_sources)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const batches: D1PreparedStatement[] = [];
    for (const p of predictions) {
      batches.push(
        stmt.bind(
          p.pattern_id,
          p.title,
          p.threat_level,
          p.confidence,
          p.summary,
          JSON.stringify(p.attack_flow),
          JSON.stringify(p.target_sectors),
          JSON.stringify(p.target_regions),
          JSON.stringify(p.mitre_techniques),
          p.malware_evolution,
          JSON.stringify(p.novel_aspects),
          JSON.stringify(p.indicators_to_watch),
          JSON.stringify(p.defensive_recommendations),
          p.reasoning,
          JSON.stringify(p.based_on_sources)
        )
      );
    }
    if (batches.length) {
      try {
        await db.batch(batches);
      } catch {
        /* non-critical */
      }
    }

    return { success: true, predictions, context: ctx };
  } catch (e) {
    return {
      success: false,
      predictions: [],
      context: ctx,
      error: e instanceof Error ? e.message : 'AI prediction failed',
    };
  }
}

export async function getRecentPredictions(db: D1Database, limit = 10): Promise<Array<Record<string, unknown>>> {
  const rows = await db.prepare('SELECT * FROM cti_predictions ORDER BY generated_at DESC LIMIT ?').bind(limit).all();
  return rows.results.map((r) => ({
    ...r,
    attack_flow: JSON.parse(String(r.attack_flow || '[]')),
    target_sectors: JSON.parse(String(r.target_sectors || '[]')),
    target_regions: JSON.parse(String(r.target_regions || '[]')),
    mitre_techniques: JSON.parse(String(r.mitre_techniques || '[]')),
    novel_aspects: JSON.parse(String(r.novel_aspects || '[]')),
    indicators_to_watch: JSON.parse(String(r.indicators_to_watch || '{}')),
    defensive_recommendations: JSON.parse(String(r.defensive_recommendations || '[]')),
    based_on_sources: JSON.parse(String(r.based_on_sources || '[]')),
  }));
}
