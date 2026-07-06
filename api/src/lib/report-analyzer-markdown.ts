/**
 * Rich markdown report generator for the Report Analyzer.
 * Converts AnalyzerOutput → TI Mindmap HUB-style markdown report
 * with emoji headers, severity badges, tables, and structured sections.
 */

import type {
  AnalyzerOutput,
  ExtractedIoc,
  ExtractedCve,
  DiamondModel,
  AttackFlowPhase,
  MindmapNode,
  MindmapEdge,
} from './report-analyzer';
import type { TtpHit } from './ttp-extract';

// ── Helpers ──────────────────────────────────────────────────────────

function escCsv(v: string): string {
  return /[|]/.test(v) ? v.replace(/\|/g, '\\|') : v;
}

function severityEmoji(s: string): string {
  const sev = s.toLowerCase();
  if (sev === 'critical') return '🔴';
  if (sev === 'high') return '🟠';
  if (sev === 'medium') return '🟡';
  if (sev === 'low') return '🟢';
  return '⚪';
}

function confidencePill(band: string): string {
  switch (band) {
    case 'high':
      return 'HIGH';
    case 'medium':
      return 'MEDIUM';
    case 'low':
      return 'LOW';
    default:
      return band.toUpperCase();
  }
}

function confidenceEmoji(band: string): string {
  switch (band) {
    case 'high':
      return '✅';
    case 'medium':
      return '➖';
    case 'low':
      return '⚠️';
    default:
      return '❓';
  }
}

function iocKindEmoji(kind: string): string {
  switch (kind) {
    case 'ip':
      return '🌐';
    case 'ipv6':
      return '🌐';
    case 'domain':
      return '📡';
    case 'url':
      return '🔗';
    case 'hash':
      return '🔑';
    case 'email':
      return '📧';
    case 'cve':
      return '🛡️';
    case 'file-path':
      return '📁';
    case 'directory':
      return '📂';
    default:
      return '•';
  }
}

function iocKindLabel(kind: string): string {
  const map: Record<string, string> = {
    ip: 'IPv4',
    ipv6: 'IPv6',
    domain: 'Domain',
    url: 'URL',
    hash: 'Hash',
    email: 'Email',
    cve: 'CVE',
    'file-path': 'File Path',
    directory: 'Directory',
  };
  return map[kind] ?? kind;
}

function cvssSeverityLabel(score?: number): string {
  if (score === undefined) return 'Unknown';
  if (score >= 9.0) return 'CRITICAL';
  if (score >= 7.0) return 'HIGH';
  if (score >= 4.0) return 'MEDIUM';
  return 'LOW';
}

function tlpBadge(tlp?: string): string {
  switch (tlp?.toUpperCase()) {
    case 'RED':
      return '🔴 TLP:RED';
    case 'AMBER':
      return '🟠 TLP:AMBER';
    case 'WHITE':
      return '⚪ TLP:CLEAR';
    default:
      return '⚪ TLP:CLEAR';
  }
}

// ── Table builders ──────────────────────────────────────────────────

function iocsTable(iocs: ExtractedIoc[]): string {
  if (iocs.length === 0) return '_No indicators extracted._\n';
  const rows = iocs.map(
    (i) =>
      `| ${iocKindEmoji(i.kind)} ${iocKindLabel(i.kind)} | \`${escCsv(i.value)}\` | ${confidenceEmoji(i.confidence_band)} ${confidencePill(i.confidence_band)} | ${escCsv(i.evidence.slice(0, 120))} | ${i.source} |`
  );
  return [
    '| Type | Value | Confidence | Evidence | Source |',
    '|------|-------|------------|----------|--------|',
    ...rows,
  ].join('\n');
}

function cvesTable(cves: ExtractedCve[]): string {
  if (cves.length === 0) return '_No CVEs extracted._\n';
  const rows = cves.map((c) => {
    const sev = c.cvss_v3 !== undefined ? cvssSeverityLabel(c.cvss_v3) : 'N/A';
    const epss = c.epss !== undefined ? `${(c.epss * 100).toFixed(2)}%` : 'N/A';
    const kev = c.in_kev === true ? '✅ KEV' : c.in_kev === false ? '—' : 'N/A';
    const products = c.products?.length ? c.products.slice(0, 3).join(', ') : 'N/A';
    return `| \`${c.id}\` | ${severityEmoji(sev)} ${sev} | ${epss} | ${kev} | ${escCsv(products)} | ${escCsv(c.description?.slice(0, 100) ?? c.context.slice(0, 100))} |`;
  });
  return [
    '| CVE ID | Severity | EPSS | KEV | Affected Products | Context |',
    '|--------|----------|------|-----|-------------------|---------|',
    ...rows,
  ].join('\n');
}

function ttpTable(ttp: TtpHit[]): string {
  if (ttp.length === 0) return '_No MITRE ATT&CK techniques mapped._\n';
  const rows = ttp.map(
    (t) =>
      `| \`${t.id}\` | ${escCsv(t.name)} | ${escCsv(t.tactic)} | ${confidenceEmoji(t.confidence)} ${confidencePill(t.confidence)} | ${escCsv(t.evidence.slice(0, 120))} |`
  );
  return [
    '| Technique ID | Name | Tactic | Confidence | Evidence |',
    '|-------------|------|--------|------------|----------|',
    ...rows,
  ].join('\n');
}

function attackFlowTable(attackFlow: AttackFlowPhase[]): string {
  if (attackFlow.length === 0) return '_No attack flow data._\n';
  const sections: string[] = [];
  for (const phase of attackFlow) {
    if (phase.techniques.length === 0) continue;
    const techs = phase.techniques
      .map((t) => `  - \`${t.id}\` ${escCsv(t.name)} — ${escCsv(t.evidence.slice(0, 100))}`)
      .join('\n');
    const phaseEmoji = getTacticEmoji(phase.phase);
    sections.push(`### ${phaseEmoji} ${phase.phase}\n\n${techs}`);
  }
  return sections.join('\n\n');
}

function getTacticEmoji(tactic: string): string {
  const map: Record<string, string> = {
    Reconnaissance: '🔍',
    'Resource Development': '🛠️',
    'Initial Access': '🚪',
    Execution: '⚡',
    Persistence: '🔄',
    'Privilege Escalation': '⬆️',
    'Defense Evasion': '👻',
    'Credential Access': '🔑',
    Discovery: '🔬',
    'Lateral Movement': '➡️',
    Collection: '📦',
    'Command and Control': '📡',
    Exfiltration: '🚀',
    Impact: '💥',
  };
  return map[tactic] ?? '•';
}

function diamondModelTable(diamond: DiamondModel | null): string {
  if (!diamond) return '_Diamond Model not available._\n';
  const adv = diamond.adversary.length > 0 ? diamond.adversary.map((a) => `  - ${a}`).join('\n') : '  - _Unknown_';
  const cap =
    diamond.capability.length > 0
      ? diamond.capability
          .slice(0, 10)
          .map((c) => `  - \`${c.id}\` ${escCsv(c.name)}`)
          .join('\n')
      : '  - _None identified_';
  const infra =
    diamond.infrastructure.length > 0
      ? diamond.infrastructure.map((i) => `  - \`${i}\``).join('\n')
      : '  - _None identified_';
  const vic =
    [
      diamond.victim.sector ? `  - **Sector:** ${escCsv(diamond.victim.sector)}` : '',
      diamond.victim.geography ? `  - **Geography:** ${escCsv(diamond.victim.geography)}` : '',
      diamond.victim.asset ? `  - **Asset:** ${escCsv(diamond.victim.asset)}` : '',
    ]
      .filter(Boolean)
      .join('\n') || '  - _Unknown_';
  return [
    '| Pillar | Details |',
    '|--------|---------|',
    `| 👤 **Adversary** | ${adv.replace(/\n/g, '<br>')} |`,
    `| 🧰 **Capability** | ${cap.replace(/\n/g, '<br>')} |`,
    `| 🖥️ **Infrastructure** | ${infra.replace(/\n/g, '<br>')} |`,
    `| 🎯 **Victim** | ${vic.replace(/\n/g, '<br>')} |`,
  ].join('\n');
}

function detectionSection(detection: AnalyzerOutput['detection']): string {
  if (!detection) return '_Detection opportunities not available._\n';
  const parts: string[] = [];
  if (detection.siemRules.length > 0) {
    parts.push('### 📋 SIEM Detection Rules\n');
    const rows = detection.siemRules.map(
      (r) =>
        `| ${severityEmoji(r.severity)} ${r.severity.toUpperCase()} | ${escCsv(r.title)} | ${r.mitreId ? `\`${r.mitreId}\`` : '—'} | ${r.platform ?? '—'} | ${escCsv(r.description.slice(0, 120))} |`
    );
    parts.push(
      [
        '| Severity | Rule | MITRE ID | Platform | Description |',
        '|----------|------|----------|----------|-------------|',
        ...rows,
      ].join('\n')
    );
  }
  if (detection.cliCommands.length > 0) {
    parts.push('\n### 💻 CLI Verification Commands\n');
    for (const cmd of detection.cliCommands) {
      parts.push(
        `**${escCsv(cmd.purpose)}**${cmd.platform ? ` (${cmd.platform})` : ''}\n\`\`\`bash\n${cmd.command}\n\`\`\`\n`
      );
    }
  }
  if (detection.monitoringGuidance.length > 0) {
    parts.push('\n### 👀 Monitoring Guidance\n');
    for (const g of detection.monitoringGuidance) {
      parts.push(`**${escCsv(g.category)}**\n`);
      for (const item of g.items) {
        parts.push(`  - ${escCsv(item)}`);
      }
      parts.push('');
    }
  }
  if (detection.detectionLimitations.length > 0) {
    parts.push('\n### ⚠️ Detection Limitations\n');
    for (const lim of detection.detectionLimitations) {
      parts.push(`  - ${escCsv(lim)}`);
    }
  }
  return parts.join('\n') || '_No detection opportunities generated._';
}

function conclusionSection(conclusion: AnalyzerOutput['conclusion']): string {
  if (!conclusion) return '_Conclusion not available._\n';
  const parts: string[] = [];
  if (conclusion.keyTakeaways.length > 0) {
    parts.push('### 📌 Key Takeaways\n');
    for (const t of conclusion.keyTakeaways) {
      parts.push(`  - ${escCsv(t)}`);
    }
  }
  if (conclusion.recommendedActions.length > 0) {
    parts.push('\n### ✅ Recommended Actions\n');
    parts.push('| Priority | Action | Rationale |');
    parts.push('|----------|--------|-----------|');
    for (const a of conclusion.recommendedActions) {
      const prioEmoji = a.priority === 'immediate' ? '🔴' : a.priority === 'short-term' ? '🟡' : '🟢';
      parts.push(
        `| ${prioEmoji} **${a.priority.toUpperCase()}** | ${escCsv(a.action)} | ${a.rationale ? escCsv(a.rationale) : '—'} |`
      );
    }
  }
  if (conclusion.riskAssessment) {
    parts.push('\n### ⚖️ Risk Assessment\n');
    parts.push(`> ${escCsv(conclusion.riskAssessment)}`);
  }
  return parts.join('\n');
}

function fivewSection(fivew: AnalyzerOutput['fiveW']): string {
  if (!fivew) return '_5W analysis not available._\n';
  const rows = [
    `| 👤 **Who** | ${escCsv(fivew.who)} |`,
    `| ❓ **What** | ${escCsv(fivew.what)} |`,
    `| 📅 **When** | ${escCsv(fivew.when)} |`,
    `| 📍 **Where** | ${escCsv(fivew.where)} |`,
    `| 🤔 **Why** | ${escCsv(fivew.why)} |`,
  ];
  if (fivew.how) rows.push(`| 🔧 **How** | ${escCsv(fivew.how)} |`);
  if (fivew.so_what) rows.push(`| 💡 **So What?** | ${escCsv(fivew.so_what)} |`);
  if (fivew.what_next) rows.push(`| 🔮 **What Next?** | ${escCsv(fivew.what_next)} |`);
  if (fivew.attribution_basis) rows.push(`| 🏷️ **Attribution Basis** | ${escCsv(fivew.attribution_basis)} |`);
  return ['| Dimension | Analysis |', '|-----------|----------|', ...rows].join('\n');
}

function mindmapSection(nodes: MindmapNode[], _edges: MindmapEdge[]): string {
  if (nodes.length === 0) return '_Mindmap not available._\n';
  const actorNodes = nodes.filter((n) => n.kind === 'actor');
  const malwareNodes = nodes.filter((n) => n.kind === 'malware');
  const ttpNodes = nodes.filter((n) => n.kind === 'ttp');
  const iocNodes = nodes.filter((n) => n.kind === 'ioc');
  const cveNodes = nodes.filter((n) => n.kind === 'cve');
  const parts: string[] = [];
  if (actorNodes.length > 0) {
    parts.push(`**Threat Actors:** ${actorNodes.map((n) => `\`${n.label}\``).join(', ')}`);
  }
  if (malwareNodes.length > 0) {
    parts.push(`**Malware:** ${malwareNodes.map((n) => `\`${n.label}\``).join(', ')}`);
  }
  if (ttpNodes.length > 0) {
    parts.push(`**TTPs (${ttpNodes.length}):** ${ttpNodes.map((n) => `\`${n.label}\``).join(', ')}`);
  }
  if (cveNodes.length > 0) {
    parts.push(`**CVEs (${cveNodes.length}):** ${cveNodes.map((n) => `\`${n.label}\``).join(', ')}`);
  }
  if (iocNodes.length > 0) {
    parts.push(`**IOCs (${iocNodes.length}):** ${iocNodes.map((n) => `\`${n.label}\``).join(', ')}`);
  }
  return parts.join('\n\n');
}

function errorsSection(errors: AnalyzerOutput['errors']): string {
  if (errors.length === 0) return '';
  const rows = errors.map((e) => `| ⚠️ ${escCsv(e.branch)} | ${escCsv(e.message)} |`);
  return ['\n---\n\n### ⚠️ Analysis Warnings\n', '| Branch | Issue |', '|--------|-------|', ...rows].join('\n');
}

// ── Main generator ──────────────────────────────────────────────────

export interface MarkdownReportOptions {
  /** TLP classification. Defaults to CLEAR. */
  tlp?: string;
  /** Optional author attribution. */
  author?: string;
  /** Optional report classification. */
  classification?: string;
  /** Severity override. Auto-detected from CVEs if not set. */
  severity?: string;
  /** Tags to include in frontmatter. */
  tags?: string[];
}

/**
 * Render an AnalyzerOutput into a TI Mindmap HUB-style rich markdown report.
 */
export function renderReportMarkdown(output: AnalyzerOutput, opts: MarkdownReportOptions = {}): string {
  const severity = opts.severity ?? inferSeverity(output);
  const tags = opts.tags ?? inferTags(output);
  const classification = opts.classification ?? 'TLP:WHITE';
  const sourceLabel = output.source ?? 'Report Analyzer';
  const date = output.generatedAt.slice(0, 10);
  const sourceCount = output.source ? 1 : 0;

  const frontmatter = [
    '---',
    `title: "${escCsv(output.title)}"`,
    `date: "${date}"`,
    `severity: "${severity}"`,
    `classification: "${classification}"`,
    `description: "${escCsv(output.summary?.text.slice(0, 200) ?? 'AI-generated threat intelligence report')}"`,
    `tags:`,
    ...tags.map((t) => `  - ${t}`),
    `sources_count: ${sourceCount}`,
    `author: "${opts.author ?? 'Report Analyzer'}"`,
    '---',
  ].join('\n');

  const headerEmoji = severity === 'CRITICAL' ? '🛡️' : severity === 'HIGH' ? '🛡️' : '📋';
  const tlpBadgeStr = tlpBadge(opts.tlp);

  const sections: string[] = [
    frontmatter,
    '',
    `# ${headerEmoji} Threat Intelligence Report: ${output.title}`,
    '',
    `> ${tlpBadgeStr} | **Severity:** ${severityEmoji(severity)} ${severity} | **Generated:** ${date} | **Analysis Time:** ${output.elapsed_ms}ms`,
    '',
    '---',
    '',
    '## 1. Executive Summary',
    '',
    output.summary
      ? `${escCsv(output.summary.text)}\n\n*Model: ${output.summary.model}*`
      : '_AI summary not available._',
    '',
    '---',
    '',
    '## 2. 5W Context',
    '',
    fivewSection(output.fiveW),
    '',
    '---',
    '',
    '## 3. Indicators of Compromise (IOCs)',
    '',
    iocsTable(output.iocs),
    '',
    '---',
    '',
    '## 4. CVE Intelligence',
    '',
    cvesTable(output.cves),
    '',
    '---',
    '',
    '## 5. MITRE ATT&CK Mapping',
    '',
    ttpTable(output.ttp),
    '',
    '---',
    '',
    '## 6. Attack Flow (Kill Chain)',
    '',
    attackFlowTable(output.attackFlow),
    '',
    '---',
    '',
    '## 7. Diamond Model',
    '',
    diamondModelTable(output.diamond),
    '',
    '---',
    '',
    '## 8. Detection Opportunities',
    '',
    detectionSection(output.detection),
    '',
    '---',
    '',
    '## 9. Conclusion & Recommended Actions',
    '',
    conclusionSection(output.conclusion),
    '',
    '---',
    '',
    '## 10. Entity Map (Mindmap)',
    '',
    mindmapSection(output.mindmap.nodes, output.mindmap.edges),
    '',
    errorsSection(output.errors),
    '',
    '---',
    '',
    `*Report generated by **${opts.author ?? 'Report Analyzer'}** — ${sourceLabel}*`,
    `*Analysis date: ${date} | Classification: ${classification}*`,
    '',
  ];

  return sections.join('\n');
}

// ── Helpers ──────────────────────────────────────────────────────────

function inferSeverity(output: AnalyzerOutput): string {
  const cves = output.cves;
  if (cves.some((c) => c.cvss_v3 !== undefined && c.cvss_v3 >= 9.0)) return 'CRITICAL';
  if (cves.some((c) => c.cvss_v3 !== undefined && c.cvss_v3 >= 7.0)) return 'HIGH';
  if (cves.length > 0) return 'MEDIUM';
  if (output.iocs.length > 20) return 'HIGH';
  if (output.ttp.length > 5) return 'MEDIUM';
  return 'INFORMATIONAL';
}

function inferTags(output: AnalyzerOutput): string[] {
  const tags: string[] = [];
  if (output.fiveW?.why) {
    const why = output.fiveW.why.toLowerCase();
    if (why.includes('financial') || why.includes('ransom')) tags.push('financial-motivation');
    if (why.includes('espionage') || why.includes('spy')) tags.push('espionage');
    if (why.includes('hacktivism')) tags.push('hacktivism');
  }
  for (const t of output.ttp) {
    const tactic = t.tactic.toLowerCase();
    if (tactic === 'initial access') {
      tags.push('initial-access');
      break;
    }
  }
  for (const c of output.cves) {
    if (c.in_kev) {
      tags.push('kev');
      break;
    }
  }
  if (output.iocs.some((i) => i.maltiverse?.verdict === 'malicious')) {
    tags.push('confirmed-malicious');
  }
  return tags.slice(0, 8);
}

// ── Severity emoji export (re-usable) ──────────────────────────────
export { severityEmoji, confidenceEmoji, iocKindEmoji };
