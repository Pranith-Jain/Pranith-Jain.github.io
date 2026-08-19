#!/usr/bin/env node
/**
 * Prompt Variant Comparison Harness (port of reindrops86/Prompt-evaluation-pipeline-for-LLM-outputs).
 *
 * Runs N prompt variants against M test cases, scores each response on a
 * lightweight rubric, and writes CSV artifacts for comparison. Zero runtime
 * dependencies — the upstream Python (langchain/pandas) is replaced with a
 * plain `fetch` chat-completions client and hand-rolled CSV writers.
 *
 * Modes (mirror upstream):
 *   offline (default, no keys) — canned responses, fully deterministic.
 *   openai  — OPENAI_API_KEY, OPENAI_MODEL (optionally OPENAI_BASE_URL).
 *   foundry — LLM_PROVIDER=foundry + FOUNDRY_ENDPOINT/FOUNDRY_API_KEY/FOUNDRY_MODEL.
 *   azure   — LLM_PROVIDER=azure + AZURE_OPENAI_API_KEY/AZURE_OPENAI_ENDPOINT/
 *             AZURE_OPENAI_API_VERSION/AZURE_OPENAI_CHAT_DEPLOYMENT.
 * USE_LLM=false forces offline mode regardless of LLM_PROVIDER.
 *
 * Rubric (1–5 each): conciseness, task alignment, metric awareness, actionability.
 *
 * Emits:
 *   artifacts/prompt-eval-results.csv   (per case × variant row)
 *   artifacts/prompt-eval-summary.csv   (per variant aggregates + ranking)
 *
 * To benchmark this repo's own agent prompts, the SCENARIOS/PROMPT_VARIANTS
 * tables below embed the real prompt families verbatim: the cti-loop report
 * synthesizer (`api/src/lib/agent/prompts.ts` buildSynthesizerPrompt), the
 * minimal briefing-note synthesizer (buildMinimalSynthesizerPrompt), the
 * strategic-intel sector-brief planner prompt
 * (`api/src/lib/agent/specialist-types.ts`), and the SI routing prompt
 * (`public/data/si/routing-prompt.md`). Cases are realistic inputs from this
 * repo's domains (campaign investigations, weekly briefings, sector briefs).
 *
 * Safe to run repeatedly — overwrites the artifacts/ CSVs on each run.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = process.env.PROMPT_EVAL_OUT_DIR ?? join(SCRIPT_DIR, '..', 'artifacts');
const RESULTS_CSV = join(ARTIFACT_DIR, 'prompt-eval-results.csv');
const SUMMARY_CSV = join(ARTIFACT_DIR, 'prompt-eval-summary.csv');

// ── Real prompt families (trimmed verbatim from this repo) ────────────────

/** api/src/lib/agent/prompts.ts — buildSynthesizerPrompt head (cti-loop end). */
const CTI_REPORT_PROMPT = `<role>You are a senior CTI analyst producing a formal, defensible cyber threat intelligence report. Your audience includes CTI analysts, SOC engineers, incident responders, vulnerability managers, red teams, security awareness teams, and executive leadership. The report must pass analytic rigor standards (ICD-203 confidence/likelihood separation, ACH consideration, Diamond Model mapping). Follow the Zeltser Cyber Threat Intelligence Report Template structure exactly.</role>

<task>
Write the report below following the Zeltser CTI Report Template structure. Use ONLY the investigation data. If a section has no data, OMIT it entirely — never write "Not available". Numbers, identifiers, and dates must come from tool data, never be invented.
</task>`;

/** api/src/lib/agent/prompts.ts — buildMinimalSynthesizerPrompt (brief note, degraded investigation). */
const BRIEF_NOTE_PROMPT = `<role>You are a senior CTI analyst producing a brief intelligence note. Almost NO enrichment tools returned data for this investigation. Your job is to state this clearly and concisely — do NOT write a full report.</role>

<task>
Write a MINIMAL output containing ONLY: a report-header JSON block (BLUF, no conclusions), a short "## Executive Summary" prose section stating which tools returned data and which failed, a "## Report Metadata" table, a :::handoff block, and an action-card JSON block with only real IOCs.
</task>

<ground_rules>
- AMBIGUITY IS THE ANSWER. If you have no data, say so. Do not interpret "no data" as "clean".
- ZERO invented content. No CVEs, no IPs, no hashes, no actor names, no MITRE IDs, no techniques, no scores.
- ≤400 words total. Very short.
</ground_rules>`;

/** api/src/lib/agent/specialist-types.ts — strategic-intel sector-brief planner prompt. */
const SECTOR_BRIEF_PROMPT = `You are the Strategic Intel Specialist. Your job: provide a threat landscape assessment.

Available tools:
- get_threat_pulse: current threat landscape snapshot
- unified_search: cross-source intel search
- get_ransomware_map: active ransomware groups and targets
- get_supply_chain_attacks: recent package/chain compromises
- briefings_related: prior briefings sharing IOCs or tactic keywords
- ti_brief_sector: sector-specific threat brief

Strategy:
- Step 1: get_threat_pulse (current threat landscape) + unified_search
- Step 2: get_ransomware_map + get_supply_chain_attacks for context + briefings_related (link to prior briefs)
- Step 3: Synthesize with strategic assessment.`;

/** public/data/si/routing-prompt.md — upstream skill-detection routing prompt (head). */
const SI_ROUTING_PROMPT = `GitHub Copilot - Security Investigation Integration. This workspace contains a security investigation automation system. Use natural language to run investigations.

⚠️ CRITICAL WORKFLOW RULES - READ FIRST ⚠️
- SKILL DETECTION: Before starting any investigation, check the Available Skills section and load the appropriate SKILL.md file.
- KQL Pre-Flight Checklist: mandatory before EVERY query.
- Evidence-Based Analysis (global rule): only report facts present in tool results; anti-hallucination guardrails apply to every answer.
- Remediation Output Policy (global rule): portal links only, no executable commands.
- When the user request matches an available skill, prefer routing to that skill over ad-hoc queries.`;

const SCENARIOS = [
  {
    id: 'apt-campaign',
    title: 'APT campaign investigation',
    input:
      'Observed: phishing email with attachment (sha256 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08), C2 at 193.32.219.12 and domain infra-updates[.]net; loader stage drops a PowerShell beacon. Enrichment returned IP history and two related CVE mentions. Correlate to known campaigns.',
  },
  {
    id: 'weekly-briefing',
    title: 'Weekly briefing synthesis',
    input:
      'This week: 27 findings, 9 CVEs (3 in CISA KEV), 4 ransomware victims, 12 new IOCs, darknet feed degraded for 2 days. Infrastructure graph unchanged. Supply chain: 2 malicious npm packages disclosed.',
  },
  {
    id: 'water-sector',
    title: 'Water/ICS sector brief',
    input:
      'Sector: water utilities. Recent activity: 3 attempted intrusions against ICS-adjacent IT infrastructure, 1 KEV affecting PLC configuration software, rising info-stealer usage in the sector, no public breach confirmed.',
  },
];

const PROMPT_VARIANTS = [
  {
    id: 'cti-report',
    title: 'Zeltser CTI report (buildSynthesizerPrompt)',
    template: (caseTitle, caseInput) => `${CTI_REPORT_PROMPT}\n\n<query>${caseTitle}: ${caseInput}</query>`,
  },
  {
    id: 'brief-note',
    title: 'Minimal briefing note (buildMinimalSynthesizerPrompt)',
    template: (caseTitle, caseInput) => `${BRIEF_NOTE_PROMPT}\n\n<query>${caseTitle}: ${caseInput}</query>`,
  },
  {
    id: 'sector-brief',
    title: 'Strategic-intel sector brief',
    template: (caseTitle, caseInput) => `${SECTOR_BRIEF_PROMPT}\n\nQuery: ${caseTitle}: ${caseInput}`,
  },
  {
    id: 'si-routing',
    title: 'SI routing prompt (routing-prompt.md head)',
    template: (caseTitle, caseInput) => `${SI_ROUTING_PROMPT}\n\nUser request: ${caseTitle}: ${caseInput}`,
  },
];

const OFFLINE_RESPONSES = {
  'apt-campaign:cti-report': [
    'The campaign is assessed HIGH confidence, 2 (Active), TLP:CLEAR. The phishing attachment (sha256 9f86d081…) matches CVE-2023-4863-style loader chains and the C2 at 193.32.219.12 has a 14-month history tied to two prior clusters. Diamond Model: the adversary (likely APT-style, masked) uses infrastructure (magecart-style domains) to deliver capability (PowerShell beacon) against the target (finance vertical). Key takeaways: block the C2 netblock, quarantine the hash, and review mail flow for the attachment name; recommend hunting queries for the beacon parameters. Confidence: high for attribution overlap, moderate for intent.',
  ],
  'apt-campaign:brief-note': [
    '## Executive Summary — Investigation query: correlate the observed campaign to known groups. Enrichment returned IP history and two CVE mentions; the C2 IP resolved to 193.32.219.12 with no prior domain overlap in this dataset, so attribution is inconclusive. Tools with data: lookup_domain (hosting), lookup_cve (2 matches). Failed/empty: enrich_actor, malware family lookup. ## Report Metadata — Report Title: Investigation Report: APT campaign correlation; Report Classification: TLP: CLEAR. :::handoff — review_report: Review for updates when further telemetry lands.',
  ],
  'apt-campaign:sector-brief': [
    'Current landscape: the observed chain (phishing attachment → PowerShell beacon → C2 193.32.219.12) intersects an active cluster tracked across 3 briefings since June. Prior briefs share the C2 IP (2 matches, keyword "campaign"). Ransomware map shows no overlap with this group. Supply chain: no package linkage. Strategic assessment: monitor the C2 netblock and the two CVEs; the campaign is mid-lifecycle and warrants a sector advisory if it crosses into ICS-adjacent infrastructure.',
  ],
  'apt-campaign:si-routing': [
    'Routing decision: the request is a campaign-correlation investigation — route to the campaign-correlation skill (SKILL.md) plus the evidence-based analysis guardrails. Pre-flight: no KQL query yet; if telemetry pivots to Sentinel, run the KQL pre-flight checklist against the ExposedLogs and SigninLogs tables. Output policy: portal links only, no executable commands. No remediation actions until attribution confidence rises.',
  ],
  'weekly-briefing:cti-report': [
    'Weekly brief (TLP:CLEAR, confidence high): 27 findings, 9 CVEs (3 KEV, all exploited in the wild), 4 ransomware victims, 12 new IOCs. Darknet feed degraded 2 days — its 3-section gap flagged as a collection gap, not an intelligence vacuum. Supply chain: 2 malicious npm packages. Executive summary: patching priority = the 3 KEV CVEs; the degraded darknet window may hide victim-post activity, so re-run the victim count after feed recovery.',
  ],
  'weekly-briefing:brief-note': [
    '## Executive Summary — Weekly synthesis: core aggregates complete (27 findings, 9 CVEs, 3 KEV, 4 victims, 12 IOCs). The darknet feed returned nothing for 2 days; the victim count and darknet sections are therefore limited — the gap is flagged, not interpreted as zero activity. Supply chain section is full. ## Report Metadata — Report Title: Weekly Briefing — synthesis note; Report Classification: TLP: CLEAR. :::handoff — review_report: Re-run the darknet victim pull once the feed recovers.',
  ],
  'weekly-briefing:sector-brief': [
    'Landscape: 27 findings this week with a KEV-heavy CVE set (3/9) and 4 ransomware victims — consistent with the prior two weeks (victims 3→4). The darknet feed outage (2 days) is a known gap; briefings_related shows last week shared the same victim-adjacent keywords. Supply chain: 2 npm disclosures, no sector impact. Assessment: sustained, expect re-emphasis on KEV patching; victim post-volume may correct upward after feed recovery.',
  ],
  'weekly-briefing:si-routing': [
    'Routing decision: a weekly synthesis brief — no single skill owns this; compose from the ransomware, CVE, and supply-chain skills with the evidence-based analysis guardrails. Pre-flight: if victim data is pulled, that is a feed read, not a KQL query; no pre-flight needed. Output policy: cite every claim; the degraded darknet window must be labeled as a gap, not silence.',
  ],
  'water-sector:cti-report': [
    'Sector brief — water utilities (TLP:CLEAR, confidence moderate): 3 attempted intrusions against ICS-adjacent IT assets, 1 KEV in PLC configuration software, rising info-stealer prevalence, no public breach. Ranked risk: (1) KEV in PLC config tooling — patch or isolate; (2) IT-to-ICS pivot path from the 3 intrusions; (3) info-stealer credential exposure enabling vendor-portal abuse. Recommended actions: prioritize the KEV patch, segment the remote-access path, run info-stealer IOC hunts on VPN/portal logs.',
  ],
  'water-sector:brief-note': [
    '## Executive Summary — Sector: water utilities. Data: 3 attempted intrusions (IT-adjacent), 1 KEV affecting PLC config software, info-stealer trend observed. Attribution inconclusive — no actor was confirmed in the available data. Tools with data: get_threat_pulse, ti_brief_sector. Failed/empty: actor attribution feeds. ## Report Metadata — Report Title: Sector Brief — Water Utilities (note); Report Classification: TLP: CLEAR. :::handoff — review_report: Enrich the KEV entry once vendor guidance lands.',
  ],
  'water-sector:sector-brief': [
    'Landscape: water utilities face a low-incidence, high-consequence pattern this week — 3 intrusions (IT-adjacent), 1 KEV in PLC config tooling, rising info-stealer usage. Prior briefs: the same info-stealer keyword matched one June brief (2 shared IOCs). Ransomware map: no water-utility victim this period. Assessment: prioritize the KEV patch and the remote-access path into plant networks; advisory-level risk, not yet incident-level.',
  ],
  'water-sector:si-routing': [
    'Routing decision: sector-specific posture review — route to the sector threat brief skill and the KQL pre-flight checklist for any SigninLogs/ExposureGraph queries against tenant telemetry. Evidence-based analysis applies: the 1 KEV is fact, the rising info-stealer usage is a trend claim from feed data. Output policy: portal links only. No executable remediation steps in the response.',
  ],
};

function configFromEnv() {
  const provider = process.env.USE_LLM === 'false' ? 'offline' : (process.env.LLM_PROVIDER ?? 'offline');
  const cfg = { provider, useLLM: provider !== 'offline', model: null, endpoint: null, apiKey: null };
  const missing = [];
  if (provider === 'openai') {
    cfg.apiKey = process.env.OPENAI_API_KEY;
    cfg.model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    cfg.endpoint = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  } else if (provider === 'foundry') {
    cfg.apiKey = process.env.FOUNDRY_API_KEY;
    cfg.model = process.env.FOUNDRY_MODEL;
    cfg.endpoint = process.env.FOUNDRY_ENDPOINT;
  } else if (provider === 'azure') {
    cfg.apiKey = process.env.AZURE_OPENAI_API_KEY;
    cfg.model = process.env.AZURE_OPENAI_CHAT_DEPLOYMENT;
    cfg.endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    cfg.apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? '2024-12-01-preview';
  }
  if (provider !== 'offline') {
    for (const [key, value] of Object.entries({ apiKey: cfg.apiKey, model: cfg.model, endpoint: cfg.endpoint })) {
      if (!value) missing.push(provider === 'azure' ? `AZURE_OPENAI_${key.toUpperCase()}` : `${provider.toUpperCase()}_${key.toUpperCase()}`);
    }
  }
  if (missing.length) {
    throw new Error(`prompt-eval: LLM_PROVIDER=${provider} but missing env: ${missing.join(', ')}`);
  }
  return cfg;
}

async function chatCompletion(cfg, messages) {
  let url;
  const headers = { 'content-type': 'application/json' };
  const body = { model: cfg.model, messages, temperature: 0.2 };
  if (cfg.provider === 'azure') {
    url = `${cfg.endpoint}/openai/deployments/${cfg.model}/chat/completions?api-version=${cfg.apiVersion}`;
    headers['api-key'] = cfg.apiKey;
    delete body.model;
  } else {
    url = cfg.provider === 'foundry' ? `${cfg.endpoint}/openai/chat/completions` : `${cfg.endpoint}/chat/completions`;
    headers.authorization = `Bearer ${cfg.apiKey}`;
  }
  const started = Date.now();
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    throw new Error(`prompt-eval: ${cfg.provider} returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content ?? '', latencyMs: Date.now() - started };
}

function scoreResponse(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const lower = text.toLowerCase();
  const rubric = {
    conciseness: scoreConciseness(wordCount),
    'task alignment': scoreTaskAlignment(lower),
    'metric awareness': scoreMetricAwareness(lower),
    actionability: scoreActionability(lower),
  };
  return { wordCount, rubric, total: Object.values(rubric).reduce((a, b) => a + b, 0) };
}

function scoreConciseness(wordCount) {
  if (wordCount <= 120) return 5;
  if (wordCount <= 160) return 4;
  if (wordCount <= 220) return 3;
  if (wordCount <= 300) return 2;
  return 1;
}

function scoreTaskAlignment(lower) {
  const directness = [
    'recommend',
    'decide',
    'decision',
    'priorit',
    'mitigat',
    'should',
    'action',
    'focus',
    'risk',
    'metric',
  ].filter((k) => lower.includes(k)).length;
  return directness >= 6 ? 5 : directness >= 4 ? 4 : directness >= 2 ? 3 : directness === 1 ? 2 : 1;
}

function scoreMetricAwareness(lower) {
  const metricHits = (lower.match(/\b\w{2,4}(%|x|×|h|m|s|k|km)\b/g) ?? []).length;
  const mentions =
    ['ticket', 'volume', 'latency', 'response', 'csat', 'token', 'spend', 'cost', 'metric', 'count'].filter(
      (k) => lower.includes(k)
    ).length;
  return metricHits >= 4 && mentions >= 5 ? 5 : metricHits >= 2 && mentions >= 3 ? 4 : metricHits >= 1 ? 3 : mentions >= 2 ? 2 : 1;
}

function scoreActionability(lower) {
  const imperative = [
    'enable',
    'check',
    'turn on',
    'track',
    'set',
    'cut',
    'run',
    'add',
    'watch',
    'investigate',
    'find',
    'phase',
    'review',
  ].filter((k) => lower.includes(k)).length;
  const explicit = ['first', 'then', 'next', 'before', 'order', 'step', 'this week', 'today', 'sprint'].filter(
    (k) => lower.includes(k)
  ).length;
  return imperative >= 4 && explicit >= 3 ? 5 : imperative >= 3 && explicit >= 2 ? 4 : imperative >= 2 ? 3 : imperative === 1 ? 2 : 1;
}

function toCsv(rows) {
  const headers = Object.keys(rows[0]);
  return [headers.join(','), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(','))].join('\n') + '\n';
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const cfg = configFromEnv();
  console.log(`prompt-eval: provider=${cfg.provider} (useLLM=${cfg.useLLM})`);
  console.log(`prompt-eval: ${SCENARIOS.length} cases × ${PROMPT_VARIANTS.length} variants`);

  const rows = [];
  for (const scenario of SCENARIOS) {
    for (const variant of PROMPT_VARIANTS) {
      const prompt = variant.template(scenario.title, scenario.input);
      let text;
      let latencyMs;
      if (cfg.useLLM) {
        const result = await chatCompletion(cfg, [{ role: 'user', content: prompt }]);
        text = result.text;
        latencyMs = result.latencyMs;
      } else {
        const canned = OFFLINE_RESPONSES[`${scenario.id}:${variant.id}`];
        if (!canned) throw new Error(`prompt-eval: no offline response for ${scenario.id}:${variant.id}`);
        text = canned[0];
        latencyMs = 0;
      }
      const score = scoreResponse(text);
      rows.push({
        case_id: scenario.id,
        variant_id: variant.id,
        word_count: score.wordCount,
        conciseness: score.rubric.conciseness,
        task_alignment: score.rubric['task alignment'],
        metric_awareness: score.rubric['metric awareness'],
        actionability: score.rubric.actionability,
        total_score: score.total,
        latency_ms: latencyMs,
        response: text,
      });
    }
  }

  const byVariant = new Map();
  for (const row of rows) {
    const agg = byVariant.get(row.variant_id) ?? { count: 0, scoreSum: 0, wordSum: 0, latencySum: 0 };
    agg.count += 1;
    agg.scoreSum += row.total_score;
    agg.wordSum += row.word_count;
    agg.latencySum += row.latency_ms;
    byVariant.set(row.variant_id, agg);
  }
  const summaryRows = [...byVariant.entries()]
    .map(([variantId, agg]) => ({
      variant_id: variantId,
      avg_total_score: round2(agg.scoreSum / agg.count),
      avg_word_count: round2(agg.wordSum / agg.count),
      avg_latency_ms: round2(agg.latencySum / agg.count),
    }))
    .sort((a, b) => b.avg_total_score - a.avg_total_score);

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(RESULTS_CSV, toCsv(rows));
  writeFileSync(SUMMARY_CSV, toCsv(summaryRows));

  console.log('\nVariant ranking (by avg rubric score):');
  for (const row of summaryRows) {
    console.log(
      `  ${row.variant_id.padEnd(18)} avg=${String(row.avg_total_score).padEnd(5)} words=${String(
        row.avg_word_count
      ).padEnd(5)} latency=${row.avg_latency_ms}ms`
    );
  }
  console.log(`\nTop variant: ${summaryRows[0]?.variant_id} (${summaryRows[0]?.avg_total_score}/20)`);
  console.log(`Artifacts: ${RESULTS_CSV}\n           ${SUMMARY_CSV}`);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
