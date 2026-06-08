/**
 * Export Formats Engine
 *
 * Export intelligence data to standard formats:
 * STIX 2.1, MISP, Sigma, YARA, Snort, Suricata, CSV, PDF.
 * All open-source, no paid dependencies.
 */

export interface ExportableIOC {
  value: string;
  type: string;
  confidence: number;
  first_seen: string;
  last_seen: string;
  tags: string[];
  source: string;
}

export interface ExportableThreat {
  name: string;
  description: string;
  severity: string;
  mitre_techniques: string[];
  iocs: ExportableIOC[];
  actors: string[];
}

/** Export IOCs to STIX 2.1 Bundle */
export function exportToStix21(data: ExportableIOC[]): string {
  const now = new Date().toISOString();
  const objects: Record<string, unknown>[] = [
    { type: 'identity', id: 'identity--' + hashStr('export'), name: 'IOC Export', identity_class: 'system', created: now, modified: now },
  ];

  for (const ioc of data) {
    const stixType = mapToStixType(ioc.type);
    const id = `${stixType}--${hashStr(ioc.value)}`;
    objects.push({
      type: stixType, id, created: now, modified: now,
      name: ioc.value, pattern: buildStixPattern(ioc.type, ioc.value),
      valid_from: ioc.first_seen, confidence: ioc.confidence,
      labels: ioc.tags, object_marking_refs: ['marking-definition--613f2e26-407d-48c7-9eca-b8e91df99dc9'],
    });
  }

  return JSON.stringify({ type: 'bundle', id: `bundle--${hashStr(now)}`, objects }, null, 2);
}

/** Export IOCs to MISP event format */
export function exportToMisp(data: ExportableIOC[], eventName: string): string {
  const now = new Date().toISOString();
  const attributes = data.map((ioc) => ({
    type: mapToMispType(ioc.type), value: ioc.value,
    category: 'Network activity', to_ids: true,
    comment: `Confidence: ${ioc.confidence}% | Source: ${ioc.source}`,
    timestamp: Math.floor(new Date(ioc.last_seen).getTime() / 1000),
  }));

  return JSON.stringify({
    Event: {
      info: eventName, date: now.slice(0, 10), timestamp: Math.floor(Date.now() / 1000).toString(),
      distribution: '0', threat_level_id: '2', analysis: '2',
      Attribute: attributes,
    },
  }, null, 2);
}

/** Export detection rule to Sigma format */
export function exportToSigma(name: string, description: string, iocs: ExportableIOC[]): string {
  const ipIOCs = iocs.filter((i) => i.type === 'ip').map((i) => i.value);
  const domainIOCs = iocs.filter((i) => i.type === 'domain').map((i) => i.value);
  const hashIOCs = iocs.filter((i) => i.type.startsWith('hash')).map((i) => i.value);

  let detection = 'detection:\n  selection:\n';
  if (ipIOCs.length > 0) detection += `    DestinationIp:\n      - ${ipIOCs.join('\n      - ')}\n`;
  if (domainIOCs.length > 0) detection += `    QueryName:\n      - ${domainIOCs.join('\n      - ')}\n`;
  if (hashIOCs.length > 0) detection += `    Hashes|contains:\n      - ${hashIOCs.join('\n      - ')}\n`;
  detection += '  condition: selection\n';

  return `title: ${name}\ndescription: ${description}\nstatus: experimental\nauthor: CTI Platform\nreferences:\n  - https://github.com/your-org\nlogsource:\n  category: network\n  product: windows\n${detection}falsepositives:\n  - Unknown\nlevel: high\n`;
}

/** Export IOCs to YARA rule */
export function exportToYara(name: string, description: string, hashIOCs: string[], stringIOCs: string[]): string {
  const cleanName = name.replace(/[^a-zA-Z0-9_]/g, '_');
  let rule = `rule ${cleanName} {\n  meta:\n    description = "${description}"\n    author = "CTI Platform"\n    date = "${new Date().toISOString().slice(0, 10)}"\n  strings:\n`;

  hashIOCs.forEach((h, i) => { rule += `    $hash${i} = "${h}" ascii nocase\n`; });
  stringIOCs.forEach((s, i) => { rule += `    $str${i} = "${s}" ascii\n`; });

  rule += '  condition:\n    any of them\n}\n';
  return rule;
}

/** Export IOCs to Snort rule */
export function exportToSnort(name: string, ipIOCs: string[]): string {
  return ipIOCs.map((ip, i) =>
    `alert ip any any -> ${ip} any (msg:"CTI_${name}_${i}"; sid:${1000000 + i}; rev:1; classtype:trojan-activity; priority:1;)`
  ).join('\n');
}

/** Export IOCs to Suricata rule */
export function exportToSuricata(name: string, ipIOCs: string[]): string {
  return ipIOCs.map((ip, i) =>
    `alert ip any any -> ${ip} any (msg:"CTI ${name} - Malicious IP ${ip}"; flow:established; sid:${2000000 + i}; rev:1; classtype:trojan-activity; priority:1; metadata:severity critical;)`
  ).join('\n');
}

/** Export IOCs to CSV */
export function exportToCSV(data: ExportableIOC[]): string {
  const headers = 'Value,Type,Confidence,First Seen,Last Seen,Tags,Source';
  const rows = data.map((ioc) =>
    `"${ioc.value}","${ioc.type}",${ioc.confidence},"${ioc.first_seen}","${ioc.last_seen}","${ioc.tags.join(';')}","${ioc.source}"`
  );
  return [headers, ...rows].join('\n');
}

/** Export IOCs to pfSense alias format */
export function exportToPfSense(data: ExportableIOC[]): string {
  return data.filter((i) => i.type === 'ip').map((i) => i.value).join('\n');
}

// Helper functions
function mapToStixType(iocType: string): string {
  const map: Record<string, string> = { ip: 'indicator', domain: 'indicator', url: 'indicator', 'hash-md5': 'indicator', 'hash-sha1': 'indicator', 'hash-sha256': 'indicator', email: 'indicator' };
  return map[iocType] ?? 'indicator';
}

function buildStixPattern(type: string, value: string): string {
  switch (type) {
    case 'ip': return `[ipv4-addr:value = '${value}']`;
    case 'domain': return `[domain-name:value = '${value}']`;
    case 'url': return `[url:value = '${value}']`;
    case 'hash-md5': return `[file:hashes.'MD5' = '${value}']`;
    case 'hash-sha1': return `[file:hashes.'SHA-1' = '${value}']`;
    case 'hash-sha256': return `[file:hashes.'SHA-256' = '${value}']`;
    case 'email': return `[email-addr:value = '${value}']`;
    default: return `[artifact:payload_bin = '${value}']`;
  }
}

function mapToMispType(iocType: string): string {
  const map: Record<string, string> = { ip: 'ip-dst', domain: 'domain', url: 'url', 'hash-md5': 'md5', 'hash-sha1': 'sha1', 'hash-sha256': 'sha256', email: 'email-dst' };
  return map[iocType] ?? 'text';
}

function hashStr(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) { hash = ((hash << 5) - hash) + s.charCodeAt(i); hash |= 0; }
  return Math.abs(hash).toString(16).padStart(32, '0');
}
