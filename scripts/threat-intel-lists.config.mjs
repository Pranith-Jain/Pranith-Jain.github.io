/**
 * Curated list of detection-list CSVs to ingest from
 * mthcht/awesome-lists (MIT, https://github.com/mthcht/awesome-lists).
 *
 * Shared by scripts/sync-threat-intel.mjs (downloads the raw CSVs) and
 * scripts/build-threat-intel.mjs (parses them into per-slug JSON).
 *
 * Each CSV follows the upstream convention: the first column is the
 * indicator value (pipe name, port, user-agent, …) and the remaining
 * `metadata_*` columns carry description / tool / category / severity /
 * link / reference / regex, etc.  The column names vary slightly between
 * lists (e.g. `metatada_category` typo in the ports list) so the build
 * script normalises them.
 *
 * We deliberately skip the auto-updated IP/ASN/TLD/VPN/TOR sub-directories
 * — those are huge and better served as live lookups, not static JSON.
 */
export const AWESOME_LISTS_RAW_BASE =
  'https://raw.githubusercontent.com/mthcht/awesome-lists/main/Lists';

/**
 * @typedef {Object} DetectionListConfig
 * @property {string} slug        - URL-safe slug, also the output filename
 * @property {string} title       - human-readable title
 * @property {string} category    - grouping: windows | network | ransomware | hardware | cloud | general
 * @property {string} sourceFile  - filename in the upstream Lists/ directory
 * @property {string} valueColumn - name of the first column (the indicator value)
 * @property {string} description - short description for the index
 */

/** @type {DetectionListConfig[]} */
export const DETECTION_LISTS = [
  {
    slug: 'suspicious-named-pipes',
    title: 'Suspicious Named Pipes',
    category: 'windows',
    sourceFile: 'suspicious_named_pipe_list.csv',
    valueColumn: 'pipe_name',
    description: 'Named pipes used by malware, C2 frameworks, and offensive tools (CobaltStrike, Meterpreter, Potato family, etc.).',
  },
  {
    slug: 'suspicious-ports',
    title: 'Suspicious Destination Ports',
    category: 'network',
    sourceFile: 'suspicious_ports_list.csv',
    valueColumn: 'dest_port',
    description: 'Network ports associated with malware C2, RATs, RMM tools, and exploitation frameworks.',
  },
  {
    slug: 'suspicious-windows-services',
    title: 'Suspicious Windows Services',
    category: 'windows',
    sourceFile: 'suspicious_windows_services_names_list.csv',
    valueColumn: 'service_name',
    description: 'Windows service names used by malware, offensive tools, and greyware for persistence.',
  },
  {
    slug: 'suspicious-windows-tasks',
    title: 'Suspicious Scheduled Tasks',
    category: 'windows',
    sourceFile: 'suspicious_windows_tasks_list.csv',
    valueColumn: 'task_name',
    description: 'Scheduled task names used for persistence by malware and offensive tools.',
  },
  {
    slug: 'suspicious-firewall-rules',
    title: 'Suspicious Firewall Rules',
    category: 'windows',
    sourceFile: 'suspicious_windows_firewall_rules_list.csv',
    valueColumn: 'firewall_rule',
    description: 'Windows firewall rule names associated with malware and offensive tooling.',
  },
  {
    slug: 'suspicious-mutex-names',
    title: 'Suspicious Mutex Names',
    category: 'windows',
    sourceFile: 'suspicious_mutex_names_list.csv',
    valueColumn: 'mutex_name',
    description: 'Mutex / event names used by malware families for single-instance checks and synchronization.',
  },
  {
    slug: 'suspicious-usb-ids',
    title: 'Suspicious USB IDs',
    category: 'hardware',
    sourceFile: 'suspicious_usb_ids_list.csv',
    valueColumn: 'usb_id',
    description: 'USB vendor/product IDs associated with offensive hardware (Rubber Ducky, Bash Bunny, etc.).',
  },
  {
    slug: 'suspicious-mac-addresses',
    title: 'Suspicious MAC Addresses',
    category: 'network',
    sourceFile: 'suspicious_mac_address_list.csv',
    valueColumn: 'mac_address',
    description: 'MAC address OUIs associated with virtualization, spoofing tools, and suspicious hardware.',
  },
  {
    slug: 'suspicious-hostnames',
    title: 'Suspicious Hostnames',
    category: 'network',
    sourceFile: 'suspicious_hostnames_list.csv',
    valueColumn: 'hostname',
    description: 'Hostnames associated with malware, C2, and offensive tooling.',
  },
  {
    slug: 'ransomware-extensions',
    title: 'Ransomware File Extensions',
    category: 'ransomware',
    sourceFile: 'ransomware_extensions_list.csv',
    valueColumn: 'extension',
    description: 'File extensions appended by known ransomware families during encryption.',
  },
  {
    slug: 'ransomware-notes',
    title: 'Ransomware Note Filenames',
    category: 'ransomware',
    sourceFile: 'ransomware_notes_list.csv',
    valueColumn: 'note_name',
    description: 'Ransom note filenames dropped by known ransomware families.',
  },
  {
    slug: 'windows-asr-rules',
    title: 'Windows ASR Rules',
    category: 'windows',
    sourceFile: 'windows_asr_rules.csv',
    valueColumn: 'asr_rule',
    description: 'Microsoft Defender Attack Surface Reduction (ASR) rule GUIDs and descriptions.',
  },
  {
    slug: 'suspicious-double-extensions',
    title: 'Suspicious Double Extensions',
    category: 'windows',
    sourceFile: 'suspicious_file_double_extension.csv',
    valueColumn: 'extension',
    description: 'Double file extensions used to disguise executables as documents (e.g. invoice.pdf.exe).',
  },
  {
    slug: 'suspicious-tlds',
    title: 'Suspicious TLDs',
    category: 'network',
    sourceFile: 'suspicious_tlds_list.csv',
    valueColumn: 'tld',
    description: 'Top-level domains frequently abused for phishing, malware, and spam.',
  },
  {
    slug: 'lolc2-abused-domains',
    title: 'LOLC2 Abused Domains',
    category: 'network',
    sourceFile: 'lolc2_abused_domains.csv',
    valueColumn: 'domain',
    description: 'Legitimate domains abused by C2 frameworks for traffic relay (LOLC2 project).',
  },
  {
    slug: 'suspicious-user-agents',
    title: 'Suspicious HTTP User-Agents',
    category: 'network',
    sourceFile: 'suspicious_http_user_agents_list.csv',
    valueColumn: 'http_user_agent',
    description: 'HTTP user-agent strings associated with malware, scanners, offensive tools, and phishing kits.',
  },
  {
    slug: 'microsoft-app-ids',
    title: 'Microsoft App IDs (BEC Detection)',
    category: 'cloud',
    sourceFile: 'microsoft_apps_list.csv',
    valueColumn: 'app_id',
    description: 'Microsoft Entra ID application IDs for Business Email Compromise (BEC) detection.',
  },
  {
    slug: 'dns-over-https-servers',
    title: 'DNS-over-HTTPS Servers',
    category: 'network',
    sourceFile: 'dns_over_https_servers_list.csv',
    valueColumn: 'doh_server',
    description: 'DNS-over-HTTPS server endpoints that can be abused for C2 traffic exfiltration.',
  },
];
