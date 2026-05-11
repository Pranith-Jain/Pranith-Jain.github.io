/**
 * Curated MITRE ATT&CK technique mapping per ransomware group.
 *
 * Each entry is the set of techniques that group's MITRE profile documents as
 * being in their core kill chain. We deliberately keep ~6 per group — the
 * "load-bearing" ones an SOC would tune detections for — not every technique
 * MITRE has ever observed. Tactics use ATT&CK tactic IDs (TA####) and short
 * names for readability.
 *
 * Source: https://attack.mitre.org/groups/<ID>/ for each group. Last reviewed:
 * 2026-05-11. If MITRE updates an entry, refresh accordingly.
 */

export interface Technique {
  /** ATT&CK technique ID (with sub-technique if applicable, e.g. "T1059.001"). */
  id: string;
  name: string;
  /** Short tactic label (one of the 14 ATT&CK Enterprise tactics). */
  tactic: string;
}

/** Catalogue of techniques — referenced by ID below to keep group entries terse. */
const T: Record<string, Technique> = {
  T1486: { id: 'T1486', name: 'Data Encrypted for Impact', tactic: 'Impact' },
  T1567: { id: 'T1567', name: 'Exfiltration Over Web Service', tactic: 'Exfiltration' },
  T1003: { id: 'T1003', name: 'OS Credential Dumping', tactic: 'Credential Access' },
  T1078: { id: 'T1078', name: 'Valid Accounts', tactic: 'Defense Evasion / Initial Access' },
  T1133: { id: 'T1133', name: 'External Remote Services', tactic: 'Initial Access' },
  T1190: { id: 'T1190', name: 'Exploit Public-Facing Application', tactic: 'Initial Access' },
  T1490: { id: 'T1490', name: 'Inhibit System Recovery', tactic: 'Impact' },
  T1059: { id: 'T1059', name: 'Command and Scripting Interpreter', tactic: 'Execution' },
  'T1059.001': { id: 'T1059.001', name: 'PowerShell', tactic: 'Execution' },
  T1027: { id: 'T1027', name: 'Obfuscated Files or Information', tactic: 'Defense Evasion' },
};

const techsForGroup: Record<string, string[]> = {
  // LockBit
  G1006: ['T1486', 'T1567', 'T1003', 'T1078', 'T1133', 'T1490'],
  // BlackCat / ALPHV
  G1011: ['T1486', 'T1567', 'T1059.001', 'T1003', 'T1078', 'T1190'],
  // TA505 / Cl0p
  G0092: ['T1190', 'T1078', 'T1486', 'T1567', 'T1059', 'T1027'],
  // Akira
  G1024: ['T1486', 'T1567', 'T1133', 'T1078', 'T1003', 'T1490'],
  // Play
  G1040: ['T1486', 'T1078', 'T1059', 'T1133', 'T1490', 'T1190'],
  // Black Basta
  G1033: ['T1486', 'T1567', 'T1059.001', 'T1003', 'T1078', 'T1490'],
  // Royal
  G1037: ['T1486', 'T1567', 'T1078', 'T1003', 'T1059.001', 'T1190'],
  // Medusa
  G1038: ['T1486', 'T1567', 'T1078', 'T1059', 'T1490', 'T1133'],
  // BianLian
  G1002: ['T1486', 'T1567', 'T1078', 'T1003', 'T1133', 'T1059'],
  // Agenda / Qilin
  G1010: ['T1486', 'T1567', 'T1078', 'T1059', 'T1133', 'T1490'],
  // Wizard Spider / Conti
  G0098: ['T1486', 'T1567', 'T1003', 'T1078', 'T1059', 'T1059.001'],
  // GOLD SOUTHFIELD / REvil
  G0115: ['T1486', 'T1567', 'T1003', 'T1078', 'T1059.001'],
  // DarkSide
  G1014: ['T1486', 'T1567', 'T1003', 'T1078', 'T1059.001'],
  // BlackByte
  G1043: ['T1486', 'T1567', 'T1078', 'T1059.001', 'T1133'],
  // HIVE
  G1015: ['T1486', 'T1567', 'T1078', 'T1059', 'T1490'],
  // Wizard Spider / Ryuk
  G0102: ['T1486', 'T1003', 'T1078', 'T1059', 'T1490'],
  // RagnarLocker
  G1041: ['T1486', 'T1078', 'T1059', 'T1133'],
  // Rhysida
  G1048: ['T1486', 'T1567', 'T1078', 'T1059', 'T1190'],
};

/** Lookup techniques for a MITRE Group ID. Returns [] when group is unknown. */
export function techniquesForGroup(mitreGroupId: string): Technique[] {
  const ids = techsForGroup[mitreGroupId];
  if (!ids) return [];
  return ids.map((tid) => T[tid]!).filter(Boolean);
}

/** Full catalogue — used to render a "what each ID means" reference table. */
export const TECHNIQUE_CATALOGUE = Object.values(T);
