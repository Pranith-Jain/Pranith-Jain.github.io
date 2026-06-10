import type { Budget, PlannedSource, SourceDescriptor, SourcePlan, TemplateId } from './types';

/**
 * Per-template source descriptors. `cache` = KV/Cache-API snapshot (≈0 subrequest
 * cost after warm), `rag` = one Vectorize query, `live` = budgeted fetch(es).
 * Authority grades come from the reliability registry in lib/confidence.ts.
 * The gatherer (a later plan) maps each id to an actual fetch.
 */
export const SOURCE_CATALOG: Record<TemplateId, SourceDescriptor[]> = {
  'ransomware-group': [
    { id: 'ransomware-recent', name: 'Ransomware Recent', kind: 'cache', authority: 'B', cost: 0 },
    { id: 'negotiations', name: 'Negotiations', kind: 'cache', authority: 'B', cost: 0 },
    { id: 'actor-timeline', name: 'Actor Timeline', kind: 'cache', authority: 'C', cost: 0 },
    { id: 'writeups', name: 'CTI Writeups', kind: 'cache', authority: 'C', cost: 0 },
    { id: 'rag-corpus', name: 'Intel Corpus (RAG)', kind: 'rag', authority: 'C', cost: 1 },
    { id: 'ransomwarelive-profile', name: 'ransomware.live profile', kind: 'live', authority: 'B', cost: 4 },
    { id: 'malpedia', name: 'Malpedia', kind: 'live', authority: 'A', cost: 2 },
    { id: 'mitre-group', name: 'MITRE ATT&CK group', kind: 'live', authority: 'A', cost: 2 },
    { id: 'kev-cves', name: 'CISA KEV (group CVEs)', kind: 'live', authority: 'A', cost: 2 },
    { id: 'supply-chain-attacks', name: 'Supply Chain Incidents', kind: 'live', authority: 'B', cost: 2 },
  ],
  'threat-actor': [
    { id: 'actor-timeline', name: 'Actor Timeline', kind: 'cache', authority: 'C', cost: 0 },
    { id: 'cybercrime', name: 'Cybercrime', kind: 'cache', authority: 'D', cost: 0 },
    { id: 'writeups', name: 'CTI Writeups', kind: 'cache', authority: 'C', cost: 0 },
    { id: 'rag-corpus', name: 'Intel Corpus (RAG)', kind: 'rag', authority: 'C', cost: 1 },
    { id: 'actor-kb', name: 'Threat Actor KB', kind: 'live', authority: 'B', cost: 1 },
    { id: 'mitre-group', name: 'MITRE ATT&CK group', kind: 'live', authority: 'A', cost: 2 },
    { id: 'malpedia', name: 'Malpedia', kind: 'live', authority: 'A', cost: 2 },
    { id: 'wikipedia', name: 'Wikipedia', kind: 'live', authority: 'D', cost: 2 },
    { id: 'supply-chain-attacks', name: 'Supply Chain Incidents', kind: 'live', authority: 'B', cost: 2 },
  ],
  cve: [
    { id: 'cve-recent', name: 'CVE Recent', kind: 'cache', authority: 'B', cost: 0 },
    { id: 'detections', name: 'Detections', kind: 'cache', authority: 'C', cost: 0 },
    { id: 'rag-corpus', name: 'Intel Corpus (RAG)', kind: 'rag', authority: 'C', cost: 1 },
    { id: 'nvd', name: 'NVD', kind: 'live', authority: 'A', cost: 2 },
    { id: 'epss', name: 'EPSS', kind: 'live', authority: 'A', cost: 1 },
    { id: 'kev', name: 'CISA KEV', kind: 'live', authority: 'A', cost: 1 },
    { id: 'shodan-cvedb', name: 'Shodan CVEDB', kind: 'live', authority: 'B', cost: 2 },
    { id: 'vulncheck-cve', name: 'VulnCheck Exploitation', kind: 'live', authority: 'A', cost: 1 },
  ],
  ioc: [
    { id: 'live-iocs', name: 'Live IOCs', kind: 'cache', authority: 'C', cost: 0 },
    { id: 'ioc-correlation', name: 'IOC Correlation', kind: 'cache', authority: 'C', cost: 0 },
    { id: 'rag-corpus', name: 'Intel Corpus (RAG)', kind: 'rag', authority: 'C', cost: 1 },
    { id: 'virustotal', name: 'VirusTotal', kind: 'live', authority: 'C', cost: 1 },
    { id: 'abuseipdb', name: 'AbuseIPDB', kind: 'live', authority: 'C', cost: 1 },
    { id: 'greynoise', name: 'GreyNoise', kind: 'live', authority: 'B', cost: 1 },
    { id: 'otx', name: 'AlienVault OTX', kind: 'live', authority: 'C', cost: 1 },
    { id: 'urlscan', name: 'URLScan', kind: 'live', authority: 'C', cost: 1 },
    { id: 'malwarebazaar', name: 'MalwareBazaar', kind: 'live', authority: 'A', cost: 1 },
    { id: 'vulncheck', name: 'VulnCheck IP Intel', kind: 'live', authority: 'A', cost: 1 },
  ],
};

/**
 * Greedy first-fit bin packing: cache/rag (cheap) sources fill phase 0 first,
 * then live sources are packed so each phase's summed cost stays within `max`.
 * A single source whose cost exceeds `max` gets its own phase (it cannot be
 * split). Order within the input is preserved.
 */
export function packIntoPhases(descriptors: SourceDescriptor[], max: number): PlannedSource[][] {
  const cheap = descriptors.filter((s) => s.cost === 0);
  const costly = descriptors.filter((s) => s.cost > 0);

  const phases: SourceDescriptor[][] = [];
  let current: SourceDescriptor[] = [...cheap];
  let currentCost = 0;

  for (const src of costly) {
    if (currentCost + src.cost > max && current.length > 0) {
      phases.push(current);
      current = [];
      currentCost = 0;
    }
    current.push(src);
    currentCost += src.cost;
  }
  if (current.length > 0) phases.push(current);
  if (phases.length === 0) phases.push([]);

  return phases.map((phase, i) => phase.map((s) => ({ ...s, phase: i })));
}

/** Build a budgeted execution plan for a template. */
export function planSources(input: { template: TemplateId }, budget: Budget): SourcePlan {
  const descriptors = SOURCE_CATALOG[input.template];
  return { template: input.template, phases: packIntoPhases(descriptors, budget.maxPhaseSubrequests) };
}
