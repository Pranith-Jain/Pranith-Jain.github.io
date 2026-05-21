/**
 * Field-mapping presets. The converter parses any input into a RuleIR
 * whose predicates use the SOURCE format's field names verbatim. Most
 * Sigma rules in the wild use canonical Sysmon / Windows Security event
 * field names (`Image`, `CommandLine`, `ParentImage`, …) — those names
 * are exactly what Microsoft Defender, Elastic ECS, and Splunk CIM each
 * call by a different label.
 *
 * Each FieldMap is applied AFTER parse-to-IR and BEFORE emit. The
 * conversion result reports which fields were remapped vs left raw,
 * and which the chosen preset has no entry for (so the analyst knows
 * a field is unmapped, rather than silently emitting the unfamiliar
 * source name into the target query).
 *
 * The maps below are intentionally narrow — they cover the field set a
 * typical Sysmon `process_creation` / `network_connection` Sigma rule
 * touches, which is the most common conversion use case. Expand a map
 * once you hit a Sigma category it doesn't cover; do not bloat every
 * map "just in case".
 */

export interface FieldMap {
  /** Stable key for the picker (no spaces). */
  id: string;
  /** Display label. */
  label: string;
  /** One-line description of when to use this preset. */
  description: string;
  /** sigma-style source field name → target schema field name. */
  mappings: Record<string, string>;
}

/**
 * Microsoft Defender for Endpoint — Advanced Hunting schema. Field names
 * sourced from the public schema reference at
 * learn.microsoft.com/microsoft-365/security/defender/advanced-hunting-schema-tables.
 */
const DEFENDER_M365: Record<string, string> = {
  // Process creation (DeviceProcessEvents)
  Image: 'FolderPath',
  CommandLine: 'ProcessCommandLine',
  OriginalFileName: 'ProcessVersionInfoOriginalFileName',
  ParentImage: 'InitiatingProcessFolderPath',
  ParentCommandLine: 'InitiatingProcessCommandLine',
  ProcessId: 'ProcessId',
  ParentProcessId: 'InitiatingProcessId',
  User: 'AccountName',
  Computer: 'DeviceName',
  Hashes: 'SHA256',
  md5: 'MD5',
  sha1: 'SHA1',
  sha256: 'SHA256',
  // Network (DeviceNetworkEvents)
  DestinationIp: 'RemoteIP',
  DestinationPort: 'RemotePort',
  SourceIp: 'LocalIP',
  SourcePort: 'LocalPort',
  // File (DeviceFileEvents)
  TargetFilename: 'FolderPath',
  // Registry
  TargetObject: 'RegistryKey',
};

/**
 * Elastic Common Schema (ECS) — the most portable target. Field names
 * sourced from elastic.co/guide/en/ecs/current/ecs-field-reference.html
 */
const ELASTIC_ECS: Record<string, string> = {
  // Process
  Image: 'process.executable',
  CommandLine: 'process.command_line',
  OriginalFileName: 'process.pe.original_file_name',
  ParentImage: 'process.parent.executable',
  ParentCommandLine: 'process.parent.command_line',
  ProcessId: 'process.pid',
  ParentProcessId: 'process.parent.pid',
  User: 'user.name',
  Computer: 'host.name',
  md5: 'process.hash.md5',
  sha1: 'process.hash.sha1',
  sha256: 'process.hash.sha256',
  // Network
  DestinationIp: 'destination.ip',
  DestinationPort: 'destination.port',
  SourceIp: 'source.ip',
  SourcePort: 'source.port',
  // File / Registry
  TargetFilename: 'file.path',
  TargetObject: 'registry.path',
};

/**
 * Splunk CIM (Endpoint / Process model). Field names sourced from
 * docs.splunk.com Common Information Model — Endpoint data model.
 */
const SPLUNK_CIM: Record<string, string> = {
  Image: 'process_path',
  CommandLine: 'process',
  OriginalFileName: 'process_exec',
  ParentImage: 'parent_process_path',
  ParentCommandLine: 'parent_process',
  ProcessId: 'process_id',
  ParentProcessId: 'parent_process_id',
  User: 'user',
  Computer: 'dest',
  md5: 'process_hash',
  sha1: 'process_hash',
  sha256: 'process_hash',
  DestinationIp: 'dest_ip',
  DestinationPort: 'dest_port',
  SourceIp: 'src_ip',
  SourcePort: 'src_port',
  TargetFilename: 'file_path',
  TargetObject: 'registry_path',
};

export const FIELD_MAPS: FieldMap[] = [
  {
    id: 'passthrough',
    label: 'Pass-through (no remap)',
    description: 'Field names from the source are emitted verbatim. Use when the target reads the same schema.',
    mappings: {},
  },
  {
    id: 'defender-m365',
    label: 'Microsoft Defender (M365 Advanced Hunting)',
    description:
      'Sysmon / Windows Security field names → DeviceProcessEvents / DeviceNetworkEvents / DeviceFileEvents columns.',
    mappings: DEFENDER_M365,
  },
  {
    id: 'elastic-ecs',
    label: 'Elastic Common Schema (ECS)',
    description: 'Sysmon / Windows Security field names → ECS dotted paths (process.executable, destination.ip, …).',
    mappings: ELASTIC_ECS,
  },
  {
    id: 'splunk-cim',
    label: 'Splunk CIM (Endpoint)',
    description: 'Sysmon / Windows Security field names → Splunk Common Information Model field names.',
    mappings: SPLUNK_CIM,
  },
];

export function findFieldMap(id: string): FieldMap | undefined {
  return FIELD_MAPS.find((m) => m.id === id);
}
