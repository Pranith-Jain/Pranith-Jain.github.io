import type { ReportActionCard, Severity } from './report-view-types';
import { SEVERITY_COLORS } from './report-view-types';

export function buildShareMarkdown(report: string, actionCard?: ReportActionCard, query?: string): string {
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
      const stakeholders = a.stakeholders?.length ? ` - Stakeholders: ${a.stakeholders.join(', ')}` : '';
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
      lines.push(`| ${ioc.type} | \`${ioc.value}\` | ${ioc.confidence} | ${ioc.source ?? '-'} |`);
    }
    lines.push('');
  }

  // MITRE summary
  if (actionCard && actionCard.mitre.length > 0) {
    lines.push('## MITRE ATT&CK');
    lines.push('');
    for (const m of actionCard.mitre) {
      const tactic = m.tactic ? ` (${m.tactic})` : '';
      const det = m.detection ? ` - detection: ${m.detection}` : '';
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

/**
 * Strip EVERY html tag from untrusted source text (loop until stable so
 * crafted nesting like `<scr<script>ipt>` cannot reassemble a tag), plus
 * script/style blocks with their bodies. The markdown pipeline below emits
 * only its own trusted markup, so a fully de-tagged source makes every
 * downstream insertion safe for the dangerouslySetInnerHTML sink. This
 * markdown renders LLM agent output that quotes untrusted third-party text
 * (leak-site titles, Telegram captions, CVE descriptions).
 */
function stripHtmlTags(input: string): string {
  let out = input.replace(/<script[\s\S]*?<\/script\s*>/gi, '').replace(/<style[\s\S]*?<\/style\s*>/gi, '');
  let prev = out;
  do {
    prev = out;
    out = out.replace(/<[^>]*>/g, '');
  } while (out !== prev);
  return out;
}

export function renderMarkdown(md: string): string {
  if (!md) return '';
  // SECURITY: de-tag the source BEFORE any transform — see stripHtmlTags.
  md = stripHtmlTags(md);
  // Strip the trailing :::handoff + action-card blocks - UI handles those.
  let s = md;
  s = s.replace(/\n*:::handoff\s*\n[\s\S]*?\n:::\s*$/g, '');
  s = s.replace(/\n*```action-card\s*\n[\s\S]*?\n```\s*$/g, '');
  s = s.replace(/```stix\s*\n[\s\S]*?```/g, '');
  s = s.replace(/```json\s*\n\{[\s\S]*?"type"\s*:\s*"bundle"[\s\S]*?\}\s*\n```/g, '');

  // Escape HTML for the safe portions.
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Convert fenced code blocks first - keep them intact through other regexes.
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

  // Severity tags at the start of bullets - [CRITICAL] etc.
  // Match the WHOLE line so we can close the </li> at the end (otherwise
  // the line ends with unclosed <li><span> tags, which breaks styling).
  // The rest of the line is already HTML (strong/em/code from prior passes)
  // so we DO NOT re-escape it.
  s = s.replace(
    /^(\s*[-*]\s*)\[(CRITICAL|HIGH|MEDIUM|LOW|INFO)\]\s+([\s\S]*?)$/gim,
    (_m, _marker: string, sev: string, rest: string) => {
      const s2 = sev.toLowerCase() as Severity;
      return `<li class="ml-5 list-disc marker:text-muted text-sm leading-relaxed mb-1"><span class="inline-block px-1.5 py-0.5 mr-1 rounded text-micro font-mono font-bold ${SEVERITY_COLORS[s2].pill}">${sev}</span> ${rest.trim()}</li>`;
    }
  );

  // Regular bullets - match the whole line and close </li> for consistency.
  // The rest of the line is already HTML.
  s = s.replace(
    /^(\s*[-*]\s+)(?!<li>)([\s\S]*?)$/gm,
    (_m, _marker: string, rest: string) =>
      `<li class="ml-5 list-disc marker:text-muted text-sm leading-relaxed mb-1">${rest.trim()}</li>`
  );

  // Wrap contiguous sequences of <li> in <ul> so we have well-formed HTML.
  s = s.replace(/(<li[^>]*>[\s\S]*?<\/li>(?:\s*<li[^>]*>[\s\S]*?<\/li>)*)/g, '<ul class="my-2 space-y-0.5">$1</ul>');

  // Tables - basic pipe-tables
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
