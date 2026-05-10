/**
 * Pure-client log-line parser.
 *
 * Auto-detects the most common DFIR log shapes and emits structured
 * records plus best-effort MITRE ATT&CK technique tags. Designed for
 * the "I just got handed a blob of logs and need a starting point"
 * triage step — not a replacement for a real SIEM pipeline.
 *
 * Supported formats (auto-detected per line):
 *   - Windows Event Log XML (incl. Sysmon)
 *   - JSON-Line (one JSON object per line)
 *   - syslog RFC 3164 / 5424
 *   - key=value pairs (CEF-style, AWS/CloudTrail-style key="value")
 *   - "fallback" raw line (no structure detected)
 *
 * MITRE tagging is intentionally conservative — only fires when a
 * confident match exists (e.g. Sysmon EID 1 with command-line containing
 * "powershell -enc", or a Security 4625 logon failure).
 */

export type LogFormat = 'win-event-xml' | 'jsonl' | 'syslog' | 'kv' | 'raw';

export interface ParsedRecord {
  format: LogFormat;
  /** Original raw line (for traceability). */
  raw: string;
  /** Flat key→value extract — keys vary by format. */
  fields: Record<string, string>;
  /** ISO 8601 timestamp if extractable. */
  timestamp?: string;
  /** Event ID (Windows/Sysmon) or facility/severity (syslog). */
  event_id?: string;
  /** Channel name (Windows) or program name (syslog). */
  source?: string;
  /** Best-effort MITRE technique IDs. */
  mitre_techniques: string[];
  /** Severity (info/low/medium/high) — mostly heuristic. */
  severity: 'info' | 'low' | 'medium' | 'high';
  /** Hint shown alongside the line when present. */
  notes: string[];
}

/* ──────────────────────────────────────────────────────────────────
 * MITRE technique map — keyed by source + EID, loose match on a
 * fingerprint substring in the line. Not exhaustive — covers the
 * highest-volume IDs analysts triage daily.
 *
 * Format: { source: 'Sysmon', eid: '1', match: /powershell.*-enc/i, techniques: ['T1059.001','T1027'] }
 * ────────────────────────────────────────────────────────────────── */

interface TechniqueRule {
  source: 'Sysmon' | 'Security' | 'PowerShell' | 'syslog' | 'auditd' | string;
  eid?: string | string[];
  match?: RegExp;
  techniques: string[];
  note?: string;
  severity?: ParsedRecord['severity'];
}

const RULES: TechniqueRule[] = [
  // Sysmon
  {
    source: 'Sysmon',
    eid: '1',
    match: /(?:powershell.*-enc|frombase64string|iex\(|invoke-expression)/i,
    techniques: ['T1059.001', 'T1027'],
    note: 'PowerShell with -EncodedCommand or live IEX — common loader pattern',
    severity: 'high',
  },
  {
    source: 'Sysmon',
    eid: '1',
    match: /(?:rundll32|regsvr32|mshta|wmic|certutil|bitsadmin)/i,
    techniques: ['T1218'],
    note: 'LOLBin signed-binary proxy execution',
    severity: 'medium',
  },
  {
    source: 'Sysmon',
    eid: '1',
    match: /\\?Temp\\.+\.(?:exe|scr|bat|cmd|ps1|vbs|js)/i,
    techniques: ['T1059'],
    note: 'Process spawned from %TEMP% — staging behaviour',
    severity: 'medium',
  },
  { source: 'Sysmon', eid: '3', techniques: ['T1071'], note: 'Network connection', severity: 'low' },
  { source: 'Sysmon', eid: '7', techniques: ['T1055'], note: 'Image / DLL load', severity: 'low' },
  {
    source: 'Sysmon',
    eid: '8',
    techniques: ['T1055.012'],
    note: 'CreateRemoteThread — process injection',
    severity: 'high',
  },
  {
    source: 'Sysmon',
    eid: '10',
    techniques: ['T1003.001'],
    note: 'Process access — possible LSASS dump',
    severity: 'high',
  },
  { source: 'Sysmon', eid: '11', techniques: ['T1105'], note: 'File creation — possible ingress', severity: 'low' },
  { source: 'Sysmon', eid: '12', techniques: ['T1112'], note: 'Registry create / delete', severity: 'low' },
  { source: 'Sysmon', eid: '13', techniques: ['T1112'], note: 'Registry value modified', severity: 'medium' },
  { source: 'Sysmon', eid: '15', techniques: ['T1564.004'], note: 'Alternate Data Stream', severity: 'medium' },
  { source: 'Sysmon', eid: '20', techniques: ['T1546.003'], note: 'WMI event consumer registered', severity: 'high' },
  { source: 'Sysmon', eid: '22', techniques: ['T1071.004'], note: 'DNS query', severity: 'low' },
  {
    source: 'Sysmon',
    eid: '25',
    techniques: ['T1055.012'],
    note: 'Process tampering — image hollowing',
    severity: 'high',
  },

  // Windows Security
  { source: 'Security', eid: '4625', techniques: ['T1110'], note: 'Account logon failure', severity: 'medium' },
  {
    source: 'Security',
    eid: '4624',
    match: /Logon Type:\s*3/i,
    techniques: ['T1078'],
    note: 'Network logon — lateral movement / valid accounts',
    severity: 'medium',
  },
  { source: 'Security', eid: '4672', techniques: ['T1078'], note: 'Special privileges assigned', severity: 'medium' },
  { source: 'Security', eid: '4688', techniques: ['T1059'], note: 'New process created', severity: 'low' },
  { source: 'Security', eid: '4697', techniques: ['T1543.003'], note: 'Service installed', severity: 'high' },
  { source: 'Security', eid: '4698', techniques: ['T1053.005'], note: 'Scheduled task created', severity: 'high' },
  { source: 'Security', eid: '4720', techniques: ['T1136.001'], note: 'Local user account created', severity: 'high' },
  {
    source: 'Security',
    eid: '4732',
    techniques: ['T1098'],
    note: 'Account added to security-enabled group',
    severity: 'high',
  },
  { source: 'Security', eid: '5140', techniques: ['T1021.002'], note: 'SMB share accessed', severity: 'medium' },
  { source: 'Security', eid: '7045', techniques: ['T1543.003'], note: 'Service installed (System)', severity: 'high' },

  // PowerShell channel
  {
    source: 'PowerShell',
    eid: '4104',
    match: /(?:DownloadString|IEX|Invoke-Mimikatz|Set-MpPreference|amsi)/i,
    techniques: ['T1059.001', 'T1562.001'],
    note: 'Suspicious PowerShell script-block content',
    severity: 'high',
  },
  { source: 'PowerShell', eid: '4104', techniques: ['T1059.001'], note: 'Script-block logging entry', severity: 'low' },

  // syslog / auditd
  {
    source: 'auditd',
    match: /comm="(?:nc|netcat|nmap|hydra|john|hashcat)"/,
    techniques: ['T1046'],
    note: 'auditd recorded a known offensive tool',
    severity: 'high',
  },
];

/* ──────────────────────────────────────────────────────────────────
 * Format detection + parsers
 * ────────────────────────────────────────────────────────────────── */

const RE_WINEVENT = /<Event\b[^>]*xmlns/i;
const RE_JSONL = /^\s*\{.*\}\s*$/;
const RE_SYSLOG_5424 = /^<\d+>1\s/;
const RE_SYSLOG_3164 = /^<\d+>[A-Z][a-z]{2}\s+\d{1,2}\s\d{2}:\d{2}:\d{2}\s/;
const RE_KV = /\b[A-Za-z_][\w.-]*=(?:"[^"]*"|'[^']*'|\S+)/;

function detect(line: string): LogFormat {
  if (RE_WINEVENT.test(line)) return 'win-event-xml';
  if (RE_JSONL.test(line)) return 'jsonl';
  if (RE_SYSLOG_5424.test(line) || RE_SYSLOG_3164.test(line)) return 'syslog';
  if (RE_KV.test(line) && line.split(/\s+/).filter((t) => /=/.test(t)).length >= 2) return 'kv';
  return 'raw';
}

function parseWinEvent(line: string): Pick<ParsedRecord, 'fields' | 'timestamp' | 'event_id' | 'source'> {
  const fields: Record<string, string> = {};
  // EventID
  const eid = line.match(/<EventID(?:\s[^>]*)?>(\d+)/i);
  if (eid?.[1]) fields.EventID = eid[1];
  // Channel
  const channel = line.match(/<Channel>([^<]+)<\/Channel>/i);
  if (channel?.[1]) fields.Channel = channel[1];
  // Provider (covers Sysmon, Security, etc.)
  const provider = line.match(/<Provider\s+Name="([^"]+)"/i);
  if (provider?.[1]) fields.Provider = provider[1];
  // TimeCreated
  const ts = line.match(/<TimeCreated\s+SystemTime="([^"]+)"/i);
  if (ts?.[1]) fields.TimeCreated = ts[1];
  // EventData / Data Name="X">value</Data>
  const dataIter = line.matchAll(/<Data\s+Name="([^"]+)">([^<]*)<\/Data>/gi);
  for (const m of dataIter) {
    if (m[1]) fields[m[1]] = m[2] ?? '';
  }
  return {
    fields,
    timestamp: fields.TimeCreated,
    event_id: fields.EventID,
    source: fields.Provider ?? fields.Channel,
  };
}

function parseJsonl(line: string): Pick<ParsedRecord, 'fields' | 'timestamp' | 'event_id' | 'source'> {
  try {
    const j = JSON.parse(line) as Record<string, unknown>;
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(j)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        fields[k] = String(v);
      } else {
        fields[k] = JSON.stringify(v);
      }
    }
    const ts = fields['@timestamp'] ?? fields.timestamp ?? fields.time ?? fields.eventTime;
    const eid = fields.EventID ?? fields.event_id ?? fields.eventID;
    const src = fields.provider ?? fields.source ?? fields.eventSource ?? fields.channel;
    return { fields, timestamp: ts, event_id: eid, source: src };
  } catch {
    return { fields: { _parse_error: 'invalid JSON' } };
  }
}

function parseSyslog(line: string): Pick<ParsedRecord, 'fields' | 'timestamp' | 'source'> {
  const fields: Record<string, string> = {};
  // RFC 5424: <PRI>1 TIMESTAMP HOSTNAME APP PROCID MSGID STRUCTURED MSG
  const m5424 = line.match(/^<(\d+)>1\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/);
  if (m5424) {
    fields.PRI = m5424[1] ?? '';
    fields.timestamp = m5424[2] ?? '';
    fields.host = m5424[3] ?? '';
    fields.app = m5424[4] ?? '';
    fields.procid = m5424[5] ?? '';
    fields.msgid = m5424[6] ?? '';
    fields.message = m5424[7] ?? '';
    return { fields, timestamp: fields.timestamp, source: fields.app };
  }
  // RFC 3164: <PRI>MMM dd HH:mm:ss HOSTNAME APP[PID]: MSG
  const m3164 = line.match(
    /^<(\d+)>([A-Z][a-z]{2}\s+\d{1,2}\s\d{2}:\d{2}:\d{2})\s+(\S+)\s+([^[\s]+)(?:\[(\d+)\])?:?\s*(.*)$/
  );
  if (m3164) {
    fields.PRI = m3164[1] ?? '';
    fields.timestamp_raw = m3164[2] ?? '';
    fields.host = m3164[3] ?? '';
    fields.app = m3164[4] ?? '';
    if (m3164[5]) fields.pid = m3164[5];
    fields.message = m3164[6] ?? '';
    return { fields, source: fields.app };
  }
  return { fields: { raw: line } };
}

function parseKv(line: string): Pick<ParsedRecord, 'fields' | 'timestamp' | 'source' | 'event_id'> {
  const fields: Record<string, string> = {};
  const re = /\b([A-Za-z_][\w.-]*)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (!m[1]) continue;
    fields[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  const ts = fields.time ?? fields.timestamp ?? fields.ts ?? fields.eventTime;
  const eid = fields.EventID ?? fields.event_id;
  const src = fields.source ?? fields.provider ?? fields.app;
  return { fields, timestamp: ts, source: src, event_id: eid };
}

/* ──────────────────────────────────────────────────────────────────
 * MITRE tagging
 * ────────────────────────────────────────────────────────────────── */

function tagMitre(rec: ParsedRecord): void {
  const techniques = new Set<string>();
  let severity = rec.severity;
  for (const rule of RULES) {
    const sourceMatch =
      !rule.source ||
      rec.source?.includes(rule.source) ||
      (rec.fields.Channel ?? '').includes(rule.source) ||
      (rec.fields.Provider ?? '').includes(rule.source);
    if (!sourceMatch) continue;

    if (rule.eid) {
      const wanted = Array.isArray(rule.eid) ? rule.eid : [rule.eid];
      if (!rec.event_id || !wanted.includes(rec.event_id)) continue;
    }

    if (rule.match && !rule.match.test(rec.raw)) continue;

    for (const t of rule.techniques) techniques.add(t);
    if (rule.note) rec.notes.push(rule.note);
    if (rule.severity && severityRank(rule.severity) > severityRank(severity)) {
      severity = rule.severity;
    }
  }
  rec.mitre_techniques = [...techniques].sort();
  rec.severity = severity;
}

function severityRank(s: ParsedRecord['severity']): number {
  return { info: 0, low: 1, medium: 2, high: 3 }[s];
}

/* ──────────────────────────────────────────────────────────────────
 * Public API
 * ────────────────────────────────────────────────────────────────── */

export function parseLogs(input: string): ParsedRecord[] {
  // Multi-line XML support: collapse anything that opens with `<Event` and
  // doesn't close on the same line — Windows Event XML is often pretty-printed.
  const blob = input.replace(/\r\n/g, '\n').replace(/(<Event\b[\s\S]*?<\/Event>)/g, (m) => m.replace(/\n/g, ' '));

  const lines = blob.split('\n').filter((l) => l.trim().length > 0);
  const out: ParsedRecord[] = [];
  for (const line of lines) {
    const format = detect(line);
    const base: ParsedRecord = {
      format,
      raw: line,
      fields: {},
      mitre_techniques: [],
      severity: 'info',
      notes: [],
    };
    let parsed: Partial<ParsedRecord> = {};
    if (format === 'win-event-xml') parsed = parseWinEvent(line);
    else if (format === 'jsonl') parsed = parseJsonl(line);
    else if (format === 'syslog') parsed = parseSyslog(line);
    else if (format === 'kv') parsed = parseKv(line);
    Object.assign(base, parsed);
    tagMitre(base);
    out.push(base);
  }
  return out;
}

/* ──────────────────────────────────────────────────────────────────
 * Hunting query generators
 *
 * Produce platform-specific queries for the MITRE technique IDs and
 * notable field values found in the parsed records. Best effort —
 * meant as a starting point analysts can copy into their SIEM and
 * refine, not turnkey rules.
 * ────────────────────────────────────────────────────────────────── */

export interface HuntingQuery {
  platform: 'splunk' | 'elastic-kql' | 'sentinel-kql';
  label: string;
  query: string;
}

export function generateQueries(records: ParsedRecord[]): HuntingQuery[] {
  const out: HuntingQuery[] = [];
  // Distinct tag set
  const techniques = [...new Set(records.flatMap((r) => r.mitre_techniques))].sort();
  // Distinct EIDs
  const eids = [...new Set(records.map((r) => r.event_id).filter(Boolean))] as string[];
  // Distinct cmdlines (Sysmon EID 1)
  const cmds = [...new Set(records.map((r) => r.fields.CommandLine).filter((v): v is string => Boolean(v)))].slice(
    0,
    5
  );

  if (techniques.length > 0) {
    out.push({
      platform: 'splunk',
      label: `Splunk SPL — events tagged with ${techniques.length} technique(s)`,
      query: `index=* (${techniques.map((t) => `tag::eventtype=${t}`).join(' OR ')}) | stats count by host, EventID, technique`,
    });
    out.push({
      platform: 'elastic-kql',
      label: `Elastic KQL — events tagged with these techniques`,
      query: `event.module: * and threat.technique.id: (${techniques.map((t) => `"${t}"`).join(' or ')})`,
    });
    out.push({
      platform: 'sentinel-kql',
      label: `Microsoft Sentinel KQL — events tagged with these techniques`,
      query: `union withsource=Table SecurityEvent, Sysmon\n| where Technique in (${techniques.map((t) => `"${t}"`).join(', ')})\n| summarize count() by Computer, EventID, Technique`,
    });
  }

  if (eids.length > 0) {
    out.push({
      platform: 'splunk',
      label: `Splunk SPL — recurrence of EIDs in this batch`,
      query: `index=wineventlog (EventCode IN (${eids.join(',')})) earliest=-7d | timechart count by EventCode`,
    });
    out.push({
      platform: 'sentinel-kql',
      label: `Sentinel KQL — recurrence of EIDs over 7 days`,
      query: `SecurityEvent\n| where EventID in (${eids.join(', ')})\n| where TimeGenerated > ago(7d)\n| summarize Count = count() by bin(TimeGenerated, 1h), EventID, Computer`,
    });
  }

  if (cmds.length > 0) {
    out.push({
      platform: 'elastic-kql',
      label: `Elastic KQL — process.command_line matches from this batch`,
      query: `process.command_line: (${cmds.map((c) => `"${c.replace(/"/g, '\\"').slice(0, 200)}"`).join(' or ')})`,
    });
  }

  return out;
}

export function summariseBatch(records: ParsedRecord[]): {
  total: number;
  by_format: Record<LogFormat, number>;
  by_severity: Record<ParsedRecord['severity'], number>;
  unique_techniques: string[];
  unique_event_ids: string[];
  unique_sources: string[];
} {
  const by_format = { 'win-event-xml': 0, jsonl: 0, syslog: 0, kv: 0, raw: 0 } as Record<LogFormat, number>;
  const by_severity = { info: 0, low: 0, medium: 0, high: 0 } as Record<ParsedRecord['severity'], number>;
  const techs = new Set<string>();
  const eids = new Set<string>();
  const sources = new Set<string>();
  for (const r of records) {
    by_format[r.format]++;
    by_severity[r.severity]++;
    for (const t of r.mitre_techniques) techs.add(t);
    if (r.event_id) eids.add(r.event_id);
    if (r.source) sources.add(r.source);
  }
  return {
    total: records.length,
    by_format,
    by_severity,
    unique_techniques: [...techs].sort(),
    unique_event_ids: [...eids].sort(),
    unique_sources: [...sources].sort(),
  };
}
