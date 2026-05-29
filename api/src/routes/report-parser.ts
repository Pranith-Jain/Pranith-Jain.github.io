import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Threat Report Parser — extracts IOCs, actors, TTPs, and CVEs from
 * unstructured threat intelligence text using Workers AI.
 *
 * POST /api/v1/report/parse
 *   body: { text: "..." } or { url: "https://..." }
 *
 * Returns structured extraction of:
 *   - IOCs (IPs, domains, URLs, hashes)
 *   - Threat actors
 *   - Malware families
 *   - MITRE ATT&CK techniques
 *   - CVEs
 *   - Targeted sectors
 *   - Affected products/vendors
 *   - Executive summary
 *
 * Uses Workers AI (Llama 3.1 8B) for extraction with regex fallback.
 * Free tier: 10k neurons/day (~100 report parses).
 */

const MAX_TEXT_LENGTH = 100_000; // 100KB max
const FETCH_TIMEOUT = 15_000;

// Regex patterns for IOC extraction (fallback if AI fails)
const IPV4_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const DOMAIN_RE = /\b(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\b/g;
const URL_RE = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
const MD5_RE = /\b[a-fA-F0-9]{32}\b/g;
const SHA1_RE = /\b[a-fA-F0-9]{40}\b/g;
const SHA256_RE = /\b[a-fA-F0-9]{64}\b/g;
const CVE_RE = /\bCVE-\d{4}-\d{4,}\b/gi;
const MITRE_RE = /\bT\d{4}(?:\.\d{3})?\b/g;

// Known threat actors (subset — the AI handles the full list)
const KNOWN_ACTORS = [
  'APT28', 'APT29', 'APT41', 'Lazarus', 'Fancy Bear', 'Cozy Bear',
  'Sandworm', 'Turla', 'Equation Group', 'DarkSide', 'REvil', 'Conti',
  'LockBit', 'BlackCat', 'ALPHV', 'Clop', 'Cuba', 'Hive', 'Royal',
  'Play', 'Akira', 'BlackBasta', 'RansomHub', '8Base', 'BianLian',
  'Scattered Spider', 'Lapsus$', 'Kimsuky', 'Konni', 'Andariel',
  'Hafnium', 'Volt Typhoon', 'Salt Typhoon', 'Charming Kitten',
  'MuddyWater', 'OilRig', 'APT33', 'APT34', 'APT35',
];

// Known malware families
const KNOWN_MALWARE = [
  'Cobalt Strike', 'Mimikatz', 'BloodHound', 'Sliver', 'Brute Ratel',
  'Metasploit', 'Empire', 'Covenant', 'IcedID', 'Emotet', 'QakBot',
  'TrickBot', 'BazarLoader', 'Gootloader', 'SocGholish', 'BatLoader',
  'AsyncRAT', 'NjRAT', 'RedLine', 'Raccoon', 'Vidar', 'Stealc',
  'Lumma', 'Mystic', 'Rhadamanthys', 'Amadey', 'SmokeLoader',
  'Agent Tesla', 'Formbook', 'Remcos', 'NanoCore', 'njRAT',
];

interface ExtractedReport {
  /** Unique extraction ID for reference. */
  extraction_id: string;
  /** Input metadata. */
  input: {
    type: 'text' | 'url';
    length: number;
    source_url?: string;
  };
  /** Extracted IOCs by type. */
  iocs: {
    ipv4: string[];
    ipv6: string[];
    domains: string[];
    urls: string[];
    hashes: {
      md5: string[];
      sha1: string[];
      sha256: string[];
    };
  };
  /** Identified threat actors. */
  threat_actors: Array<{
    name: string;
    confidence: 'high' | 'medium' | 'low';
    context?: string;
  }>;
  /** Identified malware families. */
  malware: Array<{
    name: string;
    confidence: 'high' | 'medium' | 'low';
    context?: string;
  }>;
  /** MITRE ATT&CK techniques mentioned. */
  mitre_techniques: Array<{
    id: string;
    name?: string;
    context?: string;
  }>;
  /** CVEs mentioned. */
  cves: Array<{
    id: string;
    context?: string;
  }>;
  /** Targeted sectors/industries. */
  sectors: string[];
  /** Affected vendors/products. */
  affected_products: Array<{
    vendor?: string;
    product: string;
  }>;
  /** Executive summary (2-3 sentences). */
  summary: string;
  /** Extraction metadata. */
  meta: {
    extracted_at: string;
    method: 'ai' | 'regex' | 'hybrid';
    ai_model?: string;
    confidence: 'high' | 'medium' | 'low';
  };
}

/** Extract IOCs using regex patterns. */
function extractRegex(text: string): Partial<ExtractedReport['iocs']> & { cves: string[]; mitre: string[] } {
  const ipv4 = [...new Set((text.match(IPV4_RE) ?? []).filter((ip) => {
    // Filter out common false positives
    const parts = ip.split('.');
    return parts[0] !== '0' && parts[0] !== '255' && !ip.startsWith('127.');
  }))];

  const domains = [...new Set((text.match(DOMAIN_RE) ?? []).filter((d) => {
    // Filter out common false positives
    const lower = d.toLowerCase();
    return !lower.includes('example.com') &&
           !lower.includes('localhost') &&
           !lower.endsWith('.exe') &&
           !lower.endsWith('.dll') &&
           !lower.endsWith('.sys') &&
           d.length > 4;
  }))];

  const urls = [...new Set((text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?)]+$/, '')))];

  const md5 = [...new Set(text.match(MD5_RE) ?? [])];
  const sha1 = [...new Set(text.match(SHA1_RE) ?? [])];
  const sha256 = [...new Set(text.match(SHA256_RE) ?? [])];

  const cves = [...new Set((text.match(CVE_RE) ?? []).map((c) => c.toUpperCase()))];
  const mitre = [...new Set(text.match(MITRE_RE) ?? [])];

  return {
    ipv4,
    domains,
    urls,
    hashes: { md5, sha1, sha256 },
    cves,
    mitre,
  };
}

/** Extract actors and malware from text using keyword matching. */
function extractEntities(text: string): {
  actors: Array<{ name: string; confidence: 'high' | 'medium' | 'low' }>;
  malware: Array<{ name: string; confidence: 'high' | 'medium' | 'low' }>;
} {
  const lower = text.toLowerCase();

  const actors = KNOWN_ACTORS
    .filter((a) => lower.includes(a.toLowerCase()))
    .map((name) => ({
      name,
      confidence: (lower.includes(`the ${name.toLowerCase()} group`) || lower.includes(`${name.toLowerCase()} actor`))
        ? 'high' as const
        : 'medium' as const,
    }));

  const malware = KNOWN_MALWARE
    .filter((m) => lower.includes(m.toLowerCase()))
    .map((name) => ({
      name,
      confidence: 'medium' as const,
    }));

  return { actors, malware };
}

/** Use Workers AI for intelligent extraction. */
async function extractWithAI(
  text: string,
  ai: Ai
): Promise<{
  actors: Array<{ name: string; context?: string }>;
  malware: Array<{ name: string; context?: string }>;
  techniques: Array<{ id: string; name?: string }>;
  sectors: string[];
  products: Array<{ vendor?: string; product: string }>;
  summary: string;
} | null> {
  try {
    const prompt = `Analyze this threat intelligence report and extract structured data. Return ONLY valid JSON.

Report text:
${text.slice(0, 50000)}

Extract and return in this exact JSON format:
{
  "actors": [{"name": "actor name", "context": "brief context"}],
  "malware": [{"name": "malware name", "context": "brief context"}],
  "techniques": [{"id": "T1566.001", "name": "technique name"}],
  "sectors": ["sector1", "sector2"],
  "products": [{"vendor": "vendor", "product": "product"}],
  "summary": "2-3 sentence executive summary of the threat"
}

Rules:
- Only include actors/malware explicitly mentioned in the text
- Use official MITRE ATT&CK technique IDs (T####.###)
- Be precise with sector names (use standard terms like "financial", "healthcare", "government")
- Summary should capture key findings, not repeat the input
- If nothing found for a field, use empty array or empty string`;

    const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'You are a threat intelligence analyst. Extract structured data from reports. Return only valid JSON, no explanations.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 2000,
      temperature: 0.1, // Low temperature for consistent extraction
    });

    const content = typeof response === 'object' && 'response' in response
      ? (response as { response: string }).response
      : String(response);

    // Try to parse the JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      actors?: Array<{ name: string; context?: string }>;
      malware?: Array<{ name: string; context?: string }>;
      techniques?: Array<{ id: string; name?: string }>;
      sectors?: string[];
      products?: Array<{ vendor?: string; product: string }>;
      summary?: string;
    };

    return {
      actors: (parsed.actors ?? []).filter((a) => a.name).slice(0, 20),
      malware: (parsed.malware ?? []).filter((m) => m.name).slice(0, 20),
      techniques: (parsed.techniques ?? []).filter((t) => /^T\d{4}(?:\.\d{3})?$/.test(t.id)).slice(0, 30),
      sectors: (parsed.sectors ?? []).filter(Boolean).slice(0, 10),
      products: (parsed.products ?? []).filter((p) => p.product).slice(0, 20),
      summary: parsed.summary ?? '',
    };
  } catch (err) {
    console.error('AI extraction failed:', err);
    return null;
  }
}

export async function reportParserHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    let text: string | undefined;
    let sourceUrl: string | undefined;

    const contentType = c.req.header('content-type') ?? '';

    if (contentType.includes('application/json')) {
      const body = await c.req.json<{ text?: string; url?: string }>();
      text = body.text;
      sourceUrl = body.url;

      // If URL provided, fetch the content
      if (!text && sourceUrl) {
        try {
          const res = await fetch(sourceUrl, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; threat-intel-parser/1.0)' },
          });
          if (!res.ok) {
            return c.json({ error: `Failed to fetch URL: ${res.status}` }, 400);
          }
          text = await res.text();
        } catch {
          return c.json({ error: 'Failed to fetch URL (timeout or network error)' }, 400);
        }
      }
    } else if (contentType.includes('text/plain')) {
      text = await c.req.text();
    }

    if (!text) {
      return c.json({ error: 'No text provided. Send { text: "..." } or { url: "https://..." }' }, 400);
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return c.json({ error: `Text too long (${text.length} chars, max ${MAX_TEXT_LENGTH})` }, 400);
    }

    // Run regex extraction (fast, always available)
    const regexResults = extractRegex(text);
    const entityResults = extractEntities(text);

    // Try AI extraction if Workers AI is available
    let aiResults: Awaited<ReturnType<typeof extractWithAI>> = null;
    let method: 'ai' | 'regex' | 'hybrid' = 'regex';

    if (c.env.AI) {
      aiResults = await extractWithAI(text, c.env.AI);
      if (aiResults) {
        method = 'hybrid';
      }
    }

    // Merge results: AI findings + regex findings (deduped)
    const aiActorNames = new Set((aiResults?.actors ?? []).map((a) => a.name.toLowerCase()));
    const aiMalwareNames = new Set((aiResults?.malware ?? []).map((m) => m.name.toLowerCase()));
    const aiTechniqueIds = new Set((aiResults?.techniques ?? []).map((t) => t.id));

    const mergedActors = [
      ...(aiResults?.actors ?? []),
      ...entityResults.actors
        .filter((a) => !aiActorNames.has(a.name.toLowerCase()))
        .map((a) => ({ name: a.name, context: undefined })),
    ];

    const mergedMalware = [
      ...(aiResults?.malware ?? []),
      ...entityResults.malware
        .filter((m) => !aiMalwareNames.has(m.name.toLowerCase()))
        .map((m) => ({ name: m.name, context: undefined })),
    ];

    const mergedTechniques = [
      ...(aiResults?.techniques ?? []),
      ...regexResults.mitre
        .filter((id) => !aiTechniqueIds.has(id))
        .map((id) => ({ id, name: undefined })),
    ];

    const result: ExtractedReport = {
      extraction_id: crypto.randomUUID(),
      input: {
        type: sourceUrl ? 'url' : 'text',
        length: text.length,
        source_url: sourceUrl,
      },
      iocs: {
        ipv4: regexResults.ipv4 ?? [],
        ipv6: [],
        domains: regexResults.domains ?? [],
        urls: regexResults.urls ?? [],
        hashes: regexResults.hashes ?? { md5: [], sha1: [], sha256: [] },
      },
      threat_actors: mergedActors.map((a) => ({
        name: a.name,
        confidence: (a.context ? 'high' : 'medium') as 'high' | 'medium' | 'low',
        context: a.context,
      })),
      malware: mergedMalware.map((m) => ({
        name: m.name,
        confidence: (m.context ? 'high' : 'medium') as 'high' | 'medium' | 'low',
        context: m.context,
      })),
      mitre_techniques: mergedTechniques.map((t) => ({
        id: t.id,
        name: t.name,
      })),
      cves: regexResults.cves.map((id) => ({ id })),
      sectors: aiResults?.sectors ?? [],
      affected_products: aiResults?.products ?? [],
      summary: aiResults?.summary ?? generateRegexSummary(regexResults, entityResults),
      meta: {
        extracted_at: new Date().toISOString(),
        method,
        ai_model: aiResults ? '@cf/meta/llama-3.1-8b-instruct' : undefined,
        confidence: aiResults ? 'high' : 'medium',
      },
    };

    return c.json(result, 200, {
      'Cache-Control': 'no-store', // Don't cache extraction results
    });
  } catch (err) {
    console.error('Report parser error:', err);
    return c.json(
      { error: 'Extraction failed', details: err instanceof Error ? err.message : String(err) },
      500
    );
  }
}

/** Generate a summary from regex-extracted data when AI is unavailable. */
function generateRegexSummary(
  regex: ReturnType<typeof extractRegex>,
  entities: ReturnType<typeof extractEntities>
): string {
  const parts: string[] = [];

  const iocCount = (regex.ipv4?.length ?? 0) +
    (regex.domains?.length ?? 0) +
    (regex.urls?.length ?? 0) +
    (regex.hashes?.md5?.length ?? 0) +
    (regex.hashes?.sha1?.length ?? 0) +
    (regex.hashes?.sha256?.length ?? 0);

  if (iocCount > 0) {
    parts.push(`Extracted ${iocCount} indicators of compromise.`);
  }

  if (entities.actors.length > 0) {
    parts.push(`Identified threat actors: ${entities.actors.map((a) => a.name).join(', ')}.`);
  }

  if (entities.malware.length > 0) {
    parts.push(`Referenced malware: ${entities.malware.map((m) => m.name).join(', ')}.`);
  }

  if (regex.cves.length > 0) {
    parts.push(`Mentioned ${regex.cves.length} CVE(s).`);
  }

  if (regex.mitre.length > 0) {
    parts.push(`Referenced ${regex.mitre.length} MITRE ATT&CK technique(s).`);
  }

  return parts.length > 0
    ? parts.join(' ')
    : 'No structured threat intelligence extracted from the provided text.';
}
