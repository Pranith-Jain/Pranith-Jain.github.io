import type { RuleFormat } from './types';

/**
 * Curated starter library for the Rule Converter.
 *
 * Every starter is a fully-formed Sigma rule modelled on a well-understood
 * detection pattern — the kind of rule the converter is most often used to
 * port (Sigma is the dominant source format in the public ecosystem). They
 * deliberately use canonical Sysmon / Windows Security field names
 * (`Image`, `CommandLine`, `ParentImage`, `TargetFilename`, …) so the
 * field-map presets have something to bite on.
 *
 * Authoring rules:
 *  - Every starter is valid Sigma the parser accepts without warnings.
 *  - Keep field names canonical Sysmon / windows-security — that's what
 *    the FieldMap presets target.
 *  - One detection idea per starter. Don't bundle.
 *  - `description` is a one-line analyst summary.
 */

export interface ConverterStarter {
  id: string;
  group: 'Process execution' | 'Credential access' | 'Defence evasion' | 'Persistence' | 'Lateral movement' | 'Network';
  label: string;
  description: string;
  /** Always Sigma — every converter starter is Sigma source. */
  format: RuleFormat;
  body: string;
}

export const CONVERTER_STARTERS: ConverterStarter[] = [
  // ─── Process execution ───────────────────────────────────────────────
  {
    id: 'certutil-urlcache',
    group: 'Process execution',
    label: 'Certutil URL-cache download',
    description: 'certutil.exe used to fetch a remote file via urlcache — classic LOLBin download cradle.',
    format: 'sigma',
    body: `title: Certutil URL cache download
status: experimental
description: certutil.exe used to fetch a remote file
logsource:
  product: windows
  category: process_creation
detection:
  selection:
    Image|endswith: '\\\\certutil.exe'
    CommandLine|contains:
      - 'urlcache'
      - 'split'
      - 'http'
  condition: selection
level: high
tags:
  - attack.command_and_control
  - attack.t1105`,
  },
  {
    id: 'powershell-encoded',
    group: 'Process execution',
    label: 'PowerShell encoded command',
    description: 'powershell.exe invoked with -EncodedCommand — common obfuscation wrapper.',
    format: 'sigma',
    body: `title: PowerShell EncodedCommand
status: stable
description: PowerShell launched with an encoded command wrapper
logsource:
  product: windows
  category: process_creation
detection:
  selection:
    Image|endswith: '\\\\powershell.exe'
    CommandLine|contains:
      - '-enc'
      - '-EncodedCommand'
      - '-e '
  condition: selection
level: medium
tags:
  - attack.defense_evasion
  - attack.t1027`,
  },
  {
    id: 'rundll32-javascript',
    group: 'Defence evasion',
    label: 'rundll32 javascript: protocol',
    description: 'rundll32.exe invoked with a javascript: URI — squiblydoo / Koadic style execution.',
    format: 'sigma',
    body: `title: rundll32 javascript protocol
status: stable
description: rundll32.exe invoked with a javascript: URI
logsource:
  product: windows
  category: process_creation
detection:
  selection:
    Image|endswith: '\\\\rundll32.exe'
    CommandLine|contains:
      - 'javascript:'
  condition: selection
level: high
tags:
  - attack.defense_evasion
  - attack.t1218.011`,
  },

  // ─── Credential access ───────────────────────────────────────────────
  {
    id: 'lsass-access',
    group: 'Credential access',
    label: 'LSASS process access by suspicious caller',
    description: 'Process opens LSASS — common credential-dumping precursor (Mimikatz, ProcDump, comsvcs.dll).',
    format: 'sigma',
    body: `title: LSASS access
status: stable
description: LSASS process opened by a non-system caller
logsource:
  product: windows
  category: process_access
detection:
  selection:
    TargetImage|endswith: '\\\\lsass.exe'
    GrantedAccess|contains:
      - '0x1010'
      - '0x1410'
      - '0x1438'
      - '0x143a'
      - '0x1f0fff'
  condition: selection
level: high
tags:
  - attack.credential_access
  - attack.t1003.001`,
  },

  // ─── Persistence ─────────────────────────────────────────────────────
  {
    id: 'scheduled-task-rare',
    group: 'Persistence',
    label: 'Scheduled task created with suspicious binary',
    description: 'schtasks.exe creating a task that points at a non-system path — common persistence pattern.',
    format: 'sigma',
    body: `title: Scheduled task with non-system binary
status: experimental
description: schtasks.exe creating a task that invokes a binary from a non-system location
logsource:
  product: windows
  category: process_creation
detection:
  schtasks:
    Image|endswith: '\\\\schtasks.exe'
    CommandLine|contains: '/create'
  user_path:
    CommandLine|contains:
      - 'C:\\\\Users\\\\'
      - '\\\\AppData\\\\'
      - 'C:\\\\ProgramData\\\\'
      - 'C:\\\\Temp\\\\'
  condition: schtasks and user_path
level: high
tags:
  - attack.persistence
  - attack.t1053.005`,
  },
  {
    id: 'autorun-registry',
    group: 'Persistence',
    label: 'Run/RunOnce registry persistence',
    description: 'Write to a Run / RunOnce key — autostart persistence on logon.',
    format: 'sigma',
    body: `title: Run registry key autostart write
status: stable
description: New value written under HKLM/HKCU Run or RunOnce
logsource:
  product: windows
  category: registry_event
detection:
  selection:
    TargetObject|contains:
      - '\\\\CurrentVersion\\\\Run\\\\'
      - '\\\\CurrentVersion\\\\RunOnce\\\\'
  condition: selection
level: medium
tags:
  - attack.persistence
  - attack.t1547.001`,
  },

  // ─── Lateral movement ────────────────────────────────────────────────
  {
    id: 'psexec-named-pipe',
    group: 'Lateral movement',
    label: 'PsExec service named pipe',
    description: 'Named pipe created with the PsExec service convention — interactive lateral movement via PsExec.',
    format: 'sigma',
    body: `title: PsExec service named pipe
status: stable
description: Named pipe created matching the PsExec service convention
logsource:
  product: windows
  category: pipe_created
detection:
  selection:
    PipeName|contains:
      - 'PSEXESVC'
      - 'remcom_communicaton'
  condition: selection
level: medium
tags:
  - attack.lateral_movement
  - attack.t1021.002`,
  },

  // ─── Network ─────────────────────────────────────────────────────────
  {
    id: 'cobalt-strike-pipes',
    group: 'Network',
    label: 'Cobalt Strike default named pipes',
    description: 'Named pipes matching default Cobalt Strike beacon names (postex_*, msagent_*, etc.).',
    format: 'sigma',
    body: `title: Cobalt Strike default named pipes
status: stable
description: Named pipe matching a default Cobalt Strike beacon pattern
logsource:
  product: windows
  category: pipe_created
detection:
  selection:
    PipeName|contains:
      - '\\\\postex_'
      - '\\\\msagent_'
      - '\\\\status_'
      - '\\\\interprocess_'
      - '\\\\mojo.5688'
  condition: selection
level: high
tags:
  - attack.command_and_control
  - attack.t1071.001`,
  },
];

/** Grouping for the picker UI; preserves declaration order within group. */
export function groupedConverterStarters(): Map<string, ConverterStarter[]> {
  const out = new Map<string, ConverterStarter[]>();
  for (const s of CONVERTER_STARTERS) {
    const list = out.get(s.group);
    if (list) list.push(s);
    else out.set(s.group, [s]);
  }
  return out;
}
