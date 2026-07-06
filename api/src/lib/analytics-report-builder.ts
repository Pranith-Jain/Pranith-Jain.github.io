/**
 * Analytics Report Builder — cross-source correlation engine.
 * Takes multiple AnalyzerOutputs and produces a TI Mindmap HUB-style
 * analytics report with merged IOCs, deduplicated TTPs, correlated CVEs,
 * and synthesized executive summary.
 */

import type { AnalyzerOutput, ExtractedIoc, ExtractedCve } from './report-analyzer';
import type { TtpHit } from './ttp-extract';
import { severityEmoji } from './report-analyzer-markdown';

export interface CorrelatedSource {
  title: string;
  url?: string;
  date: string;
  iocCount: number;
  ttpCount: number;
  cveCount: number;
}

export interface AnalyticsReportInput {
  title: string;
  sources: CorrelatedSource[];
  analyses: AnalyzerOutput[];
  date?: string;
  severity?: string;
  classification?: string;
  tags?: string[];
}

function mergeIocs(analyses: AnalyzerOutput[]): ExtractedIoc[] {
  const seen = new Set<string>();
  const out: ExtractedIoc[] = [];
  for (const a of analyses) {
    for (const ioc of a.iocs) {
      const key = `${ioc.kind}:${ioc.value.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ioc);
    }
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

function mergeTtps(analyses: AnalyzerOutput[]): TtpHit[] {
  const seen = new Set<string>();
  const out: TtpHit[] = [];
  for (const a of analyses) {
    for (const t of a.ttp) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

function mergeCves(analyses: AnalyzerOutput[]): ExtractedCve[] {
  const seen = new Set<string>();
  const out: ExtractedCve[] = [];
  for (const a of analyses) {
    for (const c of a.cves) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

function buildTopTtps(ttp: TtpHit[]): Array<{ id: string; name: string; tactic: string; count: number }> {
  const counts = new Map<string, { id: string; name: string; tactic: string; count: number }>();
  for (const t of ttp) {
    const existing = counts.get(t.id);
    if (existing) {
      existing.count++;
    } else {
      counts.set(t.id, { id: t.id, name: t.name, tactic: t.tactic, count: 1 });
    }
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}

function buildTopCves(cves: ExtractedCve[]): ExtractedCve[] {
  return cves.sort((a, b) => (b.cvss_v3 ?? 0) - (a.cvss_v3 ?? 0));
}

function countBySource<T>(items: T[], keyFn: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function buildAnalyticsReport(input: AnalyticsReportInput): string {
  const { title, sources, analyses } = input;
  const allIocs = mergeIocs(analyses);
  const allTtps = mergeTtps(analyses);
  const allCves = mergeCves(analyses);
  const topTtps = buildTopTtps(allTtps);
  const topCves = buildTopCves(allCves);

  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const severity = input.severity ?? inferAnalyticsSeverity(allCves, allIocs, allTtps);
  const tags = input.tags ?? inferAnalyticsTags(allTtps, allCves, analyses);

  // Source count
  const dedupedSources = new Set(sources.map((s) => s.title));
  const sourceCount = dedupedSources.size;

  // Content sections
  const sections: string[] = [];

  // Source table
  sections.push('## 1. Source Reports\n');
  sections.push('| # | Title | Date | IOCs | TTPs | CVEs |');
  sections.push('|---|-------|------|------|------|------|');
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i]!;
    sections.push(`| ${i + 1} | ${s.title} | ${s.date} | ${s.iocCount} | ${s.ttpCount} | ${s.cveCount} |`);
  }

  // Stats overview
  const iocTypes = countBySource(allIocs, (i) => i.kind);
  const ttpTactics = countBySource(allTtps, (t) => t.tactic);
  sections.push('');
  sections.push('## 2. Cross-Source Correlation Summary\n');
  sections.push(`| Metric | Value |`);
  sections.push(`|--------|-------|`);
  sections.push(`| Correlated Sources | ${sources.length} |`);
  sections.push(`| Total Unique IOCs | ${allIocs.length} |`);
  sections.push(`| Total Unique TTPs | ${allTtps.length} |`);
  sections.push(`| Total Unique CVEs | ${allCves.length} |`);
  sections.push(
    `| IOC Breakdown | ${Array.from(iocTypes.entries())
      .map(([k, v]) => `${esc(k)}: ${v}`)
      .join(', ')} |`
  );
  sections.push(`| TTP Tactic Coverage | ${ttpTactics.size} tactics |`);

  // Top TTPs
  sections.push('');
  sections.push('## 3. Top MITRE ATT&CK Techniques\n');
  if (topTtps.length > 0) {
    sections.push('| Technique | Name | Tactic | Sources |');
    sections.push('|-----------|------|--------|---------|');
    for (const t of topTtps.slice(0, 15)) {
      sections.push(`| \`${t.id}\` | ${t.name} | ${t.tactic} | ${t.count} |`);
    }
  } else {
    sections.push('_No common techniques found across sources._');
  }

  // Top CVEs
  sections.push('');
  sections.push('## 4. Priority CVEs (Top by CVSS)\n');
  if (topCves.length > 0) {
    sections.push('| CVE | CVSS | Severity | EPSS | KEV | Products |');
    sections.push('|-----|------|----------|------|-----|----------|');
    for (const c of topCves.slice(0, 10)) {
      const sev = c.cvss_severity ?? (c.cvss_v3 && c.cvss_v3 >= 7.0 ? 'HIGH' : 'UNKNOWN');
      sections.push(
        `| \`${c.id}\` | ${c.cvss_v3 ?? 'N/A'} | ${sev} | ${c.epss ? (c.epss * 100).toFixed(2) + '%' : 'N/A'} | ${c.in_kev ? '✅' : '—'} | ${c.products?.slice(0, 2).join(', ') ?? 'N/A'} |`
      );
    }
  } else {
    sections.push('_No CVEs identified across sources._');
  }

  // Merged IOCs
  sections.push('');
  sections.push('## 5. Consolidated IOCs (Deduplicated)\n');
  if (allIocs.length > 0) {
    sections.push('| Type | Value | Confidence | Source Count |');
    sections.push('|------|-------|------------|--------------|');
    for (const i of allIocs.slice(0, 30)) {
      const sourceCount = analyses.filter((a) =>
        a.iocs.some((ai) => ai.kind === i.kind && ai.value.toLowerCase() === i.value.toLowerCase())
      ).length;
      sections.push(
        `| ${iocKindEmoji(i.kind)} ${iocKindLabel(i.kind)} | \`${esc(String(i.value))}\` | ${confidenceEmoji(i.confidence_band)} ${i.confidence_band} | ${sourceCount}/${analyses.length} |`
      );
    }
    if (allIocs.length > 30) {
      sections.push(`| ... | _${allIocs.length - 30} more IOCs_ | ... | ... |`);
    }
  } else {
    sections.push('_No IOCs identified across sources._');
  }

  const md = sections.join('\n');

  // Wrap in the standard report format
  const frontmatter = [
    '---',
    `title: "${esc(title)}"`,
    `date: "${date}"`,
    `severity: "${severity}"`,
    `classification: "${input.classification ?? 'TLP:WHITE'}"`,
    `description: "Cross-source correlation analysis of ${sources.length} intelligence reports"`,
    'tags:',
    ...tags.map((t) => `  - ${t}`),
    `sources_count: ${sourceCount}`,
    `author: "Analytics Report Pipeline"`,
    '---',
  ].join('\n');

  const headerEmoji = severity === 'CRITICAL' ? '🛡️' : severity === 'HIGH' ? '🛡️' : '📊';

  return [
    frontmatter,
    '',
    `# ${headerEmoji} Analytics Report: ${title}`,
    '',
    `> **Severity:** ${severityEmoji(severity)} ${severity} | **Date:** ${date} | **Sources:** ${sources.length} | **IOCs:** ${allIocs.length} | **TTPs:** ${allTtps.length} | **CVEs:** ${allCves.length}`,
    '',
    '---',
    '',
    md,
    '',
    '---',
    '',
    `*Report generated by **Analytics Report Pipeline** — Cross-Source Correlation Engine*`,
    `*Analysis date: ${date} | Sources correlated: ${sources.length}*`,
  ].join('\n');
}

function inferAnalyticsSeverity(cves: ExtractedCve[], iocs: ExtractedIoc[], ttps: TtpHit[]): string {
  if (cves.some((c) => c.cvss_v3 !== undefined && c.cvss_v3 >= 9.0)) return 'CRITICAL';
  if (cves.some((c) => c.in_kev)) return 'CRITICAL';
  if (cves.some((c) => c.cvss_v3 !== undefined && c.cvss_v3 >= 7.0)) return 'HIGH';
  if (iocs.length > 50) return 'HIGH';
  if (ttps.length > 10) return 'MEDIUM';
  return 'INFORMATIONAL';
}

function inferAnalyticsTags(ttps: TtpHit[], cves: ExtractedCve[], analyses: AnalyzerOutput[]): string[] {
  const tags: string[] = ['cross-source-correlation'];
  const tactics = new Set(ttps.map((t) => t.tactic.toLowerCase()));
  if (tactics.has('initial access')) tags.push('initial-access');
  if (tactics.has('execution')) tags.push('execution');
  if (tactics.has('persistence')) tags.push('persistence');
  if (tactics.has('defense evasion')) tags.push('defense-evasion');
  if (tactics.has('credential access')) tags.push('credential-access');
  if (tactics.has('lateral movement')) tags.push('lateral-movement');
  if (tactics.has('exfiltration')) tags.push('exfiltration');
  if (cves.some((c) => c.in_kev)) tags.push('kev');
  if (analyses.some((a) => a.iocs.some((i) => i.maltiverse?.verdict === 'malicious'))) {
    tags.push('confirmed-malicious');
  }
  const sectors = new Set(analyses.map((a) => a.diamond?.victim.sector).filter(Boolean));
  if (sectors.size > 0) tags.push(`sector:${Array.from(sectors).join(',')}`);
  return tags.slice(0, 8);
}

// Re-export helpers referenced above
function iocKindEmoji(kind: string): string {
  const m: Record<string, string> = {
    ip: '🌐',
    ipv6: '🌐',
    domain: '📡',
    url: '🔗',
    hash: '🔑',
    email: '📧',
    cve: '🛡️',
    'file-path': '📁',
    directory: '📂',
  };
  return m[kind] ?? '•';
}
function iocKindLabel(kind: string): string {
  const m: Record<string, string> = {
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
  return m[kind] ?? kind;
}
function confidenceEmoji(band: string): string {
  const m: Record<string, string> = { high: '✅', medium: '➖', low: '⚠️' };
  return m[band] ?? '❓';
}
function esc(v: string): string {
  return v.replace(/\|/g, '\\|');
}
