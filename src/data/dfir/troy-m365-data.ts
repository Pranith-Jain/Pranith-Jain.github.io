export interface TroyPhase {
  id: string;
  n: string;
  name: string;
  mitre: string;
}

export interface TroyBand {
  label: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TroyNode {
  id: string;
  label: string;
  sub: string;
  type: string;
  x: number;
  y: number;
  phase: string[];
  stage?: number;
}

export interface TroyEdge {
  from: string;
  to: string;
  phase: string;
  label?: string;
  kind?: string;
}

export interface TroyControl {
  fn: string;
  product: string;
  name: string;
  note: string;
  docs?: { label: string; url: string }[];
}

export interface TroyHunt {
  name: string;
  kql: string;
  ref?: string;
}

export interface TroyRef {
  label: string;
  url: string;
  by?: string;
}

export interface TroyDetail {
  stage: string;
  attacker?: string[];
  controls?: TroyControl[];
  hunt?: TroyHunt[];
  refs?: TroyRef[];
}

export interface TroyScenario {
  id: string;
  name: string;
  summary: string;
  perimeterX?: number;
  bands: TroyBand[];
  nodes: TroyNode[];
  edges: TroyEdge[];
  detail: Record<string, TroyDetail>;
}

export interface TroyAtlas {
  meta: { title: string; tagline: string; author: string; authorUrl: string; repoUrl: string };
  phases: TroyPhase[];
  scenarios: TroyScenario[];
}

export const TROY_ATLAS: TroyAtlas = {
  meta: {
    title: 'TROY-M365',
    tagline: 'Attack paths → the Microsoft controls that hold the line',
    author: 'divandenyss',
    authorUrl: 'https://github.com/divandenyss',
    repoUrl: 'https://github.com/divandenyss/troy-m365',
  },
  phases: [
    { id: 'recon', n: '01', name: 'Recon & Resource Dev', mitre: 'TA0043 / TA0042' },
    { id: 'initial', n: '02', name: 'Initial Access', mitre: 'TA0001' },
    { id: 'cred', n: '03', name: 'Credential Access', mitre: 'TA0006' },
    { id: 'evasion', n: '04', name: 'MFA Bypass / Evasion', mitre: 'TA0005' },
    { id: 'persist', n: '05', name: 'Persistence', mitre: 'TA0003' },
    { id: 'lateral', n: '06', name: 'Lateral Movement', mitre: 'TA0008' },
    { id: 'collect', n: '07', name: 'Collection', mitre: 'TA0009' },
    { id: 'impact', n: '08', name: 'Exfil / Impact', mitre: 'TA0010 / TA0040' },
  ],
  scenarios: [
    {
      id: 'onprem-ransom',
      name: 'Exposed RDP → Domain Compromise → Ransomware',
      summary:
        'A real human-operated ransomware path (per The DFIR Report): password spray against an internet-facing RDP server, LOTL discovery, Mimikatz/LSASS + DCSync for domain admin, RDP lateral movement, Rclone-over-SFTP exfil, RMM persistence, then network-wide encryption over SMB. Controls mapped to Microsoft capabilities via MCRA.',
      perimeterX: 420,
      bands: [
        { label: 'Public / Perimeter', kind: 'external', x: 40, y: 80, w: 360, h: 470 },
        { label: 'Internal Infrastructure', kind: 'internal', x: 440, y: 80, w: 1000, h: 470 },
        {
          label: 'Detect & Respond · Defender XDR + Microsoft Sentinel',
          kind: 'detect',
          x: 40,
          y: 600,
          w: 1400,
          h: 150,
        },
      ],
      nodes: [
        { id: 'ta', label: 'Threat Actor', sub: 'spray operator', type: 'threat', x: 140, y: 180, phase: ['recon'] },
        {
          id: 'rdpgw',
          label: 'Exposed RDP / VPN',
          sub: 'external RDP / VPN',
          type: 'vpn',
          x: 300,
          y: 300,
          phase: ['initial'],
          stage: 1,
        },
        {
          id: 'c2',
          label: 'C2 / RMM + Exfil',
          sub: 'Atera · Rclone',
          type: 'c2',
          x: 140,
          y: 430,
          phase: ['persist', 'impact'],
        },
        {
          id: 'beachhead',
          label: 'Beachhead Host',
          sub: 'RDP foothold · MDE',
          type: 'endpoint',
          x: 600,
          y: 180,
          phase: ['initial', 'cred', 'lateral'],
          stage: 2,
        },
        {
          id: 'dc',
          label: 'Domain Controllers',
          sub: 'Tier 0 · MDI',
          type: 'dc',
          x: 950,
          y: 180,
          phase: ['cred', 'lateral', 'impact'],
          stage: 3,
        },
        {
          id: 'fileserver',
          label: 'File / DB Servers',
          sub: 'file shares',
          type: 'database',
          x: 950,
          y: 410,
          phase: ['lateral', 'collect', 'impact'],
        },
        {
          id: 'backup',
          label: 'Backup / VMs',
          sub: 'RMM persist · MDE',
          type: 'backup',
          x: 1290,
          y: 180,
          phase: ['lateral', 'persist', 'impact'],
          stage: 3,
        },
        {
          id: 'impact',
          label: 'Ransomware',
          sub: 'double extortion',
          type: 'impact',
          x: 1290,
          y: 410,
          phase: ['impact'],
          stage: 4,
        },
        {
          id: 'siem',
          label: 'Defender XDR',
          sub: '+ Sentinel · MDR',
          type: 'siem',
          x: 740,
          y: 675,
          phase: ['initial', 'cred', 'lateral', 'persist', 'impact'],
        },
      ],
      edges: [
        { from: 'ta', to: 'rdpgw', phase: 'initial', label: 'password spray' },
        { from: 'rdpgw', to: 'beachhead', phase: 'initial', label: 'valid RDP login' },
        { from: 'beachhead', to: 'dc', phase: 'cred', label: 'discovery + DCSync' },
        { from: 'beachhead', to: 'fileserver', phase: 'lateral', label: 'RDP lateral' },
        { from: 'beachhead', to: 'backup', phase: 'lateral', label: 'RDP lateral' },
        { from: 'dc', to: 'impact', phase: 'impact', label: 'ransomware via SMB' },
        { from: 'backup', to: 'impact', phase: 'impact', label: 'remote service exec' },
        { from: 'backup', to: 'c2', phase: 'persist', label: 'Atera / Splashtop RMM', kind: 'exfil' },
        { from: 'fileserver', to: 'c2', phase: 'impact', label: 'Rclone → SFTP :443', kind: 'exfil' },
        { from: 'rdpgw', to: 'siem', kind: 'telemetry' },
        { from: 'beachhead', to: 'siem', kind: 'telemetry' },
        { from: 'dc', to: 'siem', kind: 'telemetry' },
        { from: 'fileserver', to: 'siem', kind: 'telemetry' },
        { from: 'backup', to: 'siem', kind: 'telemetry' },
      ],
      detail: {
        ta: {
          stage: 'Reconnaissance & Resource Development',
          attacker: [
            'Scans the internet for exposed RDP / VPN and sprays common passwords against valid usernames from known-malicious IPs.',
            'In the DFIR case the spray ran ~4 hours across multiple accounts before a valid, already-elevated account logged in.',
          ],
          controls: [
            {
              fn: 'detect',
              product: 'EASM',
              name: 'Find the exposed asset first',
              note: "Microsoft's external attack surface management surfaces internet-facing RDP & VPN so you close it before an attacker sprays it.",
              docs: [
                {
                  label: 'Defender EASM',
                  url: 'https://learn.microsoft.com/en-us/azure/external-attack-surface-management/',
                },
              ],
            },
            {
              fn: 'prevent',
              product: 'CTEM',
              name: 'Run Continuous Threat Exposure Management Scans',
              note: "Reduce the external attack surface: stand up continuous threat exposure management, keep scanning your own subdomains and external footprint, and shrink what's reachable from the internet.",
              docs: [{ label: 'Subdomain Scanning', url: 'https://subdomainfinder.c99.nl/' }],
            },
          ],
          refs: [
            {
              label: 'Hide Your RDP: Password Spray → RansomHub',
              url: 'https://thedfirreport.com/2025/06/30/hide-your-rdp-password-spray-leads-to-ransomhub-deployment/',
              by: 'The DFIR Report',
            },
            { label: 'Microsoft Cybersecurity Reference Architectures', url: 'https://aka.ms/MCRA', by: 'Microsoft' },
          ],
        },
        rdpgw: {
          stage: 'Initial Access, T1133 External Remote Services + T1110.003 Password Spray',
          attacker: [
            'RDP is published straight to the internet, so a sprayed valid password drops the attacker onto an interactive desktop with nothing else in the way.',
            "This is the one nobody wants to hear: if 3389 is reachable from the internet, you're one guessed password away from a foothold.",
          ],
          controls: [
            {
              fn: 'prevent',
              product: 'Entra Private Access',
              name: 'Get RDP/VPN off the internet (ZTNA)',
              note: 'Put remote access behind an identity and device check instead of opening 3389 to the world.',
              docs: [
                {
                  label: 'Global Secure Access / Private Access',
                  url: 'https://learn.microsoft.com/en-us/entra/global-secure-access/overview-what-is-global-secure-access',
                },
              ],
            },
            {
              fn: 'prevent',
              product: 'Entra ID',
              name: 'Phishing-resistant MFA + smart lockout',
              note: 'MFA on every remote entry point defeats spray outright; smart lockout throttles the guessing.',
              docs: [
                {
                  label: 'Entra smart lockout',
                  url: 'https://learn.microsoft.com/en-us/entra/identity/authentication/howto-password-smart-lockout',
                },
              ],
            },
            {
              fn: 'detect',
              product: 'MDI / Entra ID Protection',
              name: 'Brute-force & password-spray detection',
              note: "Don't hand-roll a noisy 4625/4624 query for this. Lean on the built-in detections: Defender for Identity sensors on every DC with honeytoken accounts.",
              docs: [
                {
                  label: 'Defender for Identity',
                  url: 'https://learn.microsoft.com/en-us/defender-for-identity/what-is',
                },
              ],
            },
          ],
          refs: [
            {
              label: 'Hide Your RDP (Initial Access, T1133 / T1110.003)',
              url: 'https://thedfirreport.com/2025/06/30/hide-your-rdp-password-spray-leads-to-ransomhub-deployment/',
              by: 'The DFIR Report',
            },
          ],
        },
        c2: {
          stage: 'Command & Control + Exfiltration infrastructure',
          attacker: [
            'Legitimate RMM tools (Atera, Splashtop) are installed for resilient remote access that blends into admin traffic (T1219).',
            'Data is pushed out with Rclone over SFTP, in the DFIR case tunnelled on port 443 to disguise it (T1048).',
          ],
          controls: [
            {
              fn: 'prevent',
              product: 'MDE',
              name: 'Block unsanctioned RMM + egress filtering',
              note: 'WDAC/ASR to block unapproved RMM binaries; network protection + firewall to stop C2 / SFTP egress.',
              docs: [
                {
                  label: 'Network protection',
                  url: 'https://learn.microsoft.com/en-us/defender-endpoint/network-protection',
                },
              ],
            },
            {
              fn: 'detect',
              product: 'MDCA + Defender TI',
              name: 'Discover shadow RMM & known-bad egress',
              note: 'Defender for Cloud Apps flags unsanctioned RMM SaaS; Defender TI / Sentinel catch beacons to known infrastructure.',
              docs: [
                {
                  label: 'Defender for Cloud Apps',
                  url: 'https://learn.microsoft.com/en-us/defender-cloud-apps/what-is-defender-for-cloud-apps',
                },
              ],
            },
          ],
          refs: [
            {
              label: 'Hide Your RDP (C2/RMM · Exfil · T1219 / T1048)',
              url: 'https://thedfirreport.com/2025/06/30/hide-your-rdp-password-spray-leads-to-ransomhub-deployment/',
              by: 'The DFIR Report',
            },
          ],
        },
        beachhead: {
          stage: 'Execution → Credential Access → Discovery',
          attacker: [
            'From the RDP foothold the actor runs LOTL discovery (net, nltest, nslookup, ipconfig) plus Advanced IP Scanner / NetScan.',
            'Credential theft: Nirsoft CredentialsFileView and Mimikatz reading LSASS memory (sekurlsa::logonpasswords, T1003.001).',
          ],
          controls: [
            {
              fn: 'prevent',
              product: 'MDE',
              name: 'ASR: block credential stealing from LSASS',
              note: 'The ASR rule blocks tools that read LSASS; enable Credential Guard where supported.',
              docs: [
                {
                  label: 'Attack surface reduction rules',
                  url: 'https://learn.microsoft.com/en-us/defender-endpoint/attack-surface-reduction',
                },
                {
                  label: 'Credential Guard',
                  url: 'https://learn.microsoft.com/en-us/windows/security/identity-protection/credential-guard/',
                },
              ],
            },
            {
              fn: 'detect',
              product: 'MDE',
              name: 'LSASS access from a non-system process',
              note: 'High-signal detection for Mimikatz-style credential dumping on the beachhead.',
              docs: [
                {
                  label: 'Microsoft Defender for Endpoint',
                  url: 'https://learn.microsoft.com/en-us/defender-endpoint/microsoft-defender-endpoint',
                },
              ],
            },
            {
              fn: 'respond',
              product: 'Defender XDR',
              name: 'Device isolation / attack disruption',
              note: 'Isolate the beachhead the moment credential theft + discovery fire together, before lateral movement starts.',
              docs: [
                {
                  label: 'Automatic attack disruption',
                  url: 'https://learn.microsoft.com/en-us/defender-xdr/automatic-attack-disruption',
                },
              ],
            },
          ],
          hunt: [
            {
              name: 'Credential dumping by invariant command, not filename',
              kql: 'DeviceProcessEvents\n| where ProcessCommandLine has_any ("sekurlsa","privilege::debug","token::elevate","lsadump","crypto::","kerberos::ptt","-ma lsass")\n| project Timestamp, DeviceName, AccountName, ProcessCommandLine, InitiatingProcessFileName',
            },
            {
              name: 'Account added to a privileged group',
              kql: 'DeviceProcessEvents\n| where ProcessCommandLine has "/add"\n| where ProcessCommandLine has_any ("administrators","domain admins","enterprise admins","remote desktop users","backup operators")\n| project Timestamp, DeviceName, AccountName, ProcessCommandLine',
            },
          ],
          refs: [
            {
              label: 'Hide Your RDP (Cred Access + Discovery)',
              url: 'https://thedfirreport.com/2025/06/30/hide-your-rdp-password-spray-leads-to-ransomhub-deployment/',
              by: 'The DFIR Report',
            },
          ],
        },
        dc: {
          stage: 'Credential Access (DCSync) + Lateral Movement, Tier 0',
          attacker: [
            'The actor confirms a pivot domain-admin account and runs lsadump::dcsync against child domains (T1003.006), seen as AD replication (Event 4662).',
            'MMC snap-ins (dsa.msc, dssite.msc) on the DCs map users, sites and trusts before spreading.',
          ],
          controls: [
            {
              fn: 'prevent',
              product: 'Privileged Access (MCRA)',
              name: 'Tiered admin + PAWs + PIM',
              note: 'Domain-admin logons only from Privileged Access Workstations, just-in-time via PIM, never reused on beachhead hosts.',
              docs: [
                {
                  label: 'Privileged access strategy',
                  url: 'https://learn.microsoft.com/en-us/security/privileged-access-workstations/overview',
                },
                {
                  label: 'Privileged Access Workstations',
                  url: 'https://learn.microsoft.com/en-us/security/privileged-access-workstations/privileged-access-devices',
                },
              ],
            },
            {
              fn: 'detect',
              product: 'MDI',
              name: 'DCSync & AD recon detection',
              note: "DCSync is one of the strongest built-in signals Defender for Identity has, its 'Suspected DCSync attack' alert fires on replication from a non-DC principal.",
              docs: [
                {
                  label: 'MDI credential-access alerts',
                  url: 'https://learn.microsoft.com/en-us/defender-for-identity/credential-access-alerts',
                },
              ],
            },
          ],
          refs: [
            {
              label: 'Hide Your RDP (DCSync + AD discovery)',
              url: 'https://thedfirreport.com/2025/06/30/hide-your-rdp-password-spray-leads-to-ransomhub-deployment/',
              by: 'The DFIR Report',
            },
          ],
        },
        fileserver: {
          stage: 'Collection + Exfiltration, T1048',
          attacker: [
            'File and database servers are browsed for documents, then Rclone copies target file types (docs, spreadsheets, PST/EDB) out over SFTP.',
            'In the DFIR case ~2 GB left over ~40 minutes, tunnelled on port 443 to look like HTTPS.',
          ],
          controls: [
            {
              fn: 'prevent',
              product: 'AD / Entra',
              name: 'Least privilege + segmentation',
              note: "Tighten share and folder ACLs and segment the network so one compromised account can't sweep every file server in a single pass.",
              docs: [
                {
                  label: 'Zero Trust: network segmentation',
                  url: 'https://learn.microsoft.com/en-us/security/zero-trust/deploy/networks',
                },
              ],
            },
            {
              fn: 'detect',
              product: 'MDE',
              name: 'Rclone / mass-egress detection',
              note: 'Alert on rclone execution & config creation and on large anomalous outbound transfers from a file server.',
              docs: [
                {
                  label: 'Onboard servers to MDE',
                  url: 'https://learn.microsoft.com/en-us/defender-endpoint/onboard-windows-server',
                },
              ],
            },
          ],
          hunt: [
            {
              name: 'Rclone execution / config',
              kql: 'DeviceProcessEvents\n| where ProcessCommandLine has_any ("--multi-thread-streams","--no-check-certificate","--ignore-existing","--transfers")\n| where ProcessCommandLine matches regex @"\\s\\w+:"\n| project Timestamp, DeviceName, AccountName, ProcessCommandLine',
            },
          ],
          refs: [
            {
              label: 'Hide Your RDP (Exfiltration)',
              url: 'https://thedfirreport.com/2025/06/30/hide-your-rdp-password-spray-leads-to-ransomhub-deployment/',
              by: 'The DFIR Report',
            },
          ],
        },
        backup: {
          stage: 'Lateral Movement + Persistence, targeting recovery',
          attacker: [
            'Backup, share and hypervisor servers are reached over RDP; RMM agents (Atera/Splashtop) are installed for durable access (Event 7045).',
            "Hitting backups and hypervisors first is deliberate, it removes the victim's ability to recover without paying.",
          ],
          controls: [
            {
              fn: 'detect',
              product: 'MDE / Defender XDR',
              name: "Don't leave backup & hypervisor hosts blind",
              note: 'Backup servers and hypervisors are the classic Defender blind spot. Onboard them to Defender for Endpoint so the RMM install and lateral RDP surface as XDR signals.',
              docs: [
                {
                  label: 'Onboard servers to Defender for Endpoint',
                  url: 'https://learn.microsoft.com/en-us/defender-endpoint/onboard-windows-server',
                },
              ],
            },
            {
              fn: 'detect',
              product: 'MDE',
              name: 'Unexpected RMM service install',
              note: "Alert on new Atera/Splashtop services (Event 7045) on servers that shouldn't run them.",
              docs: [
                {
                  label: 'Attack surface reduction rules',
                  url: 'https://learn.microsoft.com/en-us/defender-endpoint/attack-surface-reduction',
                },
              ],
            },
          ],
          hunt: [
            {
              name: 'RMM install by its silent-deploy parameters',
              kql: 'DeviceProcessEvents\n| where ProcessCommandLine has_any ("IntegratorLogin","CompanyId","SplashtopStreamer","deploycode")\n| project Timestamp, DeviceName, AccountName, ProcessCommandLine',
            },
          ],
          refs: [
            {
              label: 'Hide Your RDP (Persistence · RMM · backups)',
              url: 'https://thedfirreport.com/2025/06/30/hide-your-rdp-password-spray-leads-to-ransomhub-deployment/',
              by: 'The DFIR Report',
            },
          ],
        },
        impact: {
          stage: 'Impact, T1486 Encrypt + T1490 Inhibit Recovery',
          attacker: [
            'The binary self-propagates over SMB and executes on remote hosts via a Windows service, then encrypts everywhere (T1543.003, T1486).',
            'Before encrypting it kills VMs, deletes shadow copies (vssadmin) and clears event logs (wevtutil) to block recovery (T1490, T1070.001).',
          ],
          controls: [
            {
              fn: 'prevent',
              product: 'MDE',
              name: 'EDR block mode + tamper protection + controlled folder access',
              note: 'Behavioural block of the ransomware and its recovery-inhibition commands; network segmentation limits SMB self-spread.',
              docs: [
                {
                  label: 'Enable EDR in block mode',
                  url: 'https://learn.microsoft.com/en-us/defender-endpoint/edr-in-block-mode',
                },
                {
                  label: 'Controlled folder access',
                  url: 'https://learn.microsoft.com/en-us/defender-endpoint/controlled-folders',
                },
              ],
            },
            {
              fn: 'respond',
              product: 'Defender XDR',
              name: 'Automatic attack disruption (ransomware)',
              note: 'XDR can contain the device / disable the account mid-detonation to break the encryption spread in near real-time.',
              docs: [
                {
                  label: 'Automatic attack disruption',
                  url: 'https://learn.microsoft.com/en-us/defender-xdr/automatic-attack-disruption',
                },
              ],
            },
          ],
          hunt: [
            {
              name: 'Recovery inhibition, any binary',
              kql: 'DeviceProcessEvents\n| where ProcessCommandLine has_any ("delete shadows","shadowcopy delete","resize shadowstorage","recoveryenabled no","delete catalog")\n| project Timestamp, DeviceName, AccountName, ProcessCommandLine',
            },
          ],
          refs: [
            {
              label: 'Hide Your RDP (Impact · RansomHub)',
              url: 'https://thedfirreport.com/2025/06/30/hide-your-rdp-password-spray-leads-to-ransomhub-deployment/',
              by: 'The DFIR Report',
            },
          ],
        },
        siem: {
          stage: 'Detection & Response overlay, where the MDR / SOC plugs in',
          attacker: [
            'Everything above feeds in here. Defender XDR gives the analyst one incident to work instead of a pile of disconnected alerts, and Sentinel sits behind it holding the wider log picture.',
          ],
          controls: [
            {
              fn: 'detect',
              product: 'Defender XDR',
              name: 'One incident across endpoint + identity',
              note: 'Defender XDR pulls the MDE (endpoint) and MDI (identity) signals into one incident, so the analyst sees the whole chain instead of scattered alerts.',
              docs: [
                {
                  label: 'Microsoft Defender XDR',
                  url: 'https://learn.microsoft.com/en-us/defender-xdr/microsoft-365-defender',
                },
              ],
            },
            {
              fn: 'respond',
              product: 'Defender XDR',
              name: 'Automatic attack disruption',
              note: 'On a high-confidence ransomware pattern XDR can isolate the host and disable the account on its own.',
              docs: [
                {
                  label: 'Automatic attack disruption',
                  url: 'https://learn.microsoft.com/en-us/defender-xdr/automatic-attack-disruption',
                },
              ],
            },
            {
              fn: 'detect',
              product: 'Defender XDR',
              name: 'Advanced hunting over the whole path',
              note: 'One KQL surface (DeviceProcessEvents, DeviceEvents, IdentityDirectoryEvents), the hunts on the nodes above all run here.',
              docs: [
                {
                  label: 'Advanced hunting',
                  url: 'https://learn.microsoft.com/en-us/defender-xdr/advanced-hunting-overview',
                },
              ],
            },
            {
              fn: 'detect',
              product: 'Sentinel',
              name: 'SIEM layer for the rest of the estate',
              note: 'Defender XDR is the live investigation surface; Sentinel is the aggregation behind it for non-Microsoft logs.',
              docs: [
                {
                  label: 'Microsoft Sentinel overview',
                  url: 'https://learn.microsoft.com/en-us/azure/sentinel/overview',
                },
              ],
            },
          ],
          refs: [
            {
              label: 'MCRA, XDR = M365 Defender + Defender for Cloud; SIEM = Sentinel',
              url: 'https://aka.ms/MCRA',
              by: 'Microsoft',
            },
          ],
        },
      },
    },
    {
      id: 'aitm-cloud',
      name: 'AiTM → Cloud Identity → BEC / Persistence',
      summary:
        "A modern identity attack: adversary-in-the-middle phishing steals a live session token and replays it past MFA. The attacker sets hidden mailbox rules, re-phishes the victim's own contacts from the trusted account, and runs business email compromise. Grounded in Microsoft's Jan-2026 SharePoint AiTM campaign.",
      perimeterX: 300,
      bands: [
        { label: 'Internet · Adversary', kind: 'external', x: 40, y: 45, w: 230, h: 445 },
        { label: 'Microsoft 365 · Entra Cloud', kind: 'cloud', x: 345, y: 45, w: 905, h: 445 },
        { label: 'Detect & Respond · Defender XDR + Sentinel', kind: 'detect', x: 345, y: 545, w: 905, h: 150 },
      ],
      nodes: [
        { id: 'ta', label: 'Threat Actor', sub: 'PhaaS / Tycoon2FA', type: 'threat', x: 150, y: 120, phase: ['recon'] },
        {
          id: 'proxy',
          label: 'AiTM Proxy',
          sub: 'Evilginx proxy',
          type: 'proxy',
          x: 150,
          y: 360,
          phase: ['cred', 'evasion'],
          stage: 2,
        },
        {
          id: 'email',
          label: 'Exchange Online',
          sub: 'MDO',
          type: 'email',
          x: 470,
          y: 120,
          phase: ['initial'],
          stage: 1,
        },
        {
          id: 'endpoint',
          label: 'User Endpoint',
          sub: 'MDE',
          type: 'endpoint',
          x: 470,
          y: 360,
          phase: ['initial', 'cred'],
        },
        {
          id: 'entra',
          label: 'Entra ID',
          sub: 'identity plane',
          type: 'identity',
          x: 800,
          y: 120,
          phase: ['evasion'],
          stage: 3,
        },
        {
          id: 'app',
          label: 'App Regs / SPNs',
          sub: 'optional persistence',
          type: 'app',
          x: 800,
          y: 360,
          phase: ['persist'],
        },
        {
          id: 'm365',
          label: 'SharePoint / Teams',
          sub: 'MDCA',
          type: 'saas',
          x: 1140,
          y: 120,
          phase: ['collect'],
          stage: 4,
        },
        {
          id: 'impact',
          label: 'BEC / Data Exfil',
          sub: 'the objective',
          type: 'impact',
          x: 1140,
          y: 360,
          phase: ['impact'],
          stage: 5,
        },
        {
          id: 'siem',
          label: 'Defender XDR',
          sub: '+ Sentinel · MDR',
          type: 'siem',
          x: 797,
          y: 620,
          phase: ['cred', 'evasion', 'persist', 'collect', 'impact'],
        },
      ],
      edges: [
        { from: 'ta', to: 'proxy', phase: 'recon', label: 'stand up proxy' },
        { from: 'ta', to: 'email', phase: 'initial', label: 'send lure' },
        { from: 'email', to: 'endpoint', phase: 'initial', label: 'user clicks link' },
        { from: 'endpoint', to: 'proxy', phase: 'cred', label: 'creds + cookie captured' },
        { from: 'proxy', to: 'entra', phase: 'evasion', label: 'replay token, MFA bypassed' },
        { from: 'entra', to: 'm365', phase: 'collect', label: 'access mailbox & files' },
        { from: 'm365', to: 'impact', phase: 'impact', label: 'inbox rules → re-phish → BEC' },
        { from: 'entra', to: 'app', phase: 'persist', label: 'optional: OAuth / SPN persistence', kind: 'optional' },
        { from: 'endpoint', to: 'siem', kind: 'telemetry' },
        { from: 'entra', to: 'siem', kind: 'telemetry' },
        { from: 'email', to: 'siem', kind: 'telemetry' },
        { from: 'm365', to: 'siem', kind: 'telemetry' },
      ],
      detail: {
        ta: {
          stage: 'Reconnaissance & Resource Development',
          attacker: [
            'Buys or rents a Phishing-as-a-Service kit (Tycoon 2FA, EvilProxy, Greatness) that ships a ready-made adversary-in-the-middle proxy.',
            'Registers look-alike domains, often short-lived and hidden behind Cloudflare or open-redirect URLs so the link looks trusted.',
          ],
          controls: [
            {
              fn: 'detect',
              product: 'Defender TI',
              name: 'Threat intelligence & domain reputation',
              note: 'Track PhaaS infrastructure and newly-registered / parked domains before they are weaponised.',
              docs: [
                {
                  label: 'Defender Threat Intelligence',
                  url: 'https://learn.microsoft.com/en-us/defender/threat-intelligence/what-is-microsoft-defender-threat-intelligence-defender-ti',
                },
              ],
            },
            {
              fn: 'prevent',
              product: 'Defender XDR',
              name: 'Attack simulation training',
              note: 'Run realistic AiTM lures so the click-rate is known and users are primed against the current technique.',
              docs: [
                {
                  label: 'Attack simulation training',
                  url: 'https://learn.microsoft.com/en-us/defender-office-365/attack-simulation-training-get-started',
                },
              ],
            },
          ],
          refs: [
            {
              label: 'MSTIC, AiTM phishing targeting 10,000+ orgs',
              url: 'https://www.microsoft.com/en-us/security/blog/2022/07/12/from-cookie-theft-to-bec-attackers-use-aitm-phishing-sites-as-entry-point-to-further-financial-fraud/',
              by: 'Microsoft',
            },
            {
              label: 'AiTM / MFA phishing megablog (2026 edition)',
              url: 'https://jeffreyappel.nl/aitm-mfa-phishing-attacks-in-combination-with-new-microsoft-protections-2023-edt/',
              by: 'Jeffrey Appel',
            },
          ],
        },
        email: {
          stage: 'Initial Access, delivery',
          attacker: [
            'The lure often comes from a real, already-compromised supplier and points to a SharePoint / OneDrive file that asks you to sign in.',
            "All it takes is one click through to the AiTM proxy hiding behind that 'document'.",
          ],
          controls: [
            {
              fn: 'prevent',
              product: 'MDO',
              name: 'Safe Links + anti-phishing (Strict preset)',
              note: 'Time-of-click URL detonation, impersonation protection, and QR-code image analysis.',
              docs: [
                {
                  label: 'Preset security policies',
                  url: 'https://learn.microsoft.com/en-us/defender-office-365/preset-security-policies',
                },
                { label: 'Safe Links', url: 'https://learn.microsoft.com/en-us/defender-office-365/safe-links-about' },
              ],
            },
            {
              fn: 'respond',
              product: 'Defender XDR',
              name: 'Automatic attack disruption (BEC/AiTM)',
              note: 'Correlates cross-signal evidence and can auto-contain the user / revoke the session near real-time.',
              docs: [
                {
                  label: 'Automatic attack disruption',
                  url: 'https://learn.microsoft.com/en-us/defender-xdr/automatic-attack-disruption',
                },
              ],
            },
          ],
          hunt: [
            {
              name: 'Clicked URL that later turned malicious',
              kql: 'UrlClickEvents\n| where ActionType == "ClickAllowed"\n| where ThreatTypes has "Phish"\n| project Timestamp, AccountUpn, Url, NetworkMessageId',
            },
          ],
          refs: [
            {
              label: 'Protect against AiTM using Microsoft technology',
              url: 'https://jeffreyappel.nl/protect-against-aitm-mfa-phishing-attacks-using-microsoft-technology/',
              by: 'Jeffrey Appel',
            },
          ],
        },
        endpoint: {
          stage: 'Initial Access → Credential Access',
          attacker: [
            'Victim opens the link; the AiTM proxy renders a pixel-perfect Microsoft sign-in and relays every request to the real endpoint.',
            'The user completes MFA legitimately, the attacker captures the resulting session cookie / token.',
          ],
          controls: [
            {
              fn: 'prevent',
              product: 'MDE',
              name: 'Network protection + web content filtering',
              note: 'Block newly-registered and parked domain categories in block mode, most AiTM sites fall in these buckets.',
              docs: [
                {
                  label: 'Network protection',
                  url: 'https://learn.microsoft.com/en-us/defender-endpoint/network-protection',
                },
                {
                  label: 'Web content filtering',
                  url: 'https://learn.microsoft.com/en-us/defender-endpoint/web-content-filtering',
                },
              ],
            },
            {
              fn: 'prevent',
              product: 'MDE',
              name: 'SmartScreen + ASR + tamper protection',
              note: 'SmartScreen blocks known AiTM URLs; ASR + tamper protection reduce follow-on execution.',
              docs: [
                {
                  label: 'Attack surface reduction rules',
                  url: 'https://learn.microsoft.com/en-us/defender-endpoint/attack-surface-reduction',
                },
              ],
            },
          ],
          refs: [
            {
              label: 'Defender for Endpoint documentation',
              url: 'https://learn.microsoft.com/en-us/defender-endpoint/microsoft-defender-endpoint',
              by: 'Microsoft',
            },
          ],
        },
        proxy: {
          stage: 'Credential Access & Evasion, the pivot',
          attacker: [
            'Evilginx-style reverse proxy sits between victim and Microsoft, harvesting the authenticated session cookie.',
            'With the cookie the attacker never needs the password or a second factor again — this is why plain MFA does not stop AiTM.',
          ],
          controls: [
            {
              fn: 'prevent',
              product: 'Entra ID',
              name: 'Phishing-resistant MFA (device-bound passkeys / FIDO2 / WHFB / CBA)',
              note: 'The one control that fully breaks AiTM: the authenticator verifies the real server, so the proxied sign-in never completes.',
              docs: [
                {
                  label: 'Passkeys in Entra ID',
                  url: 'https://learn.microsoft.com/en-us/entra/identity/authentication/concept-authentication-passwordless',
                },
                {
                  label: 'Jeffrey Appel: beat AiTM with phishing-resistant MFA',
                  url: 'https://jeffreyappel.nl/protect-against-aitm-mfa-phishing-attacks-using-microsoft-technology/',
                },
              ],
            },
          ],
          refs: [
            {
              label: 'Using Conditional Access to combat token theft',
              url: 'https://practical365.com/using-conditional-access-to-combat-token-theft/',
              by: 'Thijs Lecomte',
            },
          ],
        },
        entra: {
          stage: 'MFA Bypass, session replayed into the cloud',
          attacker: [
            'The stolen cookie is replayed to Entra ID and Microsoft 365. The sign-in looks successful; MFA shows as satisfied.',
            'Often the only tells are a new IP / ISP / device fingerprint and an anomalous risk score.',
          ],
          controls: [
            {
              fn: 'prevent',
              product: 'Entra ID',
              name: 'Token protection (sign-in session binding)',
              note: "Binds the refresh token to the device so a lifted token can't be replayed elsewhere.",
              docs: [
                {
                  label: 'Practical365: Conditional Access vs token theft',
                  url: 'https://practical365.com/using-conditional-access-to-combat-token-theft/',
                },
              ],
            },
            {
              fn: 'prevent',
              product: 'Entra ID',
              name: 'Require compliant / Hybrid-joined device',
              note: 'A CA grant for managed devices means a stolen cookie replayed from attacker hardware is rejected.',
              docs: [
                {
                  label: 'Require device to be compliant',
                  url: 'https://learn.microsoft.com/en-us/entra/identity/conditional-access/policy-all-users-device-compliance',
                },
              ],
            },
            {
              fn: 'detect',
              product: 'Entra ID Protection',
              name: 'Risk-based Conditional Access',
              note: 'High sign-in risk (unfamiliar location/ISP, token anomalies) forces re-auth or block.',
              docs: [
                {
                  label: 'Jeffrey Appel: modern identity attacks',
                  url: 'https://jeffreyappel.nl/tips-for-preventing-against-new-modern-identity-attacks-aitm-mfa-fatigue-prt-oauth/',
                },
              ],
            },
            {
              fn: 'respond',
              product: 'Defender XDR',
              name: 'Attack disruption, revoke session, disable user',
              note: 'On a confirmed AiTM incident, XDR revokes tokens and disables the account automatically.',
              docs: [
                {
                  label: 'Automatic attack disruption',
                  url: 'https://learn.microsoft.com/en-us/defender-xdr/automatic-attack-disruption',
                },
              ],
            },
          ],
          hunt: [
            {
              name: 'Successful sign-in flagged risky (possible replay)',
              kql: 'SigninLogs\n| where ResultType == 0\n| where RiskLevelDuringSignIn == "high" or RiskState == "atRisk"\n| project TimeGenerated, UserPrincipalName, IPAddress, Location, AppDisplayName, AuthenticationRequirement',
            },
          ],
          refs: [
            {
              label: 'DART, Token tactics: prevent, detect, respond',
              url: 'https://www.microsoft.com/en-us/security/blog/2022/11/16/token-tactics-how-to-prevent-detect-and-respond-to-cloud-token-theft/',
              by: 'Microsoft',
            },
            {
              label: 'Tips vs modern identity attacks (AiTM, PRT, OAuth)',
              url: 'https://jeffreyappel.nl/tips-for-preventing-against-new-modern-identity-attacks-aitm-mfa-fatigue-prt-oauth/',
              by: 'Jeffrey Appel',
            },
          ],
        },
        app: {
          stage: 'Optional branch, OAuth / service-principal persistence',
          attacker: [
            'Worth knowing, but not what this campaign did: the Jan-2026 SharePoint case kept persistence with inbox rules and MFA tampering, not OAuth apps.',
            'When it does happen: the attacker consents to a malicious OAuth app, or quietly adds a client secret / certificate to an existing app or service principal.',
          ],
          controls: [
            {
              fn: 'prevent',
              product: 'Entra ID',
              name: 'Restrict user consent + admin consent workflow',
              note: "Users can't consent to unverified apps; risky grants route to an admin for review.",
              docs: [
                {
                  label: 'Jeffrey Appel: OAuth consent & app attacks',
                  url: 'https://jeffreyappel.nl/tips-for-preventing-against-new-modern-identity-attacks-aitm-mfa-fatigue-prt-oauth/',
                },
              ],
            },
            {
              fn: 'prevent',
              product: 'Entra ID',
              name: 'Kill long-lived secrets, managed identities / federated creds',
              note: "Prefer managed identity or workload-identity federation so there's no static secret to leak.",
              docs: [
                {
                  label: 'Managed identities',
                  url: 'https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/overview',
                },
              ],
            },
            {
              fn: 'detect',
              product: 'Entra ID Protection',
              name: 'Workload identity risk',
              note: 'Flags leaked credentials and odd service-principal sign-ins.',
              docs: [
                {
                  label: 'Securing workload identities',
                  url: 'https://learn.microsoft.com/en-us/entra/id-protection/concept-workload-identity-risk',
                },
              ],
            },
          ],
          refs: [
            {
              label: 'OAuth app attacks & consent phishing guidance',
              url: 'https://jeffreyappel.nl/tips-for-preventing-against-new-modern-identity-attacks-aitm-mfa-fatigue-prt-oauth/',
              by: 'Jeffrey Appel',
            },
          ],
        },
        m365: {
          stage: 'Collection, mailbox & document access',
          attacker: [
            'Reads mail and sets hidden inbox rules, then works through the connected apps looking for anything useful.',
            'Uses the live session (or the consented app) to bulk-download before anyone notices.',
          ],
          controls: [
            {
              fn: 'detect',
              product: 'MDCA',
              name: 'Session policies + built-in inbox-rule detection',
              note: "Real-time session control (via CA app control) can watch or block downloads during a risky session. The built-in 'Suspicious inbox manipulation rule' policy catches hide-and-delete rules.",
              docs: [
                {
                  label: 'Defender for Cloud Apps overview',
                  url: 'https://learn.microsoft.com/en-us/defender-cloud-apps/what-is-defender-for-cloud-apps',
                },
              ],
            },
          ],
        },
        impact: {
          stage: 'Exfiltration / Impact, the objective',
          attacker: [
            "The mailbox becomes the weapon. Attackers set a hide-and-delete inbox rule, then blast phishing to the victim's own contacts and distribution lists.",
            "From there it's classic BEC: redirect payments, impersonate suppliers, quietly delete replies asking 'is this real?'",
          ],
          controls: [
            {
              fn: 'respond',
              product: 'Defender XDR',
              name: 'Incident response playbook',
              note: "Password reset isn't enough for AiTM — revoke the session cookies, pull the attacker's inbox rules and any MFA changes.",
              docs: [
                {
                  label: 'Respond to a compromised account',
                  url: 'https://learn.microsoft.com/en-us/defender-office-365/responding-to-a-compromised-email-account',
                },
              ],
            },
            {
              fn: 'detect',
              product: 'MDCA',
              name: 'Suspicious inbox-manipulation rule',
              note: 'Defender for Cloud Apps catches the hide-and-delete rules attackers set to stay quiet.',
              docs: [
                {
                  label: 'Investigate inbox-manipulation rules',
                  url: 'https://learn.microsoft.com/en-us/defender-xdr/alert-grading-playbook-inbox-manipulation-rules',
                },
              ],
            },
          ],
          refs: [
            {
              label: 'From cookie theft to BEC (MSTIC)',
              url: 'https://www.microsoft.com/en-us/security/blog/2022/07/12/from-cookie-theft-to-bec-attackers-use-aitm-phishing-sites-as-entry-point-to-further-financial-fraud/',
              by: 'Microsoft',
            },
          ],
        },
        siem: {
          stage: 'Detection & Response overlay, where the SOC plugs in',
          attacker: [
            'Identity, endpoint, email and cloud-app signals all land here, so the SOC can correlate, hunt, and respond from one place.',
          ],
          controls: [
            {
              fn: 'detect',
              product: 'Defender XDR',
              name: 'Named AiTM alerts, one incident',
              note: "Cross-domain signals raise alerts like 'Possible AiTM phishing attempt' and 'Stolen session cookie was used', rolled into a single incident.",
              docs: [
                {
                  label: 'Microsoft Defender XDR',
                  url: 'https://learn.microsoft.com/en-us/defender-xdr/microsoft-365-defender',
                },
              ],
            },
            {
              fn: 'respond',
              product: 'Defender XDR',
              name: 'Attack disruption + ZAP',
              note: 'XDR can auto-disrupt the AiTM session and fire zero-hour auto purge to pull back phishing mail.',
              docs: [
                {
                  label: 'Automatic attack disruption',
                  url: 'https://learn.microsoft.com/en-us/defender-xdr/automatic-attack-disruption',
                },
              ],
            },
            {
              fn: 'detect',
              product: 'Defender XDR',
              name: 'Advanced hunting',
              note: 'One KQL surface across identity, email and endpoint.',
              docs: [
                {
                  label: 'Advanced hunting',
                  url: 'https://learn.microsoft.com/en-us/defender-xdr/advanced-hunting-overview',
                },
              ],
            },
            {
              fn: 'detect',
              product: 'Sentinel',
              name: 'SIEM correlation + retention',
              note: 'Sitting behind Defender XDR: templated analytics and long-term retention across non-Microsoft logs.',
              docs: [
                {
                  label: 'Microsoft Sentinel overview',
                  url: 'https://learn.microsoft.com/en-us/azure/sentinel/overview',
                },
              ],
            },
          ],
          refs: [
            {
              label: 'Microsoft Cybersecurity Reference Architectures (MCRA)',
              url: 'https://aka.ms/MCRA',
              by: 'Microsoft',
            },
            {
              label: 'Multistage AiTM phishing & BEC abusing SharePoint (Jan 2026)',
              url: 'https://www.microsoft.com/en-us/security/blog/2026/01/21/multistage-aitm-phishing-bec-campaign-abusing-sharepoint/',
              by: 'Microsoft',
            },
          ],
        },
      },
    },
  ],
};
