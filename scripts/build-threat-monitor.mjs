#!/usr/bin/env node
/**
 * Build threat-actor-monitor manifest into public/data/threat-monitor/
 *
 * Replication of https://github.com/hero-itsme/Global-Threat-Actor-Monitor
 *  - 40 APT groups + 148 aliases + MITRE Group IDs
 *  - 29 ATT&CK techniques -> Kill Chain map
 *  - 30 OSINT RSS/Atom feeds
 *
 * Our portfolio expands it to 65+ groups, 47+ techniques, 42 feeds, but
 * we ship BOTH the upstream-faithful snapshot and the expanded catalog so
 * consumers can choose fidelity vs coverage.
 *
 * Run: node scripts/build-threat-monitor.mjs
 */
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'data', 'threat-monitor');

console.log('🔨 Building threat-actor-monitor manifest (hero-itsme replication)');

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

// ── Upstream snapshot (faithful 40 groups as shipped in hero-itsme) ─────
// We import from src/data/threat-monitor which already mirrors upstream + expansion.
// To preserve provenance, we tag which groups are upstream vs expanded.
const upstreamGroupNames = new Set([
  'APT28','APT29','Sandworm','Turla','Gamaredon','APT41','APT1','APT10','APT40','Volt Typhoon','Mustang Panda','Lazarus Group','Kimsuky','Andariel','APT33','APT34','APT35','MuddyWater','Agrius','Equation Group','APT-C-36','Machete','DarkHotel','Winnti Group','FIN7','FIN12','Wizard Spider','Scattered Spider','APT39','APT42','Transparent Tribe','SideWinder','Patchwork','Bitter','Molerats','OceanLotus','Lotus Blossom','Earth Lusca','BlackTech','RedCurl',
]);
// Note: hero-itsme had 40 groups; we have 65, so expanded = total - upstream.
const APT_GROUPS = await import(join(ROOT, 'src/data/threat-monitor/apt-groups.ts')).then(m => m.APT_GROUPS);
const TECHNIQUES = await import(join(ROOT, 'src/data/threat-monitor/mitre-attack.ts')).then(m => m.TECHNIQUES);
const OSINT_SOURCES = await import(join(ROOT, 'src/data/threat-monitor/osint-sources.ts')).then(m => m.OSINT_SOURCES);
const KILL_CHAIN_STAGES = await import(join(ROOT, 'src/data/threat-monitor/mitre-attack.ts')).then(m => m.KILL_CHAIN_STAGES);
const TACTIC_TO_KILLCHAIN = await import(join(ROOT, 'src/data/threat-monitor/mitre-attack.ts')).then(m => m.TACTIC_TO_KILLCHAIN);

// Build groups index
const allGroups = Object.entries(APT_GROUPS).map(([name, meta]) => ({
  name,
  mitre_id: meta.mitre_id,
  aliases: meta.aliases,
  aliasCount: meta.aliases.length,
  suspected_origin: meta.suspected_origin,
  target_sectors: meta.target_sectors,
  isUpstream: upstreamGroupNames.has(name),
}));
const upstreamCount = allGroups.filter(g => g.isUpstream).length;
const expandedCount = allGroups.length - upstreamCount;

const techniquesList = Object.values(TECHNIQUES).map(t => ({
  id: t.id,
  name: t.name,
  tactic: t.tactic,
  kill_chain: TACTIC_TO_KILLCHAIN[t.tactic] ?? 'Actions on Objectives',
  keywords: t.keywords,
  keywordCount: t.keywords.length,
}));

// OSINT sources: tag which are upstream 30 vs expanded
const upstreamSourceNames = new Set([
  'The Hacker News','BleepingComputer','Krebs on Security','Dark Reading','SecurityWeek','The Record (Recorded Future News)','Infosecurity Magazine','SC Media','CyberScoop','Graham Cluley',
  'Microsoft Security Blog','Google Threat Intelligence (Mandiant)','Cisco Talos','Palo Alto Unit 42','CrowdStrike Blog','Kaspersky Securelist','ESET WeLiveSecurity','Symantec/Broadcom Threat Hub','Trend Micro Research','Check Point Research','Mandiant Blog','Recorded Future Blog','SentinelOne Labs','Sophos News','Proofpoint Threat Insight','Volexity Blog',
  'CISA Advisories','CISA News','UK NCSC News','CERT-EU',
]);
const sourcesTagged = OSINT_SOURCES.map(s => ({
  ...s,
  isUpstream: upstreamSourceNames.has(s.name) || upstreamSourceNames.has(s.name.replace('Google Threat Intel','Google Threat Intelligence (Mandiant)')),
}));

// Write groups
writeFileSync(join(OUT, 'groups.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: 'https://github.com/hero-itsme/Global-Threat-Actor-Monitor',
  description: 'APT group registry — upstream 40 groups (148 aliases) + expanded to 65 covering eCrime/ransomware/infostealer operators',
  totalGroups: allGroups.length,
  upstreamGroups: upstreamCount,
  expandedGroups: expandedCount,
  aliasCount: allGroups.reduce((s, g) => s + g.aliasCount, 0),
  groups: allGroups,
}, null, 2));

// Write techniques
writeFileSync(join(OUT, 'techniques.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: 'https://github.com/hero-itsme/Global-Threat-Actor-Monitor/blob/main/config/mitre_attack.py',
  description: '29 curated ATT&CK techniques (upstream) expanded to 47 with Kill Chain mapping',
  totalTechniques: techniquesList.length,
  upstreamTechniques: 29,
  expandedTechniques: techniquesList.length - 29,
  killChainStages: KILL_CHAIN_STAGES,
  tacticToKillChain: TACTIC_TO_KILLCHAIN,
  techniques: techniquesList,
}, null, 2));

// Write sources
writeFileSync(join(OUT, 'sources.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: 'https://github.com/hero-itsme/Global-Threat-Actor-Monitor/blob/main/config/osint_sources.py',
  description: '30 upstream OSINT RSS/Atom feeds (polled every 10m) expanded to 42 with gov + vendor research feeds',
  totalSources: sourcesTagged.length,
  upstreamSources: 30,
  expandedSources: sourcesTagged.length - 30,
  categories: [...new Set(sourcesTagged.map(s => s.category))],
  sources: sourcesTagged,
}, null, 2));

// Write index
const index = {
  generatedAt: new Date().toISOString(),
  source: 'https://github.com/hero-itsme/Global-Threat-Actor-Monitor',
  license: 'MIT (upstream)',
  description: 'Global Threat Actor Monitor — 40 APT groups (upstream) mapped to MITRE ATT&CK + Cyber Kill Chain, sourced from 30 OSINT feeds polled every 10 minutes. Portfolio expands to 65 groups / 47 techniques / 42 feeds with local detection engine.',
  upstream: { groups: 40, aliases: 148, techniques: 29, sources: 30, killChainStages: 7 },
  expanded: { groups: allGroups.length, aliases: allGroups.reduce((s,g)=>s+g.aliasCount,0), techniques: techniquesList.length, sources: sourcesTagged.length },
  architecture: {
    entry: 'main.py',
    poller: 'core/osint_poller.py (async concurrent, bounded)',
    mapper: 'core/killchain_mapper.py (alias+keyword scoring)',
    storage: 'core/storage.py (SQLite dedup + history)',
    alerts: 'alerts/telegram_bot.py (Telegram Bot API)',
    our_port: 'ThreatActorMonitor.tsx (browser-native RSS proxy via /api/v1/threat-monitor/proxy + localStorage + Mitre/KillChain scoring)',
  },
  files: ['groups.json','techniques.json','sources.json'],
  stats: {
    totalGroups: allGroups.length,
    totalTechniques: techniquesList.length,
    totalSources: sourcesTagged.length,
    killChainStages: KILL_CHAIN_STAGES.length,
  },
};
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2));

// Per-group bodies for MCP/API (one JSON per group)
mkdirSync(join(OUT, 'groups'), { recursive: true });
for (const g of allGroups) {
  writeFileSync(join(OUT, `groups/${g.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`), JSON.stringify({
    ...g,
    source: 'https://github.com/hero-itsme/Global-Threat-Actor-Monitor/blob/main/config/apt_groups.py',
  }, null, 2));
}

console.log(`\n✅ Threat-monitor manifest built:`);
console.log(`   ${OUT}/index.json (${index.expanded.groups} groups, ${index.expanded.techniques} techniques, ${index.expanded.sources} feeds)`);
console.log(`   ${OUT}/groups.json (${upstreamCount} upstream + ${expandedCount} expanded)`);
console.log(`   ${OUT}/techniques.json (29 upstream → ${techniquesList.length} expanded)`);
console.log(`   ${OUT}/sources.json (30 upstream → ${sourcesTagged.length} expanded)`);
console.log(`   ${OUT}/groups/*.json (${allGroups.length} per-group bodies)`);
