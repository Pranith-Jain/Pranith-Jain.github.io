import type { Context } from 'hono';
import type { Env } from '../env';
import { lookupCve } from '../lib/cve-lookup';
import { ACTOR_ALIASES } from '../data/threat-actor-aliases';
import { mitreGroupRef } from '../lib/ransomware-mitre-groups';
import { safeJsonBody } from '../lib/safe-body';
import { cvesForActor } from '../lib/cve-actor-mapping';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const REPORT_SYSTEM = `You are a senior CTI analyst writing a formal intelligence report in Markdown.

Produce a structured report with these sections:
- **TL;DR** — one-line summary
- **Overview** — 2-3 paragraph technical description
- **Key Details** — bullet points covering impact, scope, timeline
- **Threat Context** — who, motivation, TTPs, related campaigns
- **Sources** — numbered references

Guidelines:
- Write in a professional, neutral tone. No markdown-in-markdown.
- Cite specific data points where available (CVSS scores, EPSS percentiles, CVE IDs, actor names).
- If information is unavailable, state "Not available" rather than speculating.
- Do NOT invent CVE IDs, CVSS scores, or threat actor names.
- Keep the report between 300-800 words.
- Use proper Markdown headings (##), lists, and emphasis.`;

async function callGroq(env: Env, user: string): Promise<string> {
  const key = env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set');
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: REPORT_SYSTEM },
        { role: 'user', content: user },
      ],
      max_tokens: 4096,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (res.status === 429) throw new Error('rate_limited');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`groq ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data?.choices?.[0]?.message?.content ?? 'No response from model.';
}

async function callWorkersAi(env: Env, user: string): Promise<string> {
  const res = (await env.AI.run(
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast' as never,
    {
      messages: [
        { role: 'system', content: REPORT_SYSTEM },
        { role: 'user', content: user },
      ],
      max_tokens: 4096,
      temperature: 0.3,
    } as never
  )) as { response?: string };
  return res.response ?? 'No response from model.';
}

async function buildCveReport(cveId: string, env: Env): Promise<{ report: string; title: string }> {
  const result = await lookupCve(cveId);
  if (!result.ok) throw new Error(result.error);

  const d = result.data;
  const user = `Write a threat intelligence report for ${d.cve_id}.

## Available Data
- **Published**: ${d.published ?? 'N/A'}
- **Description**: ${d.description ?? 'N/A'}
- **CVSS**: ${d.cvss ? `${d.cvss.severity} ${d.cvss.base_score} (${d.cvss.vector})` : 'N/A'}
- **CWE**: ${d.cwe?.join(', ') ?? 'N/A'}
- **EPSS**: ${d.epss ? `${(d.epss.score * 100).toFixed(2)}% probability (${(d.epss.percentile * 100).toFixed(1)}th percentile)` : 'N/A'}
- **CISA KEV**: ${d.kev.in_kev ? `Yes — added ${d.kev.date_added ?? 'N/A'}, due ${d.kev.due_date ?? 'N/A'}. ${d.kev.known_ransomware ? 'Known ransomware use.' : ''}` : 'No'}
- **Affected Products**: ${d.affected_products?.join(', ') ?? 'N/A'}
- **Attributed Actors**: ${d.actors?.join(', ') ?? d.actor_links?.map((a) => a.slug).join(', ') ?? 'None'}
- **PoC Available**: ${d.poc ? `Yes (${d.poc.count} exploits)` : 'No'}
- **References**: ${d.references?.length ?? 0} references`;

  try {
    const text = await callGroq(env, user);
    return { report: text, title: `CVE Report: ${d.cve_id}` };
  } catch {
    const text = await callWorkersAi(env, user);
    return { report: text, title: `CVE Report: ${d.cve_id}` };
  }
}

async function buildActorReport(query: string, env: Env): Promise<{ report: string; title: string }> {
  const ql = query.toLowerCase().trim();
  const alias = ACTOR_ALIASES.find(
    (a) => a.slug === ql || a.canonical.toLowerCase() === ql || a.aliases.some((al) => al.toLowerCase() === ql)
  );

  if (!alias) {
    const user = `Write a threat intelligence report about the threat actor or group "${query}". Focus on what is publicly known about their operations, targeting, and TTPs. If you do not have specific information, state what is generally known about threat actors of this type.`;
    const text = await callGroq(env, user).catch(() => callWorkersAi(env, user));
    return { report: text, title: `Threat Actor Report: ${query}` };
  }

  const cves = cvesForActor(alias.slug);
  const ref = alias.mitreId ? mitreGroupRef(alias.mitreId) : null;
  const user = `Write a threat intelligence report for the threat actor "${alias.canonical}".

## Available Data
- **Aliases**: ${alias.aliases.join(', ') || 'None'}
- **MITRE ATT&CK ID**: ${alias.mitreId ?? 'N/A'}${ref ? ` (${ref.url})` : ''}
- **Attributed CVEs**: ${cves.length > 0 ? cves.join(', ') : 'None in current mapping'}
- **Target Industries/Sectors**: Not available in current data`;

  try {
    const text = await callGroq(env, user);
    return { report: text, title: `Threat Actor Report: ${alias.canonical}` };
  } catch {
    const text = await callWorkersAi(env, user);
    return { report: text, title: `Threat Actor Report: ${alias.canonical}` };
  }
}

async function buildGenericReport(query: string, env: Env): Promise<{ report: string; title: string }> {
  const user = `Write a threat intelligence report about "${query}". Include any known context about this entity — what it is, its relevance to cybersecurity, known associations with threats or threat actors, and any available technical details. If you do not have specific information about this exact entity, provide a template-style report that describes what to look for and how to investigate such entities.`;
  try {
    const text = await callGroq(env, user);
    return { report: text, title: `Report: ${query}` };
  } catch {
    const text = await callWorkersAi(env, user);
    return { report: text, title: `Report: ${query}` };
  }
}

export async function reportGenerateHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const parsed = await safeJsonBody<{ query?: string }>(c, { maxBytes: 4 * 1024, maxDepth: 4 });
  if ('error' in parsed) return parsed.error;
  if (!parsed.value.query?.trim()) {
    return c.json({ error: 'missing query' }, 400);
  }
  const query = parsed.value.query.trim();
  const start = Date.now();

  try {
    const cveMatch = /^CVE-\d{4}-\d{4,}$/i.test(query);
    const ql = query.toLowerCase();
    const isActor = ACTOR_ALIASES.some(
      (a) => a.slug === ql || a.canonical.toLowerCase() === ql || a.aliases.some((al) => al.toLowerCase() === ql)
    );

    let result: { report: string; title: string };
    if (cveMatch) {
      result = await buildCveReport(query, c.env);
    } else if (isActor) {
      result = await buildActorReport(query, c.env);
    } else {
      result = await buildGenericReport(query, c.env);
    }

    return c.json(
      {
        ok: true,
        title: result.title,
        markdown: result.report,
        query,
        generated_at: new Date().toISOString(),
        elapsed_ms: Date.now() - start,
      },
      200,
      { 'Cache-Control': 'no-store' }
    );
  } catch (e) {
    return c.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : 'report generation failed',
        query,
      },
      500
    );
  }
}
