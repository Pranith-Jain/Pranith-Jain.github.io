/**
 * Briefing → TI Mindmap HUB-style rich markdown renderer.
 * Produces the same structured format as report-analyzer-markdown.ts
 * but sourced from the weekly/daily/landscape briefing pipeline.
 */

import type { Briefing, BriefingFinding, BriefingIocBuckets, BriefingStats } from './briefing-builder/types';

function sevEmoji(s: string): string {
  const m: Record<string, string> = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢', unknown: '⚪' };
  return m[s] ?? '⚪';
}

function esc(v: string): string {
  return v.replace(/\|/g, '\\|');
}

function findingsTable(findings: BriefingFinding[]): string {
  if (findings.length === 0) return '_No findings._\n';
  const rows = findings.map(
    (f) =>
      `| ${sevEmoji(f.severity)} **${f.severity.toUpperCase()}** | ${esc(f.title)} | ${f.mitre_techniques.length > 0 ? f.mitre_techniques.map((t) => `\`${t}\``).join(', ') : '—'} | ${esc(f.description.slice(0, 120))} |`
  );
  return [
    '| Severity | Finding | MITRE Techniques | Description |',
    '|----------|---------|------------------|-------------|',
    ...rows,
  ].join('\n');
}

function iocBucketsTable(buckets: BriefingIocBuckets): string {
  const total = buckets.urls.length + buckets.domains.length + buckets.ipv4s.length + buckets.hashes.length;
  if (total === 0) return '_No IOCs in this briefing._\n';
  const rows: string[] = [];
  if (buckets.urls.length > 0) {
    rows.push(
      `| 🔗 URL | ${buckets.urls.length} | ${buckets.urls
        .slice(0, 5)
        .map((i) => `\`${esc(i.value)}\``)
        .join(', ')}${buckets.urls.length > 5 ? ` +${buckets.urls.length - 5} more` : ''} |`
    );
  }
  if (buckets.domains.length > 0) {
    rows.push(
      `| 📡 Domain | ${buckets.domains.length} | ${buckets.domains
        .slice(0, 5)
        .map((i) => `\`${esc(i.value)}\``)
        .join(', ')}${buckets.domains.length > 5 ? ` +${buckets.domains.length - 5} more` : ''} |`
    );
  }
  if (buckets.ipv4s.length > 0) {
    rows.push(
      `| 🌐 IPv4 | ${buckets.ipv4s.length} | ${buckets.ipv4s
        .slice(0, 5)
        .map((i) => `\`${esc(i.value)}\``)
        .join(', ')}${buckets.ipv4s.length > 5 ? ` +${buckets.ipv4s.length - 5} more` : ''} |`
    );
  }
  if (buckets.hashes.length > 0) {
    rows.push(
      `| 🔑 Hash | ${buckets.hashes.length} | ${buckets.hashes
        .slice(0, 5)
        .map((i) => `\`${esc(i.value)}\``)
        .join(', ')}${buckets.hashes.length > 5 ? ` +${buckets.hashes.length - 5} more` : ''} |`
    );
  }
  return ['| Type | Count | Sample Values |', '|------|-------|---------------|', ...rows].join('\n');
}

function statsPills(stats: BriefingStats): string {
  const pills: string[] = [];
  if (stats.critical > 0) pills.push(`🔴 ${stats.critical} critical`);
  if (stats.high > 0) pills.push(`🟠 ${stats.high} high`);
  if (stats.medium > 0) pills.push(`🟡 ${stats.medium} medium`);
  if (stats.low > 0) pills.push(`🟢 ${stats.low} low`);
  pills.push(`📊 ${stats.findings} findings`);
  pills.push(`📦 ${stats.sections} sections`);
  pills.push(`🛡️ ${stats.cves} CVEs`);
  if (stats.kevs > 0) pills.push(`⚠️ ${stats.kevs} KEVs`);
  pills.push(`🔣 ${stats.iocs} IOCs`);
  if (stats.ransomware_victims > 0) pills.push(`💰 ${stats.ransomware_victims} ransomware victims`);
  return pills.join(' · ');
}

export function renderBriefingMarkdown(briefing: Briefing): string {
  const typeEmoji = briefing.type === 'weekly' ? '📅' : briefing.type === 'daily' ? '📋' : '🌍';
  const sectionParts: string[] = [];

  // Stats summary
  sectionParts.push(`> **${statsPills(briefing.stats)}**\n`);
  sectionParts.push(`> **Sources:** ${briefing.sources.join(', ')}`);
  if (briefing.mitre_techniques.length > 0) {
    sectionParts.push(
      `> **Top MITRE Techniques:** ${briefing.mitre_techniques
        .slice(0, 10)
        .map((t) => `\`${t}\``)
        .join(', ')}`
    );
  }
  if (briefing.degraded) {
    sectionParts.push(`> ⚠️ **Degraded:** Some data sources were unavailable during this briefing.`);
  }

  // Sections
  for (const section of briefing.sections) {
    const sectionEmoji = getSectionEmoji(section.id);
    sectionParts.push('');
    sectionParts.push(`## ${sectionEmoji} ${section.title}`);
    sectionParts.push('');
    sectionParts.push(`> *${esc(section.blurb)}* · **${section.count} findings**`);
    sectionParts.push('');
    sectionParts.push(findingsTable(section.findings));
  }

  // IOCs
  sectionParts.push('');
  sectionParts.push('---');
  sectionParts.push('');
  sectionParts.push('## 🔣 Indicator Snapshot');
  sectionParts.push('');
  sectionParts.push(iocBucketsTable(briefing.iocs));

  // Executive summary at top (rendered last but prepended)
  const header = [
    `# ${typeEmoji} ${briefing.type.charAt(0).toUpperCase() + briefing.type.slice(1)} Briefing: ${briefing.title}`,
    '',
    `> **Date:** ${briefing.date} · **Range:** ${briefing.date_range} · **Generated:** ${briefing.generated_at}`,
    '',
    '---',
    '',
    '## 1. Executive Summary',
    '',
    briefing.executive_summary,
    '',
    '---',
  ].join('\n');

  const body = sectionParts.join('\n');

  return [
    '---',
    `title: "${esc(briefing.title)}"`,
    `date: "${briefing.date}"`,
    `type: "${briefing.type}"`,
    `description: "${esc(briefing.executive_summary.slice(0, 200))}"`,
    `sources_count: ${briefing.sources.length}`,
    `mitre_techniques_count: ${briefing.mitre_techniques.length}`,
    `degraded: ${briefing.degraded ?? false}`,
    '---',
    '',
    header,
    body,
    '',
    '---',
    '',
    `*Briefing generated by **Briefing Pipeline** — ${briefing.date}*`,
    `*Type: ${briefing.type} | Sources: ${briefing.sources.length}*`,
  ].join('\n');
}

function getSectionEmoji(id: string): string {
  const map: Record<string, string> = {
    critical: '🔴',
    ransomware: '💰',
    malware: '🦠',
    vulnerability: '🛡️',
    cve: '🛡️',
    kev: '⚠️',
    exploit: '⚡',
    campaign: '🎯',
    apt: '👤',
    phishing: '🎣',
    'social-engineering': '🎭',
    'data-breach': '📂',
    'supply-chain': '🔗',
    iot: '📶',
    mobile: '📱',
    cloud: '☁️',
    identity: '🆔',
    'threat-actor': '👤',
    tactic: '📋',
    sector: '🏢',
    geography: '🌍',
    trend: '📈',
  };
  return map[id.toLowerCase()] ?? '📌';
}
