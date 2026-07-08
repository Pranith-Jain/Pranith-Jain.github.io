/**
 * Agent synthesizer — final LLM pass that turns the full investigation
 * step history into a CTI report following the Zeltser template
 * (https://zeltser.com/cyber-threat-intel-report-template) + structured
 * action card.
 */
import type { Ai } from '@cloudflare/workers-types';
import { runCompletion, type CompletionInput } from '../../case-study/generation/ai-client';
import type {
  ActionItem,
  ActionStakeholder,
  AgentStep,
  DiamondModel,
  MitreTechniqueEntry,
  PirLink,
  ReportActionCard,
  SynthesizerOutput,
} from './types';
import { buildSynthesizerPrompt, buildSynthesizerUserPrompt } from './prompts';

interface DataQuality {
  totalOk: number;
  totalErr: number;
  emptyResults: number;
}

export async function synthesizeReport(
  ai: Ai,
  query: string,
  queryType: string,
  steps: AgentStep[],
  opts: { groqKey?: string; googleKey?: string; nvidiaKey?: string; dataQuality?: DataQuality }
): Promise<SynthesizerOutput> {
  const dq = opts.dataQuality ?? {
    totalOk: steps.reduce((n, s) => n + s.results.filter((r) => r.status === 'ok').length, 0),
    totalErr: steps.reduce((n, s) => n + s.results.filter((r) => r.status === 'error').length, 0),
    emptyResults: 0,
  };

  // If almost all tools failed or returned empty, the report will be thin.
  // Add a warning to the synthesizer so it doesn't hallucinate to fill gaps.
  let dataWarning = '';
  if (dq.totalOk <= 1) {
    dataWarning = `\n\nWARNING: Only ${dq.totalOk} tool(s) returned data. ${dq.totalErr} failed. The report must honestly reflect this — write "No data available" in the executive summary and OMIT all other sections. DO NOT invent data. The action card severity MUST be "info" and confidence MUST be "low".`;
  } else if (dq.emptyResults > dq.totalOk / 2) {
    dataWarning = `\n\nWARNING: ${dq.emptyResults} of ${dq.totalOk} tool results were nearly empty. Be honest about what is actually known.`;
  }

  const currentDate = new Date().toISOString().split('T')[0];
  const system = buildSynthesizerPrompt(query, queryType, currentDate);
  const user = buildSynthesizerUserPrompt(query, queryType, steps) + dataWarning;
  const input: CompletionInput = { system, user, maxTokens: 5500, temperature: 0.3 };

  const { text, modelUsed } = await runCompletion(ai, input, {
    googleKey: opts.googleKey,
    groqKey: opts.groqKey,
    nvidiaKey: opts.nvidiaKey,
    quality: true,
    preferGroq: true,
  });

  const { report, actionCard, handoff, reportHeader } = splitSynthOutput(text);
  const keyFindings = extractKeyFindings(report);
  const iocs = extractIocs(report);
  const mitre = extractMitre(report);
  const confidence = actionCard?.verdict.confidence ?? estimateConfidence(steps, dq);

  // Attach handoff + reportHeader to the action card so the UI can show
  // both the next-step buttons AND the BLUF panel without re-parsing the
  // raw report text.
  if (actionCard) {
    if (handoff) {
      (actionCard as ReportActionCard & { handoff?: typeof handoff }).handoff = handoff;
    }
    if (reportHeader) {
      (actionCard as ReportActionCard & { reportHeader?: ReportHeader }).reportHeader = reportHeader;
    }
  }

  return {
    report,
    modelUsed,
    keyFindings,
    confidence,
    iocsExtracted: iocs,
    mitreTechniques: mitre,
    actionCard,
  };
}

/**
 * Split the synthesizer output into prose report + handoff + action card.
 *
 * Output layout from the LLM:
 *   1. Prose report (markdown)
 *   2. :::handoff block (yaml-ish, plain text)
 *   3. ```action-card code block (strict JSON)
 *
 * Each block is independently optional; missing blocks don't break parsing.
 */
export interface ReportHeader {
  headline: string;
  bluf: string;
  key_takeaway: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  posture: 'active' | 'reconnaissance' | 'post-exploit' | 'informational' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  tlp: 'CLEAR' | 'GREEN' | 'AMBER' | 'RED';
  tlp_rationale?: string;
  actor?: string | null;
  campaign?: string | null;
  primary_indicator?: { type: string; value: string } | null;
  time_to_act?: string | null;
}

export function splitSynthOutput(raw: string): {
  report: string;
  actionCard?: ReportActionCard;
  handoff?: { next_stages: string[]; analyst_approval_required: boolean };
  reportHeader?: ReportHeader;
} {
  // Pull out the report-header JSON block (machine-readable BLUF) first.
  const headerMatch = raw.match(/```report-header\s*\n([\s\S]*?)\n```/);
  let reportHeader: ReportHeader | undefined;
  if (headerMatch && headerMatch[1]) {
    try {
      const parsed = JSON.parse(headerMatch[1].trim()) as unknown;
      if (parsed && typeof parsed === 'object') {
        reportHeader = parsed as ReportHeader;
      }
    } catch {
      // LLM emitted malformed JSON — leave reportHeader undefined and fall
      // back to parsing the prose headline.
    }
  }

  // Pull out the action-card JSON block first.
  const cardMatch = raw.match(/```action-card\s*\n([\s\S]*?)\n```\s*$/);
  const cardJson = cardMatch?.[1]?.trim() ?? '';
  let body = raw;
  if (cardMatch && cardMatch.index !== undefined) {
    body = raw.slice(0, cardMatch.index);
  }
  // Strip the report-header from the prose body so it doesn't render as a
  // stray code block.
  if (headerMatch && headerMatch.index !== undefined) {
    body = body.slice(0, headerMatch.index) + body.slice(headerMatch.index + headerMatch[0].length);
  }

  // Then the :::handoff block (just before the action-card).
  const handoffMatch = body.match(/:::handoff\s*\n([\s\S]*?)\n:::\s*$/);
  let handoff: { next_stages: string[]; analyst_approval_required: boolean } | undefined;
  if (handoffMatch && handoffMatch[1]) {
    handoff = parseHandoff(handoffMatch[1]);
    body = body.slice(0, handoffMatch.index ?? 0);
  }

  // Trim trailing whitespace on the prose.
  const prose = body.replace(/\n+$/, '');

  // Parse the action card.
  let card: ReportActionCard | undefined;
  if (cardJson) {
    try {
      const parsed = JSON.parse(cardJson) as ReportActionCard;
      card = normaliseActionCard(parsed, prose);
    } catch {
      card = synthesiseFallbackCard(prose);
    }
  } else {
    card = synthesiseFallbackCard(prose);
  }

  return { report: prose, actionCard: card, handoff, reportHeader };
}

function parseHandoff(text: string): { next_stages: string[]; analyst_approval_required: boolean } {
  // The :::handoff block is a free-form yaml-ish list emitted by the LLM.
  // Be lenient: accept bullets (`-`, `*`), numbered lists, or plain lines.
  // Each line can be either:
  //   stage_name: description
  //   stage_name            (no description — used as both name and value)
  const out: { next_stages: string[]; analyst_approval_required: boolean } = {
    next_stages: [],
    analyst_approval_required: true,
  };

  // Match the whole line so we can both strip and re-emit the stage text.
  const lineRe = /^\s*(?:[-*]|\d+\.)\s*(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(text)) !== null) {
    const line = m[1] ?? '';
    if (!line) continue;
    // Skip the analyst_approval_required config line — it is not a stage.
    if (/^analyst_approval_required\b/i.test(line)) continue;
    if (/\S+:\s*\S+/.test(line)) {
      out.next_stages.push(line);
    } else {
      out.next_stages.push(`${line}: (no description provided)`);
    }
  }
  const apprMatch = /analyst_approval_required\s*:\s*(true|false)/i.exec(text);
  if (apprMatch) out.analyst_approval_required = apprMatch[1]!.toLowerCase() === 'true';
  return out;
}

const SEV_ALLOWED = ['critical', 'high', 'medium', 'low', 'info'] as const;
const STAKEHOLDER_ALLOWED: ActionStakeholder[] = [
  'cti',
  'soc',
  'ir',
  'vuln',
  'redteam',
  'appsec',
  'awareness',
  'exec',
  'legal',
  'tprm',
];

function normaliseActionCard(card: ReportActionCard, prose: string): ReportActionCard {
  const verdict = {
    headline: card.verdict?.headline?.trim() || extractHeadline(prose) || 'Investigation complete',
    confidence: (['high', 'medium', 'low'] as const).includes(card.verdict?.confidence)
      ? card.verdict.confidence
      : 'medium',
    confidence_rationale: card.verdict?.confidence_rationale?.trim() || undefined,
    posture: (['active', 'reconnaissance', 'post-exploit', 'informational', 'unknown'] as const).includes(
      card.verdict?.posture
    )
      ? card.verdict.posture
      : 'unknown',
    tlp: (['CLEAR', 'GREEN', 'AMBER', 'RED'] as const).includes(card.verdict?.tlp) ? card.verdict.tlp : 'AMBER',
  };
  const severity = SEV_ALLOWED.includes(card.severity) ? card.severity : 'medium';

  const actions: ActionItem[] = Array.isArray(card.actions)
    ? card.actions.slice(0, 8).map((a) => ({
        severity: SEV_ALLOWED.includes(a.severity) ? a.severity : 'info',
        action: String(a.action ?? '').slice(0, 280),
        target: a.target ? String(a.target).slice(0, 200) : undefined,
        source: a.source ? String(a.source).slice(0, 80) : undefined,
        category: (['contain', 'eradicate', 'recover', 'detect', 'hunt', 'inform'] as const).includes(a.category)
          ? a.category
          : 'inform',
        stakeholders: normaliseStakeholders((a as { stakeholders?: unknown }).stakeholders),
      }))
    : [];

  const mitre: MitreTechniqueEntry[] = Array.isArray(card.mitre)
    ? card.mitre
        .slice(0, 30)
        .map((m) => ({
          id: String(m.id ?? '').trim(),
          name: m.name ? String(m.name).slice(0, 100) : undefined,
          tactic: m.tactic ? String(m.tactic).slice(0, 50) : undefined,
          evidence: m.evidence ? String(m.evidence).slice(0, 200) : undefined,
          detection:
            m.detection && (['yara', 'sigma', 'kql', 'splunk', 'none'] as readonly string[]).includes(m.detection)
              ? (m.detection as 'yara' | 'sigma' | 'kql' | 'splunk' | 'none')
              : 'none',
        }))
        .filter((m) => /^T\d{4}(\.\d{3})?$/.test(m.id))
    : [];

  const iocs = Array.isArray(card.iocs)
    ? card.iocs
        .slice(0, 30)
        .map((i) => ({
          type: (['ipv4', 'ipv6', 'domain', 'url', 'hash', 'email', 'cve', 'actor', 'malware'] as const).includes(
            i.type
          )
            ? i.type
            : 'domain',
          value: String(i.value ?? '').slice(0, 300),
          confidence: (['Confirmed', 'Probable', 'Possible'] as const).includes(i.confidence)
            ? i.confidence
            : 'Possible',
          source: i.source ? String(i.source).slice(0, 80) : undefined,
        }))
        .filter((i) => i.value)
    : [];

  const diamond: DiamondModel | undefined = card.diamond
    ? {
        adversary: card.diamond.adversary ? String(card.diamond.adversary).slice(0, 200) : undefined,
        capability: Array.isArray(card.diamond.capability)
          ? card.diamond.capability.slice(0, 10).map((s) => String(s).slice(0, 200))
          : undefined,
        infrastructure: Array.isArray(card.diamond.infrastructure)
          ? card.diamond.infrastructure.slice(0, 20).map((s) => String(s).slice(0, 200))
          : undefined,
        victim: card.diamond.victim ? String(card.diamond.victim).slice(0, 200) : undefined,
      }
    : undefined;

  const pirs: PirLink[] | undefined = Array.isArray(card.pirs)
    ? card.pirs
        .slice(0, 10)
        .map((p) => ({
          pir: String(p.pir ?? '').slice(0, 240),
          relevant: p.relevant === true,
          bluf: p.bluf ? String(p.bluf).slice(0, 280) : undefined,
          businessOutcome: p.businessOutcome ? String(p.businessOutcome).slice(0, 200) : undefined,
        }))
        .filter((p) => p.pir)
    : undefined;

  return {
    verdict,
    severity,
    actions,
    mitre,
    iocs,
    kev: card.kev === true,
    kev_date: typeof card.kev_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(card.kev_date) ? card.kev_date : null,
    cvss: (() => {
      const c = card.cvss as { score?: unknown; vector?: unknown; severity?: unknown } | undefined;
      if (!c) return undefined;
      const score = typeof c.score === 'number' && c.score >= 0 && c.score <= 10 ? Math.round(c.score * 10) / 10 : null;
      const vector = typeof c.vector === 'string' ? c.vector.slice(0, 200) : null;
      const severity = (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).includes(
        c.severity as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
      )
        ? (c.severity as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL')
        : null;
      return { score, vector, severity };
    })(),
    epss: (() => {
      const e = card.epss as { score?: unknown; percentile?: unknown } | undefined;
      if (!e) return undefined;
      const score =
        typeof e.score === 'number' && e.score >= 0 && e.score <= 1 ? Math.round(e.score * 1000) / 1000 : null;
      const percentile =
        typeof e.percentile === 'number' && e.percentile >= 0 && e.percentile <= 1
          ? Math.round(e.percentile * 1000) / 1000
          : null;
      return { score, percentile };
    })(),
    ransomware_use: card.ransomware_use === 'Known' || card.ransomware_use === 'Suspected' ? card.ransomware_use : null,
    threat_actors: Array.isArray(card.threat_actors)
      ? (card.threat_actors as unknown[])
          .filter((a): a is string => typeof a === 'string')
          .slice(0, 10)
          .map((a) => a.slice(0, 80))
      : [],
    exploit_status: (['poc-public', 'weaponized', 'in-the-wild'] as const).includes(
      card.exploit_status as 'poc-public' | 'weaponized' | 'in-the-wild'
    )
      ? (card.exploit_status as 'poc-public' | 'weaponized' | 'in-the-wild')
      : null,
    patch_url: typeof card.patch_url === 'string' ? card.patch_url.slice(0, 500) : null,
    ransomware: card.ransomware === true,
    attributed: card.attributed === true,
    timeline: Array.isArray(card.timeline)
      ? card.timeline.slice(0, 20).map((t) => ({
          date: t.date ? String(t.date) : undefined,
          event: String(t.event ?? '').slice(0, 280),
          source: t.source ? String(t.source).slice(0, 80) : undefined,
        }))
      : undefined,
    navigatorLayer: card.navigatorLayer
      ? {
          name: String(card.navigatorLayer.name ?? 'DFIR Investigation').slice(0, 120),
          description: String(card.navigatorLayer.description ?? '').slice(0, 280),
          techniques: Array.isArray(card.navigatorLayer.techniques)
            ? card.navigatorLayer.techniques
                .map((t) => ({
                  id: String(t.id ?? '').trim(),
                  score: Math.max(0, Math.min(100, Number(t.score ?? 0))),
                  comment: t.comment ? String(t.comment).slice(0, 200) : undefined,
                }))
                .filter((t) => /^T\d{4}(\.\d{3})?$/.test(t.id))
            : [],
        }
      : undefined,
    diamond: diamond && hasDiamondData(diamond) ? diamond : undefined,
    pirs: pirs && pirs.length > 0 ? pirs : undefined,
  };
}

function hasDiamondData(d: DiamondModel): boolean {
  let count = 0;
  if (d.adversary) count++;
  if (d.capability && d.capability.length > 0) count++;
  if (d.infrastructure && d.infrastructure.length > 0) count++;
  if (d.victim) count++;
  return count >= 2;
}

function normaliseStakeholders(input: unknown): ActionStakeholder[] {
  if (!Array.isArray(input)) return [];
  const out: ActionStakeholder[] = [];
  const seen = new Set<string>();
  for (const v of input) {
    const s = String(v).toLowerCase().trim();
    // Map friendly aliases
    const alias: Record<string, ActionStakeholder> = {
      cti: 'cti',
      'cti team': 'cti',
      soc: 'soc',
      'soc & detection': 'soc',
      'soc & detection engineering': 'soc',
      'soc &amp; detection': 'soc',
      ir: 'ir',
      'incident response': 'ir',
      vmgt: 'vuln',
      'vulnerability management': 'vuln',
      vuln: 'vuln',
      red: 'redteam',
      redteam: 'redteam',
      'red team': 'redteam',
      'red team / purple team': 'redteam',
      appsec: 'appsec',
      aware: 'awareness',
      awareness: 'awareness',
      'security awareness': 'awareness',
      exec: 'exec',
      'executive leadership': 'exec',
      ciso: 'exec',
      legal: 'legal',
      'legal/grc': 'legal',
      tprm: 'tprm',
      'third-party risk management': 'tprm',
    };
    const mapped = alias[s];
    if (mapped && !seen.has(mapped)) {
      out.push(mapped);
      seen.add(mapped);
    }
  }
  // Keep order deterministic with allowed list as tiebreaker
  return out.sort((a, b) => STAKEHOLDER_ALLOWED.indexOf(a) - STAKEHOLDER_ALLOWED.indexOf(b));
}

function extractHeadline(prose: string): string | undefined {
  // Fallback for reports following the Zeltser template: extract the first
  // sentence after the Executive Summary heading.
  const m = prose.match(/##\s*1\.\s*Executive Summary\s*\n+\s*([^.]+\.)/);
  return m?.[1]?.trim();
}

function synthesiseFallbackCard(prose: string): ReportActionCard {
  const headline = extractHeadline(prose) ?? 'Investigation complete';
  const iocs = extractIocs(prose)
    .slice(0, 10)
    .map((value) => {
      let type: ReportActionCard['iocs'][number]['type'] = 'domain';
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) type = 'ipv4';
      else if (/^[A-F0-9]{64}$/i.test(value)) type = 'hash';
      else if (/^CVE-\d{4}-\d+/i.test(value)) type = 'cve';
      else if (/^https?:\/\//i.test(value)) type = 'url';
      else if (/^[^@\s]+@[^@\s]+$/.test(value)) type = 'email';
      return { type, value, confidence: 'Probable' as const };
    });
  return {
    verdict: {
      headline,
      confidence: 'medium',
      posture: 'unknown',
      tlp: 'AMBER',
    },
    severity: 'medium',
    actions: [
      {
        severity: 'medium',
        action: 'Review the prose report above for findings and indicators.',
        category: 'inform',
        stakeholders: ['cti'],
      },
    ],
    mitre: extractMitre(prose)
      .slice(0, 10)
      .map((id) => ({ id, detection: 'none' as const })),
    iocs,
    kev: false,
    kev_date: null,
    ransomware: false,
    attributed: false,
    threat_actors: [],
  };
}

function extractKeyFindings(report: string): string[] {
  // Zeltser template: Key Findings is a sub-heading under Executive Summary,
  // rendered as a markdown table: | Decision question | Finding | Confidence | Likelihood |
  // Extract the "Finding" column from each data row.
  const zeltserMatch = report.match(
    /### Key Findings\s*\n\|[^\n]+\|[^\n]+\|\s*\n\|[^\n]+\|[^\n]+\|\s*\n([\s\S]*?)(?=\n## |\n#|$)/
  );
  if (zeltserMatch?.[1]) {
    return zeltserMatch[1]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('|'))
      .map((l) => {
        const cells = l.split('|').map((c) => c.trim());
        // cells[2] = Finding column (0=empty, 1=question, 2=finding, 3=confidence, 4=likelihood)
        return cells[2] ?? '';
      })
      .filter((f) => f.length > 10 && !f.includes('---'))
      .slice(0, 10);
  }
  // Fallback: legacy numbered section format (old SOC-dashboard template)
  const legacy = report.match(/##\s*3\.\s*KEY FINDINGS\s*\n([\s\S]*?)(?=\n### |\n## |\n# |$)/);
  if (legacy?.[1]) {
    return legacy[1]
      .split('\n')
      .map((l) =>
        l.replace(/^[-*]\s*(?:\[(?:High|Medium|Low|Critical|Confirmed|Probable|Possible|Info)\]\s*)?/, '').trim()
      )
      .filter((l) => l.length > 10)
      .slice(0, 10);
  }
  return [];
}

function extractIocs(report: string): string[] {
  const iocs: string[] = [];
  const ipv4 = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\b/g;
  let m: RegExpExecArray | null;
  while ((m = ipv4.exec(report)) !== null) {
    const ip = m[0];
    const first = Number(ip.split('.')[0]);
    if (first === 0 || first === 127 || first >= 224) continue;
    iocs.push(ip);
  }
  const sha256 = /\b[a-fA-F0-9]{64}\b/g;
  while ((m = sha256.exec(report)) !== null) iocs.push(m[0]);
  const SKIP = new Set([
    'example.com',
    'example.org',
    'github.com',
    'mitre.org',
    'nvd.nist.gov',
    'cloudflare.com',
    'microsoft.com',
    'google.com',
    'wikipedia.org',
  ]);
  const domains = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|org|net|io|co|ru|cn|onion)\b/gi;
  while ((m = domains.exec(report)) !== null) {
    const d = m[0].toLowerCase();
    if (SKIP.has(d) || /^\d+\.\d+/.test(d)) continue;
    iocs.push(d);
  }
  return [...new Set(iocs)].slice(0, 30);
}

function extractMitre(report: string): string[] {
  return [...new Set(report.match(/\bT\d{4}(?:\.\d{3})?\b/g) ?? [])];
}

function estimateConfidence(steps: AgentStep[], dq?: DataQuality): 'high' | 'medium' | 'low' {
  const ok = dq?.totalOk ?? steps.reduce((n, s) => n + s.results.filter((r) => r.status === 'ok').length, 0);
  const total =
    ok + (dq?.totalErr ?? steps.reduce((n, s) => n + s.results.filter((r) => r.status === 'error').length, 0));
  const errRate = total > 0 ? 1 - ok / total : 1;
  if (ok >= 6 && errRate < 0.2) return 'high';
  if (ok >= 3 && errRate < 0.5) return 'medium';
  return 'low';
}
