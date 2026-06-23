/**
 * ReportView — structured renderer for the DFIR agent / Copilot report.
 *
 * Takes the prose report (markdown) + the structured action card produced
 * by the synthesizer, and renders:
 *   - A severity banner with confidence + posture + TLP
 *   - The headline verdict
 *   - The executive summary
 *   - A stakeholder filter chip row (CTI / SOC / IR / VMGT / RED / AWARE / EXEC)
 *     that hides the prose sections not relevant to the selected team
 *   - Key findings (with severity colour)
 *   - Threat context (markdown body)
 *   - An IOC table (parsed from the action card)
 *   - A MITRE table (tactic → technique → detection)
 *   - A Diamond Model card (if the LLM filled ≥2 vertices)
 *   - An actions checklist (stakeholder-tagged)
 *   - A PIR list with business outcomes
 *   - A "Next Actions" row: Generate Hunt Queries / Generate YARA / Export
 *     MITRE Navigator / Copy STIX. These call the existing agent tools
 *     against the report context.
 *
 * The prose body keeps its full markdown rendering. Code fences (KQL,
 * Splunk, YARA) are highlighted. The "action-card" and "stix" code
 * blocks are stripped — the UI has structured components for those.
 */
import { useMemo, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Bug,
  Clock,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  Database,
  Share2,
  Diamond,
  ExternalLink,
  FileText,
  Flag,
  Info,
  Link2,
  Loader2,
  Map as MapIcon,
  MessageSquare,
  Network,
  Shield,
  Sparkles,
  Target,
  Terminal,
  Users,
} from 'lucide-react';
import { extractStixBundle, StixRelationshipGraph, StixObjectTable } from '../StixBundleViewer';

// ─────────────────────────────────────────────────────────────────────────
// Types — mirror api/src/lib/agent/types.ts. Kept inline so this component
// can be embedded in any client bundle without re-importing the agent types.
// ─────────────────────────────────────────────────────────────────────────

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Stakeholder =
  | 'cti'
  | 'soc'
  | 'ir'
  | 'vuln'
  | 'redteam'
  | 'appsec'
  | 'awareness'
  | 'exec'
  | 'legal'
  | 'tprm';

export interface ReportActionItem {
  severity: Severity;
  action: string;
  target?: string;
  source?: string;
  category: 'contain' | 'eradicate' | 'recover' | 'detect' | 'hunt' | 'inform';
  stakeholders?: Stakeholder[];
}

export interface ReportMitre {
  id: string;
  name?: string;
  tactic?: string;
  evidence?: string;
  detection?: 'yara' | 'sigma' | 'kql' | 'splunk' | 'none';
}

export interface ReportIoc {
  type: 'ipv4' | 'ipv6' | 'domain' | 'url' | 'hash' | 'email' | 'cve' | 'actor' | 'malware';
  value: string;
  confidence: 'Confirmed' | 'Probable' | 'Possible';
  source?: string;
}

export interface ReportDiamond {
  adversary?: string;
  capability?: string[];
  infrastructure?: string[];
  victim?: string;
}

export interface ReportPir {
  pir: string;
  relevant: boolean;
  bluf?: string;
  businessOutcome?: string;
}

export interface ReportActionCard {
  verdict: {
    headline: string;
    confidence: 'high' | 'medium' | 'low';
    confidence_rationale?: string;
    posture: 'active' | 'reconnaissance' | 'post-exploit' | 'informational' | 'unknown';
    tlp: 'CLEAR' | 'GREEN' | 'AMBER' | 'RED';
  };
  severity: Severity;
  actions: ReportActionItem[];
  mitre: ReportMitre[];
  iocs: ReportIoc[];
  kev: boolean;
  kev_date?: string | null;
  cvss?: { score: number | null; vector: string | null; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null };
  epss?: { score: number | null; percentile: number | null };
  ransomware_use?: 'Known' | 'Suspected' | null;
  threat_actors?: string[];
  exploit_status?: 'poc-public' | 'weaponized' | 'in-the-wild' | null;
  patch_url?: string | null;
  ransomware: boolean;
  attributed: boolean;
  timeline?: Array<{ date?: string; event: string; source?: string }>;
  navigatorLayer?: {
    name: string;
    description: string;
    techniques: Array<{ id: string; score: number; comment?: string }>;
  };
  diamond?: ReportDiamond;
  pirs?: ReportPir[];
  /** Internal — populated by synthesizer when it parses the :::handoff block. */
  handoff?: { next_stages: string[]; analyst_approval_required: boolean };
  /** Internal — populated by synthesizer when it parses the
   *  \`\`\`report-header block. Drives the BLUF hero card. */
  reportHeader?: {
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
  };
}

/** Build a self-contained Markdown version of the report for sharing in
 *  Slack, email, or a ticketing system. Includes the BLUF, action checklist,
 *  IOC table, MITRE summary, and the full prose body. */
function buildShareMarkdown(report: string, actionCard?: ReportActionCard, query?: string): string {
  const lines: string[] = [];

  // Title
  const title = actionCard?.reportHeader?.headline ?? actionCard?.verdict.headline ?? 'DFIR Investigation Report';
  lines.push(`# ${title}`);
  lines.push('');

  // Metadata block
  if (query) {
    lines.push(`**Query:** \`${query}\`  `);
  }
  if (actionCard) {
    const sev = actionCard.severity.toUpperCase();
    const tlp = actionCard.verdict.tlp;
    const posture = actionCard.verdict.posture;
    const conf = actionCard.verdict.confidence;
    lines.push(`**Severity:** ${sev}  `);
    lines.push(`**TLP:** ${tlp} · **Posture:** ${posture} · **Confidence:** ${conf}  `);
    if (actionCard.reportHeader?.actor) {
      lines.push(`**Actor:** ${actionCard.reportHeader.actor}  `);
    }
    if (actionCard.reportHeader?.time_to_act) {
      lines.push(`**Time to act:** ${actionCard.reportHeader.time_to_act}  `);
    }
    lines.push('');
  }

  // BLUF
  if (actionCard?.reportHeader?.bluf) {
    lines.push('## BLUF');
    lines.push('');
    lines.push(actionCard.reportHeader.bluf);
    lines.push('');
  }

  // Business impact
  if (actionCard?.reportHeader?.key_takeaway) {
    lines.push(`**Business impact:** ${actionCard.reportHeader.key_takeaway}`);
    lines.push('');
  }

  // Action checklist
  if (actionCard && actionCard.actions.length > 0) {
    lines.push('## Action Checklist');
    lines.push('');
    for (const a of actionCard.actions) {
      const sevTag = `[${a.severity.toUpperCase()}]`;
      const stakeholders = a.stakeholders?.length ? ` — Stakeholders: ${a.stakeholders.join(', ')}` : '';
      const target = a.target ? ` (${a.target})` : '';
      const source = a.source ? ` [Source: ${a.source}]` : '';
      lines.push(`- ${sevTag} ${a.action}${target}${source}${stakeholders}`);
    }
    lines.push('');
  }

  // IOC table
  if (actionCard && actionCard.iocs.length > 0) {
    lines.push('## Indicators');
    lines.push('');
    lines.push('| Type | Value | Confidence | Source |');
    lines.push('| --- | --- | --- | --- |');
    for (const ioc of actionCard.iocs) {
      lines.push(`| ${ioc.type} | \`${ioc.value}\` | ${ioc.confidence} | ${ioc.source ?? '—'} |`);
    }
    lines.push('');
  }

  // MITRE summary
  if (actionCard && actionCard.mitre.length > 0) {
    lines.push('## MITRE ATT&CK');
    lines.push('');
    for (const m of actionCard.mitre) {
      const tactic = m.tactic ? ` (${m.tactic})` : '';
      const det = m.detection ? ` — detection: ${m.detection}` : '';
      lines.push(`- **${m.id}** ${m.name ?? ''}${tactic}${det}`);
    }
    lines.push('');
  }

  // Prose body (the full report markdown)
  if (report) {
    lines.push('## Full Report');
    lines.push('');
    lines.push(report.trim());
    lines.push('');
  }

  return lines.join('\n');
}

interface ReportViewProps {
  report: string;
  actionCard?: ReportActionCard;
  /** Query that produced the report — used to call the action buttons. */
  query?: string;
  /** Optional: invoked when the user clicks an action button. The parent
   *  wires this to the existing tool endpoints. */
  onGenerateHuntingQueries?: () => Promise<{ tool: string; data: unknown } | null>;
  onGenerateYaraRule?: () => Promise<{ tool: string; data: unknown } | null>;
  /** Optional callback to open the Copilot pre-seeded with a
   *  follow-up question. The DFIR Agent page wires this to navigate to
   *  /threatintel/tools/copilot?q=... */
  onDrillDeeper?: (question: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<Severity, { bg: string; text: string; ring: string; pill: string }> = {
  critical: {
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    text: 'text-rose-700 dark:text-rose-300',
    ring: 'ring-rose-300 dark:ring-rose-800',
    pill: 'bg-rose-600 text-white',
  },
  high: {
    bg: 'bg-orange-50 dark:bg-orange-950/40',
    text: 'text-orange-700 dark:text-orange-300',
    ring: 'ring-orange-300 dark:ring-orange-800',
    pill: 'bg-orange-500 text-white',
  },
  medium: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-300 dark:ring-amber-800',
    pill: 'bg-amber-500 text-white',
  },
  low: {
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    text: 'text-blue-700 dark:text-blue-300',
    ring: 'ring-blue-300 dark:ring-blue-800',
    pill: 'bg-blue-500 text-white',
  },
  info: {
    bg: 'bg-slate-50 dark:bg-[rgb(var(--surface-200))]',
    text: 'text-slate-700 dark:text-slate-300',
    ring: 'ring-slate-300 dark:ring-slate-700',
    pill: 'bg-slate-500 text-white',
  },
};

const TLP_COLORS: Record<string, string> = {
  CLEAR: 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  GREEN: 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  AMBER: 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
  RED: 'border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300',
};

const STAKEHOLDER_META: Record<Stakeholder, { label: string; color: string }> = {
  cti: { label: 'CTI', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  soc: { label: 'SOC', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  ir: { label: 'IR', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
  vuln: { label: 'VMGT', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  redteam: { label: 'RED', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  appsec: { label: 'APPSEC', color: 'bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300' },
  awareness: { label: 'AWARE', color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300' },
  exec: { label: 'EXEC', color: 'bg-slate-100 text-slate-700 dark:bg-[rgb(var(--surface-300))] dark:text-slate-300' },
  legal: { label: 'LEGAL', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  tprm: { label: 'TPRM', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' },
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/** Render simple markdown to HTML (headings, bullets, bold, code, tables, kql/sigma/splunk blocks). */
function renderMarkdown(md: string): string {
  if (!md) return '';
  // Strip the trailing :::handoff + action-card blocks — UI handles those.
  let s = md;
  s = s.replace(/\n*:::handoff\s*\n[\s\S]*?\n:::\s*$/g, '');
  s = s.replace(/\n*```action-card\s*\n[\s\S]*?\n```\s*$/g, '');
  s = s.replace(/```stix\s*\n[\s\S]*?```/g, '');
  s = s.replace(/```json\s*\n\{[\s\S]*?"type"\s*:\s*"bundle"[\s\S]*?\}\s*\n```/g, '');

  // Escape HTML for the safe portions.
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Convert fenced code blocks first — keep them intact through other regexes.
  const codeBlocks: string[] = [];
  s = s.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, body) => {
    const idx = codeBlocks.length;
    codeBlocks.push(
      `<pre data-codeblock="${idx}" data-lang="${esc(lang)}" class="rounded bg-slate-900 dark:bg-[rgb(var(--input-200))] text-slate-100 p-3 my-3 text-xs overflow-x-auto font-mono leading-relaxed"><code>${esc(body.trimEnd())}</code></pre>`
    );
    return `\n\n§§CODEBLOCK${idx}§§\n\n`;
  });

  // Inline code
  s = s.replace(
    /`([^`\n]+)`/g,
    '<code class="px-1 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-xs font-mono">$1</code>'
  );

  // Headings
  s = s.replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-1.5">$1</h3>');
  s = s.replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-5 mb-2">$1</h2>');

  // Bold + italic
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

  // Severity tags at the start of bullets — [CRITICAL] etc.
  // Match the WHOLE line so we can close the </li> at the end (otherwise
  // the line ends with unclosed <li><span> tags, which breaks styling).
  // The rest of the line is already HTML (strong/em/code from prior passes)
  // so we DO NOT re-escape it.
  s = s.replace(
    /^(\s*[-*]\s*)\[(CRITICAL|HIGH|MEDIUM|LOW|INFO)\]\s+([\s\S]*?)$/gim,
    (_m, _marker: string, sev: string, rest: string) => {
      const s2 = sev.toLowerCase() as Severity;
      return `<li class="ml-5 list-disc marker:text-slate-400 text-sm leading-relaxed mb-1"><span class="inline-block px-1.5 py-0.5 mr-1 rounded text-micro font-mono font-bold ${SEVERITY_COLORS[s2].pill}">${sev}</span> ${rest.trim()}</li>`;
    }
  );

  // Regular bullets — match the whole line and close </li> for consistency.
  // The rest of the line is already HTML.
  s = s.replace(
    /^(\s*[-*]\s+)(?!<li>)([\s\S]*?)$/gm,
    (_m, _marker: string, rest: string) =>
      `<li class="ml-5 list-disc marker:text-slate-400 text-sm leading-relaxed mb-1">${rest.trim()}</li>`
  );

  // Wrap contiguous sequences of <li> in <ul> so we have well-formed HTML.
  s = s.replace(/(<li[^>]*>[\s\S]*?<\/li>(?:\s*<li[^>]*>[\s\S]*?<\/li>)*)/g, '<ul class="my-2 space-y-0.5">$1</ul>');

  // Tables — basic pipe-tables
  s = s.replace(/((?:^\|.*\|\n)+)/gm, (block) => {
    const rows = block.trim().split('\n');
    if (rows.length < 2) return block;
    const header = rows[0]!
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    const body = rows.slice(2).map((r) =>
      r
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim())
    );
    const ths = header
      .map(
        (h) =>
          `<th class="text-left px-2 py-1 font-mono text-micro uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">${h}</th>`
      )
      .join('');
    const trs = body
      .map(
        (cols) =>
          `<tr class="border-b border-slate-100 dark:border-[rgb(var(--border-400))]">${cols
            .map((c) => `<td class="px-2 py-1 text-sm font-mono align-top">${c}</td>`)
            .join('')}</tr>`
      )
      .join('');
    return `<table class="w-full my-3 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded overflow-hidden"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
  });

  // Paragraphs
  s = s
    .split(/\n\n+/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('§§CODEBLOCK')) return trimmed;
      if (trimmed.startsWith('<')) return trimmed;
      return `<p class="text-sm leading-relaxed mb-2">${trimmed}</p>`;
    })
    .join('\n');

  // Restore code blocks
  s = s.replace(/§§CODEBLOCK(\d+)§§/g, (_m, i) => codeBlocks[parseInt(i, 10)] ?? '');

  // Wrap stakeholder-tagged prose blocks. The agent prompt emits blocks like:
  //   ### For CTI
  //   - bullet 1
  //   - bullet 2
  //   ### For SOC & Detection Engineering
  //   - ...
  // The <h3> has already been rendered; we group the heading and the bullets
  // that follow it (up to the next <h2>/<h3>) into a <div data-stakeholder>
  // so the stakeholder filter chip can hide them at runtime.
  const STAKEHOLDER_HEADING_MAP: Array<[RegExp, string]> = [
    [/^For\s+CTI/i, 'cti'],
    [/^For\s+(SOC|Detection)/i, 'soc'],
    [/^For\s+(Incident\s+Response|IR)/i, 'ir'],
    [/^For\s+(Vulnerability\s+Management|VMGT)/i, 'vuln'],
    [/^For\s+(Red\s+Team|Purple\s+Team)/i, 'redteam'],
    [/^For\s+(AppSec|Application\s+Security)/i, 'appsec'],
    [/^For\s+(Security\s+Awareness|Awareness)/i, 'awareness'],
    [/^For\s+(Executive|Exec)/i, 'exec'],
    [/^For\s+(Legal)/i, 'legal'],
    [/^For\s+(TPRM|Third[- ]Party\s+Risk)/i, 'tprm'],
  ];

  // Split the rendered HTML on top-level h2/h3 boundaries.
  // We only care about <h3>For ...</h3> followed by content; everything else
  // passes through unchanged.
  s = s.replace(/(<h3[^>]*>[^<]+<\/h3>)([\s\S]*?)(?=<h[23][^>]*>|\s*$)/g, (_m, h3, body) => {
    // Extract the heading text.
    const text = h3.replace(/<[^>]+>/g, '').trim();
    let role: string | null = null;
    for (const [re, r] of STAKEHOLDER_HEADING_MAP) {
      if (re.test(text)) {
        role = r;
        break;
      }
    }
    if (!role) return `${h3}${body}`;
    return `<div data-stakeholder="${role}" class="dfir-stakeholder-block">${h3}${body}</div>`;
  });

  return s;
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

/** Renders the structured BLUF header parsed from the synthesizer's
 *  \`\`\`report-header block. Feeds the hero card at the top of the report. */
function BlufPanel({ header }: { header: NonNullable<ReportActionCard['reportHeader']> }): JSX.Element {
  const sev = header.severity;
  const sevColor = SEVERITY_COLORS[sev] ?? SEVERITY_COLORS['medium'];
  const postureColor: Record<string, string> = {
    active: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    'post-exploit': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    reconnaissance: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    informational: 'bg-slate-100 text-slate-600 dark:bg-[rgb(var(--surface-300))] dark:text-slate-300',
    unknown: 'bg-slate-100 text-slate-600 dark:bg-[rgb(var(--surface-300))] dark:text-slate-300',
  };
  return (
    <div className={`rounded-lg p-4 ring-1 ${sevColor.ring} ${sevColor.bg} mb-4`}>
      <div className="flex flex-wrap items-start gap-2 mb-2">
        <span className={`px-2 py-0.5 rounded font-mono font-bold text-xs ${sevColor.pill}`}>{sev.toUpperCase()}</span>
        <span
          className={`px-1.5 py-0.5 rounded border text-micro font-mono uppercase tracking-wider ${TLP_COLORS[header.tlp] ?? TLP_COLORS['AMBER']}`}
        >
          TLP:{header.tlp}
        </span>
        <span
          className={`px-1.5 py-0.5 rounded text-micro font-mono font-bold uppercase tracking-wider ${postureColor[header.posture] ?? postureColor['unknown']}`}
        >
          {header.posture}
        </span>
        {header.time_to_act && (
          <span className="px-1.5 py-0.5 rounded text-micro font-mono font-bold bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 inline-flex items-center gap-1">
            <Clock size={9} /> Time to act: {header.time_to_act}
          </span>
        )}
        {(header.actor || header.campaign) && (
          <span className="px-1.5 py-0.5 rounded text-micro font-mono bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
            {header.actor ? `Actor: ${header.actor}` : `Campaign: ${header.campaign}`}
          </span>
        )}
      </div>
      <p className={`text-base font-semibold ${sevColor.text} leading-snug`}>{header.headline}</p>
      <p className={`text-sm mt-2 ${sevColor.text} leading-relaxed`}>
        <span className="font-bold uppercase tracking-wider text-xs mr-1">BLUF:</span>
        {header.bluf}
      </p>
      {header.key_takeaway && (
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 italic">
          <span className="font-bold not-italic uppercase tracking-wider mr-1">Business impact:</span>
          {header.key_takeaway}
        </p>
      )}
      {header.primary_indicator && (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          <span className="text-micro font-mono uppercase tracking-wider text-slate-500">Primary IOC:</span>
          <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-slate-900 dark:text-slate-100 font-mono text-xs">
            {header.primary_indicator.type}: {header.primary_indicator.value}
          </code>
        </div>
      )}
    </div>
  );
}

/** Renders the CVE metadata block (KEV, CVSS, EPSS, exploit status, actors)
 *  when the synthesizer extracted it from the tool data. Sits right after
 *  the BLUF panel so the analyst sees the at-a-glance risk numbers first. */
function CveMetaCard({ card }: { card: ReportActionCard }): JSX.Element | null {
  const hasAny =
    card.kev ||
    card.cvss?.score != null ||
    card.epss?.score != null ||
    (card.threat_actors && card.threat_actors.length > 0) ||
    card.exploit_status ||
    card.ransomware_use ||
    card.patch_url;
  if (!hasAny) return null;

  const cvssSeverityColor = (sev: string | null | undefined): string => {
    switch (sev) {
      case 'CRITICAL':
        return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
      case 'HIGH':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
      case 'MEDIUM':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
      case 'LOW':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
      default:
        return 'bg-slate-100 text-slate-600 dark:bg-[rgb(var(--surface-300))] dark:text-slate-400';
    }
  };

  const exploitStatusColor = (s: string | null | undefined): string => {
    switch (s) {
      case 'in-the-wild':
        return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
      case 'weaponized':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
      case 'poc-public':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
      default:
        return 'bg-slate-100 text-slate-600 dark:bg-[rgb(var(--surface-300))] dark:text-slate-400';
    }
  };

  return (
    <div className="rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50/30 dark:bg-rose-950/20 p-3 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-mini font-mono uppercase tracking-wider text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
          <Bug size={12} /> CVE Intelligence
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {card.cvss?.score != null && (
          <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-2">
            <div className="text-micro font-mono uppercase tracking-wider text-slate-500">CVSS v3.1</div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl font-bold text-slate-900 dark:text-slate-100">{card.cvss.score.toFixed(1)}</span>
              <span
                className={`px-1.5 py-0.5 rounded text-micro font-mono font-bold ${cvssSeverityColor(card.cvss.severity)}`}
              >
                {card.cvss.severity ?? '—'}
              </span>
            </div>
            {card.cvss.vector && (
              <code className="text-micro font-mono text-slate-500 break-all">
                {card.cvss.vector.slice(0, 60)}
                {card.cvss.vector.length > 60 ? '…' : ''}
              </code>
            )}
          </div>
        )}
        {card.epss?.score != null && (
          <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-2">
            <div className="text-micro font-mono uppercase tracking-wider text-slate-500">EPSS</div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              {(card.epss.score * 100).toFixed(1)}%
            </div>
            {card.epss.percentile != null && (
              <div className="text-micro font-mono text-slate-500">
                P{(card.epss.percentile * 100).toFixed(0)} percentile
              </div>
            )}
          </div>
        )}
        <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-2">
          <div className="text-micro font-mono uppercase tracking-wider text-slate-500">CISA KEV</div>
          {card.kev ? (
            <>
              <div className="flex items-center gap-1 mt-0.5">
                <AlertOctagon size={14} className="text-rose-600 dark:text-rose-400" />
                <span className="text-sm font-bold text-rose-700 dark:text-rose-300">Listed</span>
              </div>
              {card.kev_date && <div className="text-micro font-mono text-slate-500">since {card.kev_date}</div>}
            </>
          ) : (
            <div className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Not listed</div>
          )}
        </div>
        <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-2">
          <div className="text-micro font-mono uppercase tracking-wider text-slate-500">Exploit</div>
          {card.exploit_status ? (
            <span
              className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-micro font-mono font-bold uppercase ${exploitStatusColor(card.exploit_status)}`}
            >
              {card.exploit_status.replace(/-/g, ' ')}
            </span>
          ) : (
            <div className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">No public PoC</div>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {card.threat_actors && card.threat_actors.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Users size={11} className="text-slate-500" />
            <span className="text-micro font-mono uppercase tracking-wider text-slate-500">Actors:</span>
            {card.threat_actors.map((a) => (
              <span
                key={a}
                className="px-1.5 py-0.5 rounded text-micro font-mono bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
              >
                {a}
              </span>
            ))}
          </div>
        )}
        {card.ransomware_use && (
          <span
            className={`px-1.5 py-0.5 rounded text-micro font-mono font-bold ${card.ransomware_use === 'Known' ? 'bg-rose-200 text-rose-900 dark:bg-rose-900/60 dark:text-rose-200' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}
          >
            Ransomware: {card.ransomware_use}
          </span>
        )}
        {card.patch_url && (
          <a
            href={card.patch_url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded text-micro font-mono text-brand-600 dark:text-brand-400 hover:underline"
          >
            Vendor advisory <ExternalLink size={9} />
          </a>
        )}
      </div>
    </div>
  );
}

function SeverityBanner({ card }: { card: ReportActionCard }): JSX.Element {
  const c = SEVERITY_COLORS[card.severity];
  const sev = card.severity.toUpperCase();
  return (
    <div className={`rounded-lg p-4 ${c.bg} ring-1 ${c.ring} mb-4`}>
      <div className="flex flex-wrap items-start gap-3">
        <span className={`px-2.5 py-1 rounded font-mono font-bold text-sm ${c.pill}`}>{sev}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${c.text} leading-relaxed`}>{card.verdict.headline}</p>
          {card.verdict.confidence_rationale && (
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{card.verdict.confidence_rationale}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`px-1.5 py-0.5 rounded border text-micro font-mono uppercase tracking-wider ${TLP_COLORS[card.verdict.tlp] ?? TLP_COLORS['AMBER']}`}
          >
            TLP:{card.verdict.tlp}
          </span>
          <span className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-micro font-mono uppercase tracking-wider text-slate-600 dark:text-slate-400">
            {card.verdict.posture}
          </span>
          <span className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-micro font-mono uppercase tracking-wider text-slate-600 dark:text-slate-400">
            {card.verdict.confidence}
          </span>
          {card.kev && (
            <span className="px-1.5 py-0.5 rounded border border-rose-400 bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 text-micro font-mono font-bold uppercase tracking-wider">
              KEV
            </span>
          )}
          {card.ransomware && (
            <span className="px-1.5 py-0.5 rounded border border-amber-400 bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 text-micro font-mono font-bold uppercase tracking-wider">
              RANSOMWARE
            </span>
          )}
          {card.attributed && (
            <span className="px-1.5 py-0.5 rounded border border-indigo-400 bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 text-micro font-mono font-bold uppercase tracking-wider">
              ATTRIBUTED
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function IocTable({ iocs }: { iocs: ReportIoc[] }): JSX.Element | null {
  if (iocs.length === 0) return null;
  const confColor: Record<string, string> = {
    Confirmed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    Probable: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    Possible: 'bg-slate-100 text-slate-600 dark:bg-[rgb(var(--surface-300))] dark:text-slate-400',
  };
  // Type-color map — gives the "Type" column a quick visual signal that
  // matches the indicator's nature (file hash = rose, domain = cyan, etc.).
  const typeColor: Record<string, string> = {
    ipv4: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    ipv6: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    domain: 'bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
    url: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    hash: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    email: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
    cve: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    actor: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    malware: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };
  return (
    <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] mb-4 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 dark:border-[rgb(var(--border-400))] flex items-center gap-2 text-mini font-mono uppercase tracking-wider text-slate-500">
        <Database size={12} /> Indicators ({iocs.length})
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="px-3 py-1.5 font-mono text-micro uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-[rgb(var(--border-400))] w-20">
                Type
              </th>
              <th className="px-3 py-1.5 font-mono text-micro uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                Value
              </th>
              <th className="px-3 py-1.5 font-mono text-micro uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-[rgb(var(--border-400))] w-24">
                Confidence
              </th>
              <th className="px-3 py-1.5 font-mono text-micro uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-[rgb(var(--border-400))] w-32">
                Source
              </th>
              <th className="px-3 py-1.5 w-10 border-b border-slate-200 dark:border-[rgb(var(--border-400))]"></th>
            </tr>
          </thead>
          <tbody>
            {iocs.map((i, idx) => {
              // The IOCs list can contain duplicate (type, value) pairs from
              // multiple sources (e.g. domain pulled in by both VirusTotal
              // and Webamon). Build a unique key by appending a counter only
              // when we have already seen the same value, so React does not
              // log a key-collision warning and the row can be expanded /
              // edited independently.
              const seen = new Set<string>();
              for (let k = 0; k < idx; k++) {
                const prev = iocs[k];
                if (prev) seen.add(`${prev.type}|${prev.value}`);
              }
              const sig = `${i.type}|${i.value}`;
              let n = 1;
              while (seen.has(sig)) n++;
              const key = n > 1 ? `${i.type}-${i.value}-${n}` : `${i.type}-${i.value}`;
              return (
                <tr
                  key={key}
                  className="border-b border-slate-100 dark:border-[rgb(var(--border-400))] hover:bg-slate-50 dark:hover:bg-[rgb(var(--input-200)/0.4)]"
                >
                  <td className="px-3 py-1.5">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-micro font-mono font-bold uppercase ${typeColor[i.type] ?? 'bg-slate-100 text-slate-500 dark:bg-[rgb(var(--surface-300))] dark:text-slate-400'}`}
                    >
                      {i.type}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-sm break-all">{i.value}</td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-micro font-mono font-bold ${confColor[i.confidence] ?? confColor['Possible']}`}
                    >
                      {i.confidence}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-mini text-slate-500">{i.source ?? '—'}</td>
                  <td className="px-3 py-1.5">
                    <CopyButton text={i.value} label="Copy" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 text-mini font-mono text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
    >
      {copied ? <CheckCircle2 size={11} /> : <Copy size={11} />} {copied ? 'Copied' : label}
    </button>
  );
}

function MitreTable({ mitre }: { mitre: ReportMitre[] }): JSX.Element | null {
  if (mitre.length === 0) return null;
  // Group by tactic
  const byTactic = new Map<string, ReportMitre[]>();
  for (const m of mitre) {
    const k = m.tactic ?? 'Other';
    if (!byTactic.has(k)) byTactic.set(k, []);
    byTactic.get(k)!.push(m);
  }
  const detColor: Record<string, string> = {
    yara: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    sigma: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    kql: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    splunk: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    none: 'bg-slate-100 text-slate-500 dark:bg-[rgb(var(--surface-300))] dark:text-slate-400',
  };
  return (
    <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] mb-4 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 dark:border-[rgb(var(--border-400))] flex items-center gap-2 text-mini font-mono uppercase tracking-wider text-slate-500">
        <Target size={12} /> MITRE ATT&CK ({mitre.length} technique{mitre.length === 1 ? '' : 's'})
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="px-3 py-1.5 font-mono text-micro uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                Tactic
              </th>
              <th className="px-3 py-1.5 font-mono text-micro uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-[rgb(var(--border-400))] w-24">
                ID
              </th>
              <th className="px-3 py-1.5 font-mono text-micro uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                Name
              </th>
              <th className="px-3 py-1.5 font-mono text-micro uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-[rgb(var(--border-400))] w-20">
                Detection
              </th>
            </tr>
          </thead>
          <tbody>
            {[...byTactic.entries()].map(([tactic, items]) =>
              items.map((m, idx) => (
                <tr key={`${m.id}-${idx}`} className="border-b border-slate-100 dark:border-[rgb(var(--border-400))]">
                  {idx === 0 && (
                    <td
                      className="px-3 py-1.5 font-mono text-sm text-slate-700 dark:text-slate-300 align-top"
                      rowSpan={items.length}
                    >
                      {tactic}
                    </td>
                  )}
                  <td className="px-3 py-1.5 font-mono text-mini text-slate-500">
                    <a
                      href={`https://attack.mitre.org/techniques/${m.id.replace('.', '/')}/`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
                    >
                      {m.id} <ExternalLink size={9} />
                    </a>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="text-sm">{m.name ?? '—'}</div>
                    {m.evidence && <div className="text-xs text-slate-500 mt-0.5">{m.evidence}</div>}
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-micro font-mono font-bold ${detColor[m.detection ?? 'none'] ?? detColor['none']}`}
                    >
                      {(m.detection ?? 'none').toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DiamondModelCard({ diamond }: { diamond: ReportDiamond | undefined }): JSX.Element | null {
  if (!diamond) return null;
  const filled = [diamond.adversary, diamond.capability?.length, diamond.infrastructure?.length, diamond.victim].filter(
    Boolean
  ).length;
  if (filled < 2) return null;
  return (
    <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] mb-4 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 dark:border-[rgb(var(--border-400))] flex items-center gap-2 text-mini font-mono uppercase tracking-wider text-slate-500">
        <Diamond size={12} /> Diamond Model
      </div>
      <div className="grid grid-cols-2 gap-px bg-slate-200 dark:bg-[rgb(var(--surface-300))]">
        <DiamondQuadrant title="Adversary" value={diamond.adversary} />
        <DiamondQuadrant title="Capability" items={diamond.capability} />
        <DiamondQuadrant title="Infrastructure" items={diamond.infrastructure} />
        <DiamondQuadrant title="Victim" value={diamond.victim} />
      </div>
    </div>
  );
}

function DiamondQuadrant({ title, value, items }: { title: string; value?: string; items?: string[] }): JSX.Element {
  return (
    <div className="bg-white dark:bg-[rgb(var(--surface-200))] p-3">
      <div className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-1">{title}</div>
      {value && <div className="text-sm text-slate-700 dark:text-slate-300">{value}</div>}
      {items && items.length > 0 && (
        <ul className="space-y-0.5">
          {items.map((it, idx) => (
            <li key={idx} className="text-sm font-mono text-slate-700 dark:text-slate-300 break-all">
              • {it}
            </li>
          ))}
        </ul>
      )}
      {!value && (!items || items.length === 0) && <div className="text-xs text-slate-400 italic">unknown</div>}
    </div>
  );
}

function ActionsList({
  actions,
  filterStakeholder,
}: {
  actions: ReportActionItem[];
  filterStakeholder: Stakeholder | null;
}): JSX.Element | null {
  const filtered = filterStakeholder
    ? actions.filter(
        (a) => !a.stakeholders || a.stakeholders.length === 0 || a.stakeholders.includes(filterStakeholder)
      )
    : actions;
  if (filtered.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] mb-4 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 dark:border-[rgb(var(--border-400))] flex items-center gap-2 text-mini font-mono uppercase tracking-wider text-slate-500">
        <Shield size={12} /> Containment &amp; Response ({filtered.length})
      </div>
      <ol className="divide-y divide-slate-100 dark:divide-slate-800/50">
        {filtered.map((a, idx) => {
          const c = SEVERITY_COLORS[a.severity];
          return (
            <li key={idx} className="px-3 py-2.5 flex items-start gap-3">
              <span
                className={`shrink-0 inline-block px-1.5 py-0.5 rounded text-micro font-mono font-bold ${c.pill} w-16 text-center`}
              >
                {a.severity.toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-900 dark:text-slate-100 leading-relaxed">{a.action}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-micro font-mono text-slate-500">
                  {a.target && (
                    <span className="inline-flex items-center gap-0.5">
                      <Target size={9} /> {a.target}
                    </span>
                  )}
                  {a.source && (
                    <span className="inline-flex items-center gap-0.5">
                      <FileText size={9} /> {a.source}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-0.5">
                    <Network size={9} /> {a.category}
                  </span>
                </div>
              </div>
              {(a.stakeholders ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1 shrink-0">
                  {a.stakeholders!.map((s) => (
                    <span
                      key={s}
                      className={`px-1.5 py-0.5 rounded text-micro font-mono font-bold ${STAKEHOLDER_META[s]?.color ?? 'bg-slate-100 text-slate-600'}`}
                    >
                      {STAKEHOLDER_META[s]?.label ?? s}
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function PirList({ pirs }: { pirs: ReportPir[] }): JSX.Element | null {
  if (pirs.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] mb-4 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 dark:border-[rgb(var(--border-400))] flex items-center gap-2 text-mini font-mono uppercase tracking-wider text-slate-500">
        <Flag size={12} /> Priority Intelligence Requirements
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800/50">
        {pirs.map((p, idx) => (
          <li key={idx} className="px-3 py-2.5 flex items-start gap-3">
            <span
              className={`shrink-0 w-2 h-2 rounded-full mt-1.5 ${p.relevant ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-900 dark:text-slate-100">{p.pir}</p>
              {p.bluf && <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{p.bluf}</p>}
              {p.businessOutcome && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1 inline-flex items-center gap-1">
                  <ArrowRight size={10} /> {p.businessOutcome}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TimelineList({ timeline }: { timeline: ReportActionCard['timeline'] }): JSX.Element | null {
  if (!timeline || timeline.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] mb-4 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 dark:border-[rgb(var(--border-400))] flex items-center gap-2 text-mini font-mono uppercase tracking-wider text-slate-500">
        <Activity size={12} /> Timeline
      </div>
      <ol className="relative pl-6 pr-3 py-2">
        <div className="absolute left-3 top-3 bottom-3 w-px bg-slate-200 dark:bg-[rgb(var(--surface-300))]" />
        {timeline.map((t, idx) => (
          <li key={idx} className="relative py-1.5">
            <div className="absolute -left-3 mt-1.5 w-2 h-2 rounded-full bg-brand-500 ring-2 ring-white dark:ring-slate-900" />
            <div className="text-mini font-mono text-slate-500">{t.date ?? '—'}</div>
            <div className="text-sm text-slate-900 dark:text-slate-100">{t.event}</div>
            {t.source && <div className="text-micro font-mono text-slate-400">[{t.source}]</div>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function NextActionsBar({
  report,
  query,
  actionCard,
  onGenerateHuntingQueries,
  onGenerateYaraRule,
  onDrillDeeper,
}: {
  /** Raw report text — used for the Share-as-Markdown export. */
  report?: string;
  query?: string;
  actionCard?: ReportActionCard;
  onGenerateHuntingQueries?: () => Promise<{ tool: string; data: unknown } | null>;
  onGenerateYaraRule?: () => Promise<{ tool: string; data: unknown } | null>;
  /** Optional callback to open the Copilot pre-seeded with a
   *  follow-up question. The DFIR Agent page wires this to navigate to
   *  /threatintel/tools/copilot?q=... */
  onDrillDeeper?: (question: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<{ tool: string; data: unknown } | null>(null);

  const runAction = async (name: string, fn: () => Promise<{ tool: string; data: unknown } | null>) => {
    setLoading(name);
    setResult(null);
    try {
      const r = await fn();
      setResult(r);
    } catch (e) {
      setResult({ tool: name, data: { error: e instanceof Error ? e.message : String(e) } });
    } finally {
      setLoading(null);
    }
  };

  const downloadNavigatorLayer = () => {
    if (!actionCard?.navigatorLayer) return;
    const layer = {
      name: actionCard.navigatorLayer.name,
      description: actionCard.navigatorLayer.description,
      domain: 'enterprise-attack',
      version: '4',
      techniques: actionCard.navigatorLayer.techniques.map((t) => ({
        techniqueID: t.id,
        score: t.score,
        comment: t.comment ?? '',
        color: '',
      })),
      legend: [],
      meta: { generated_at: new Date().toISOString() },
      gradient: { colors: ['#ffe766', '#ff6666', '#990000'], minValue: 0, maxValue: 100 },
    };
    const blob = new Blob([JSON.stringify(layer, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mitre-navigator-${actionCard.navigatorLayer.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasNavigator = (actionCard?.navigatorLayer?.techniques?.length ?? 0) > 0;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-[rgb(var(--input-200)/0.4)]"
      >
        <span className="flex items-center gap-2 text-mini font-mono uppercase tracking-wider text-slate-500">
          <Sparkles size={12} /> Next Actions
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-slate-100 dark:border-[rgb(var(--border-400))]">
          <p className="text-xs text-slate-500 mt-2 mb-2">
            Generate follow-up artifacts from this investigation. Analyst approval required before deploying anything to
            live tooling.
          </p>
          <div className="flex flex-wrap gap-2">
            {onGenerateHuntingQueries && (
              <button
                type="button"
                disabled={!!loading || !query}
                onClick={() => runAction('hunting_queries', onGenerateHuntingQueries)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-mini font-mono hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50"
              >
                {loading === 'hunting_queries' ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Terminal size={11} />
                )}
                Generate Hunt Queries (KQL/Splunk/Sigma)
              </button>
            )}
            {onGenerateYaraRule && (
              <button
                type="button"
                disabled={!!loading || !query}
                onClick={() => runAction('yara_rule', onGenerateYaraRule)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-mini font-mono hover:bg-rose-100 dark:hover:bg-rose-900/40 disabled:opacity-50"
              >
                {loading === 'yara_rule' ? <Loader2 size={11} className="animate-spin" /> : <Code2 size={11} />}
                Generate YARA / Sigma Rule
              </button>
            )}
            {hasNavigator && (
              <button
                type="button"
                onClick={downloadNavigatorLayer}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 text-mini font-mono hover:bg-purple-100 dark:hover:bg-purple-900/40"
              >
                <MapIcon size={11} />
                Export MITRE Navigator Layer
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                actionCard && navigator.clipboard.writeText(JSON.stringify(actionCard, null, 2)).then(() => void 0)
              }
              disabled={!actionCard}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-700 dark:text-slate-300 text-mini font-mono hover:bg-slate-50 dark:hover:bg-[rgb(var(--input-200)/0.4)] disabled:opacity-50"
            >
              <Copy size={11} />
              Copy Action Card JSON
            </button>
            {actionCard && (
              <button
                type="button"
                onClick={async () => {
                  // Build a self-contained Markdown version of the report
                  // for sharing in Slack, email, or a ticketing system.
                  // Falls back to plain text if clipboard write fails.
                  const md = buildShareMarkdown(report ?? '', actionCard, query);
                  try {
                    await navigator.clipboard.writeText(md);
                  } catch {
                    // Fallback: download as a .md file
                    const blob = new Blob([md], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `dfir-report-${actionCard.verdict.headline
                      .replace(/[^a-z0-9]+/gi, '-')
                      .toLowerCase()
                      .slice(0, 60)}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-700 dark:text-slate-300 text-mini font-mono hover:bg-slate-50 dark:hover:bg-[rgb(var(--input-200)/0.4)]"
              >
                <Share2 size={11} />
                Share as Markdown
              </button>
            )}
            {onDrillDeeper && actionCard && (
              <button
                type="button"
                disabled={!query}
                onClick={() => {
                  // Build a follow-up question grounded in the report so the
                  // copilot has the BLUF + IOCs + actor context to answer.
                  const card = actionCard;
                  const iocList = card.iocs
                    .slice(0, 5)
                    .map((i) => `${i.type}:${i.value}`)
                    .join(', ');
                  const followUp = [
                    `Follow-up on: ${query}`,
                    card.verdict.headline ? `\n\nVerdict: ${card.verdict.headline}` : '',
                    iocList ? `\n\nKey IOCs: ${iocList}` : '',
                    '\n\nQuestion: ',
                  ]
                    .filter(Boolean)
                    .join('');
                  const answer = window.prompt('Drill deeper into Copilot — what do you want to know?', followUp);
                  if (answer && answer.trim()) onDrillDeeper(answer.trim());
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 text-mini font-mono hover:bg-brand-100 dark:hover:bg-brand-900/40 disabled:opacity-50"
              >
                <MessageSquare size={11} />
                Drill Deeper (Copilot)
              </button>
            )}
          </div>
          {actionCard?.handoff?.next_stages && actionCard.handoff.next_stages.length > 0 && (
            <div className="mt-3 rounded border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-2.5">
              <div className="flex items-center gap-1.5 text-mini font-mono uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-1.5">
                <AlertTriangle size={11} /> Suggested Next Investigation Stages
                {actionCard.handoff.analyst_approval_required && (
                  <span className="ml-auto px-1.5 py-0.5 rounded text-micro font-mono font-bold bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                    Analyst approval required
                  </span>
                )}
              </div>
              <ol className="text-xs text-amber-900 dark:text-amber-200 space-y-1 list-decimal list-inside">
                {actionCard.handoff.next_stages.map((stage, i) => (
                  <li key={i}>
                    <span className="font-mono">{stage}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {result && (
            <pre className="mt-3 rounded bg-slate-900 dark:bg-[rgb(var(--input-200))] text-slate-100 p-3 text-xs overflow-x-auto font-mono leading-relaxed max-h-72">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────

export function ReportView({
  report,
  actionCard,
  query,
  onGenerateHuntingQueries,
  onGenerateYaraRule,
  onDrillDeeper,
}: ReportViewProps): JSX.Element {
  const [stakeholder, setStakeholder] = useState<Stakeholder | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);
  const proseHtml = useMemo(() => renderMarkdown(report), [report]);
  const bundle = useMemo(() => extractStixBundle(report), [report]);

  // Prefer the structured BLUF header (parsed by the synthesizer from the
  // \`\`\`report-header block) over the legacy regex-based parse. Fall back
  // to regex for older reports that don't emit the structured block.
  const headline = useMemo(() => {
    if (actionCard?.reportHeader?.headline) return actionCard.reportHeader.headline;
    const m = report.match(/##\s*1\.\s*HEADLINE VERDICT\s*\n+\s*([^\n]+)/);
    return m?.[1]?.trim();
  }, [report, actionCard?.reportHeader?.headline]);

  const executiveSummary = useMemo(() => {
    if (actionCard?.reportHeader?.bluf) return actionCard.reportHeader.bluf;
    const m = report.match(/##\s*2\.\s*EXECUTIVE SUMMARY\s*\n+([\s\S]*?)(?=\n## |\n# |$)/);
    return m?.[1]?.trim();
  }, [report, actionCard?.reportHeader?.bluf]);

  // Build stakeholder chip set from the action card.
  const stakeholderChips = useMemo(() => {
    if (!actionCard) return [] as Stakeholder[];
    const set = new Set<Stakeholder>();
    for (const a of actionCard.actions) for (const s of a.stakeholders ?? []) set.add(s);
    return [...set].sort();
  }, [actionCard]);

  if (!actionCard) {
    // Fallback — render the prose only with the STIX bundle inline.
    return (
      <div>
        {headline && (
          <div className="rounded-lg p-3 bg-slate-100 dark:bg-[rgb(var(--surface-300))] mb-3 flex items-start gap-2">
            <Info size={14} className="mt-0.5 text-slate-500" />
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{headline}</p>
          </div>
        )}
        <div
          data-stakeholder-filter={stakeholder ?? ''}
          className="prose prose-sm dark:prose-invert max-w-none font-mono text-sm leading-relaxed whitespace-pre-wrap"
          dangerouslySetInnerHTML={{ __html: proseHtml }}
        />
        {stakeholder && (
          <style>{`[data-stakeholder-filter="${stakeholder}"] .dfir-stakeholder-block:not([data-stakeholder="${stakeholder}"]) { display: none; }`}</style>
        )}
        {bundle && (
          <>
            <StixRelationshipGraph bundle={bundle} />
            <StixObjectTable bundle={bundle} />
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      {actionCard.reportHeader ? <BlufPanel header={actionCard.reportHeader} /> : <SeverityBanner card={actionCard} />}

      {/* CVE intelligence card — only renders when KEV/CVSS/EPSS/actor data is present. */}
      <CveMetaCard card={actionCard} />

      {actionCard.reportHeader?.bluf && (
        <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3 mb-4">
          <div className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-1">Executive Summary</div>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{actionCard.reportHeader.bluf}</p>
          {actionCard.reportHeader.key_takeaway && (
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 italic">
              <span className="font-bold not-italic uppercase tracking-wider mr-1">Business impact:</span>
              {actionCard.reportHeader.key_takeaway}
            </p>
          )}
        </div>
      )}

      {!actionCard.reportHeader && headline && (
        <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3 mb-4">
          <div className="flex items-start gap-2">
            <AlertOctagon size={14} className="mt-0.5 text-slate-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-0.5">Headline</div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{headline}</p>
            </div>
          </div>
          {executiveSummary && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-[rgb(var(--border-400))]">
              <div className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-1">Executive Summary</div>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                {executiveSummary}
              </p>
            </div>
          )}
        </div>
      )}

      {stakeholderChips.length > 0 && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <span className="text-micro font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1">
            <Users size={11} /> View for:
          </span>
          <button
            type="button"
            onClick={() => setStakeholder(null)}
            className={`px-1.5 py-0.5 rounded text-micro font-mono font-bold ${
              stakeholder === null
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 dark:bg-[rgb(var(--surface-300))] dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            ALL
          </button>
          {stakeholderChips.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStakeholder(s)}
              className={`px-1.5 py-0.5 rounded text-micro font-mono font-bold ${
                stakeholder === s ? 'bg-brand-600 text-white' : STAKEHOLDER_META[s]?.color
              }`}
            >
              {STAKEHOLDER_META[s]?.label ?? s}
            </button>
          ))}
        </div>
      )}

      <ActionsList actions={actionCard.actions} filterStakeholder={stakeholder} />
      <IocTable iocs={actionCard.iocs} />
      <MitreTable mitre={actionCard.mitre} />
      <DiamondModelCard diamond={actionCard.diamond} />
      <TimelineList timeline={actionCard.timeline} />
      <PirList pirs={actionCard.pirs ?? []} />

      {/* Technical details — collapsible. Analyst can fold the body and
          just see BLUF + action card + IOCs at a glance. */}
      <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] mb-4">
        <button
          type="button"
          onClick={() => setShowTechnical((v) => !v)}
          className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-[rgb(var(--input-200)/0.4)]"
        >
          <span className="flex items-center gap-2 text-mini font-mono uppercase tracking-wider text-slate-500">
            <FileText size={12} /> Technical Details
          </span>
          {showTechnical ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showTechnical && (
          <div className="px-3 pb-3 border-t border-slate-100 dark:border-[rgb(var(--border-400))]">
            <div
              data-stakeholder-filter={stakeholder ?? ''}
              className="prose prose-sm dark:prose-invert max-w-none font-mono text-sm leading-relaxed pt-2"
              dangerouslySetInnerHTML={{ __html: proseHtml }}
            />
            {stakeholder && (
              <style>{`[data-stakeholder-filter="${stakeholder}"] .dfir-stakeholder-block:not([data-stakeholder="${stakeholder}"]) { display: none; }`}</style>
            )}
            {bundle && (
              <div className="mt-3 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200)/0.4)] p-3">
                <div className="flex items-center gap-2 text-mini font-mono uppercase tracking-wider text-slate-500 mb-2">
                  <Link2 size={12} /> STIX 2.1 Bundle
                </div>
                <StixRelationshipGraph bundle={bundle} />
                <StixObjectTable bundle={bundle} />
              </div>
            )}
          </div>
        )}
      </div>

      <NextActionsBar
        report={report}
        query={query}
        actionCard={actionCard}
        onGenerateHuntingQueries={onGenerateHuntingQueries}
        onGenerateYaraRule={onGenerateYaraRule}
        onDrillDeeper={onDrillDeeper}
      />
    </div>
  );
}
