#!/usr/bin/env node
/**
 * Build the detection.wiki manifest tree under public/data/detection-wiki/.
 *
 * detection.wiki is behind Cloudflare JS protection so raw fetch() gets a
 * challenge page. The data below was extracted via headless browser from:
 *   - https://detection.wiki/        (platform catalog)
 *   - https://detection.wiki/rules/  (MITRE ATT&CK matrix, 15,957 rules)
 *   - https://detection.wiki/labs/   (detection labs)
 *
 * Run:  node scripts/build-detection-wiki.mjs
 *
 * Emits:
 *   public/data/detection-wiki/index.json
 *   public/data/detection-wiki/techniques.json
 *   public/data/detection-wiki/platforms.json
 *   public/data/detection-wiki/labs.json
 *   public/data/detection-wiki/filters.json
 */
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'data', 'detection-wiki');

console.log('🔨 Building detection.wiki manifest');

// Wipe and rebuild
if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

// ── Platform catalog (16 platforms from homepage) ────────────────────
const platforms = [
  { name: 'macOS', slug: 'macos', description: 'Endpoint Security events by domain', events: 14857, rulesWithSamples: 13 },
  { name: 'auditd', slug: 'auditd', description: 'Linux audit record types', events: 20517, rulesWithSamples: 120 },
  { name: 'Sysmon for Linux', slug: 'sysmon-linux', description: 'Sysmon events for Linux endpoints', events: 1410, rulesWithSamples: 3 },
  { name: 'Windows', slug: 'windows', description: 'Windows Event Log providers and events', events: 102294, rulesWithSamples: 1016, totalRules: 1449 },
  { name: 'Microsoft 365', slug: 'microsoft-365', description: 'Microsoft 365 audit log operations', events: 3642, rulesWithSamples: 70, totalRules: 154 },
  { name: 'Entra ID', slug: 'entra-id', description: 'Entra ID directory and sign-in logs', events: 970, rulesWithSamples: 112, totalRules: 116 },
  { name: 'Azure', slug: 'azure', description: 'Azure control plane operations', events: 4210, rulesWithSamples: 195, totalRules: 120 },
  { name: 'Microsoft Intune', slug: 'intune', description: 'Intune device-management audit events', events: 138, rulesWithSamples: 36, totalRules: 12 },
  { name: 'Power Platform', slug: 'power-platform', description: 'Power Platform audit events', events: 214, rulesWithSamples: 5, totalRules: 9 },
  { name: 'Defender XDR', slug: 'defender-xdr', description: 'Defender Advanced Hunting ActionTypes', events: 39213, rulesWithSamples: 570 },
  { name: 'AWS', slug: 'aws', description: 'CloudTrail events by service and API action', events: 178513, rulesWithSamples: 500, totalRules: 564 },
  { name: 'GCP', slug: 'gcp', description: 'Cloud Audit Log operations by service and method', events: 15343, rulesWithSamples: 191, totalRules: 118 },
  { name: 'Google Workspace', slug: 'google-workspace', description: 'Admin SDK events by application and event name', events: 838, rulesWithSamples: 40, totalRules: 80 },
  { name: 'GitHub', slug: 'github', description: 'Audit log actions by category prefix', events: 1161, rulesWithSamples: 36, totalRules: 133 },
  { name: 'Kubernetes', slug: 'kubernetes', description: 'Audit log API operations by resource and verb', events: 7586, rulesWithSamples: 75, totalRules: 154 },
  { name: 'Okta', slug: 'okta', description: 'System Log event types by namespace', events: 1179, rulesWithSamples: 250, totalRules: 98 },
  { name: 'Sublime', slug: 'sublime', description: 'Email detection events', events: 280, rulesWithSamples: 28 },
];

writeFileSync(join(OUT, 'platforms.json'), JSON.stringify(platforms));

// ── MITRE ATT&CK matrix (15,957 rules from /rules/) ─────────────────
const techniques = [
  // Reconnaissance
  { id: 'T1589', name: 'Gather Victim Identity Information', tactic: 'Reconnaissance', ruleCount: 9, isSubtechnique: false },
  { id: 'T1589.001', name: 'Gather Victim Identity Information: Credentials', tactic: 'Reconnaissance', ruleCount: 2, isSubtechnique: true, parentTechnique: 'T1589' },
  { id: 'T1589.002', name: 'Gather Victim Identity Information: Email Addresses', tactic: 'Reconnaissance', ruleCount: 3, isSubtechnique: true, parentTechnique: 'T1589' },
  { id: 'T1589.003', name: 'Gather Victim Identity Information: Employee Names', tactic: 'Reconnaissance', ruleCount: 1, isSubtechnique: true, parentTechnique: 'T1589' },
  { id: 'T1590', name: 'Gather Victim Network Information', tactic: 'Reconnaissance', ruleCount: 18, isSubtechnique: false },
  { id: 'T1590.001', name: 'Gather Victim Network Information: Domain Properties', tactic: 'Reconnaissance', ruleCount: 2, isSubtechnique: true, parentTechnique: 'T1590' },
  { id: 'T1590.002', name: 'Gather Victim Network Information: DNS', tactic: 'Reconnaissance', ruleCount: 2, isSubtechnique: true, parentTechnique: 'T1590' },
  { id: 'T1590.005', name: 'Gather Victim Network Information: IP Addresses', tactic: 'Reconnaissance', ruleCount: 4, isSubtechnique: true, parentTechnique: 'T1590' },
  { id: 'T1591', name: 'Gather Victim Org Information', tactic: 'Reconnaissance', ruleCount: 5, isSubtechnique: false },
  { id: 'T1591.004', name: 'Gather Victim Org Information: Identify Roles', tactic: 'Reconnaissance', ruleCount: 2, isSubtechnique: true, parentTechnique: 'T1591' },
  { id: 'T1592', name: 'Gather Victim Host Information', tactic: 'Reconnaissance', ruleCount: 13, isSubtechnique: false },
  { id: 'T1592.001', name: 'Gather Victim Host Information: Hardware', tactic: 'Reconnaissance', ruleCount: 1, isSubtechnique: true, parentTechnique: 'T1592' },
  { id: 'T1592.002', name: 'Gather Victim Host Information: Software', tactic: 'Reconnaissance', ruleCount: 1, isSubtechnique: true, parentTechnique: 'T1592' },
  { id: 'T1592.004', name: 'Gather Victim Host Information: Client Configurations', tactic: 'Reconnaissance', ruleCount: 5, isSubtechnique: true, parentTechnique: 'T1592' },
  { id: 'T1593', name: 'Search Open Websites/Domains', tactic: 'Reconnaissance', ruleCount: 4, isSubtechnique: false },
  { id: 'T1593.003', name: 'Search Open Websites/Domains: Code Repositories', tactic: 'Reconnaissance', ruleCount: 2, isSubtechnique: true, parentTechnique: 'T1593' },
  { id: 'T1595', name: 'Active Scanning', tactic: 'Reconnaissance', ruleCount: 68, isSubtechnique: false },
  { id: 'T1595.001', name: 'Active Scanning: Scanning IP Blocks', tactic: 'Reconnaissance', ruleCount: 13, isSubtechnique: true, parentTechnique: 'T1595' },
  { id: 'T1595.002', name: 'Active Scanning: Vulnerability Scanning', tactic: 'Reconnaissance', ruleCount: 16, isSubtechnique: true, parentTechnique: 'T1595' },
  { id: 'T1595.003', name: 'Active Scanning: Wordlist Scanning', tactic: 'Reconnaissance', ruleCount: 9, isSubtechnique: true, parentTechnique: 'T1595' },
  { id: 'T1596', name: 'Search Open Technical Databases', tactic: 'Reconnaissance', ruleCount: 1, isSubtechnique: false },
  { id: 'T1598', name: 'Phishing for Information', tactic: 'Reconnaissance', ruleCount: 9, isSubtechnique: false },
  { id: 'T1598.002', name: 'Phishing for Information: Spearphishing Attachment', tactic: 'Reconnaissance', ruleCount: 2, isSubtechnique: true, parentTechnique: 'T1598' },
  // Resource Development
  { id: 'T1583', name: 'Acquire Infrastructure', tactic: 'Resource Development', ruleCount: 6, isSubtechnique: false },
  { id: 'T1583.001', name: 'Acquire Infrastructure: Domains', tactic: 'Resource Development', ruleCount: 1, isSubtechnique: true, parentTechnique: 'T1583' },
  { id: 'T1583.006', name: 'Acquire Infrastructure: Web Services', tactic: 'Resource Development', ruleCount: 2, isSubtechnique: true, parentTechnique: 'T1583' },
  { id: 'T1584', name: 'Compromise Infrastructure', tactic: 'Resource Development', ruleCount: 12, isSubtechnique: false },
  { id: 'T1584.001', name: 'Compromise Infrastructure: Domains', tactic: 'Resource Development', ruleCount: 3, isSubtechnique: true, parentTechnique: 'T1584' },
  { id: 'T1584.002', name: 'Compromise Infrastructure: DNS Server', tactic: 'Resource Development', ruleCount: 1, isSubtechnique: true, parentTechnique: 'T1584' },
  { id: 'T1585', name: 'Establish Accounts', tactic: 'Resource Development', ruleCount: 2, isSubtechnique: false },
  { id: 'T1585.003', name: 'Establish Accounts: Cloud Accounts', tactic: 'Resource Development', ruleCount: 1, isSubtechnique: true, parentTechnique: 'T1585' },
  { id: 'T1586', name: 'Compromise Accounts', tactic: 'Resource Development', ruleCount: 41, isSubtechnique: false },
  { id: 'T1586.003', name: 'Compromise Accounts: Cloud Accounts', tactic: 'Resource Development', ruleCount: 36, isSubtechnique: true, parentTechnique: 'T1586' },
  { id: 'T1587', name: 'Develop Capabilities', tactic: 'Resource Development', ruleCount: 24, isSubtechnique: false },
  { id: 'T1587.001', name: 'Develop Capabilities: Malware', tactic: 'Resource Development', ruleCount: 14, isSubtechnique: true, parentTechnique: 'T1587' },
  { id: 'T1587.002', name: 'Develop Capabilities: Code Signing Certificates', tactic: 'Resource Development', ruleCount: 1, isSubtechnique: true, parentTechnique: 'T1587' },
  { id: 'T1587.003', name: 'Develop Capabilities: Digital Certificates', tactic: 'Resource Development', ruleCount: 1, isSubtechnique: true, parentTechnique: 'T1587' },
  { id: 'T1588', name: 'Obtain Capabilities', tactic: 'Resource Development', ruleCount: 22, isSubtechnique: false },
  { id: 'T1588.001', name: 'Obtain Capabilities: Malware', tactic: 'Resource Development', ruleCount: 2, isSubtechnique: true, parentTechnique: 'T1588' },
  { id: 'T1588.002', name: 'Obtain Capabilities: Tool', tactic: 'Resource Development', ruleCount: 13, isSubtechnique: true, parentTechnique: 'T1588' },
  { id: 'T1588.004', name: 'Obtain Capabilities: Digital Certificates', tactic: 'Resource Development', ruleCount: 1, isSubtechnique: true, parentTechnique: 'T1588' },
  { id: 'T1608', name: 'Stage Capabilities', tactic: 'Resource Development', ruleCount: 14, isSubtechnique: false },
  { id: 'T1608.001', name: 'Stage Capabilities: Upload Malware', tactic: 'Resource Development', ruleCount: 3, isSubtechnique: true, parentTechnique: 'T1608' },
  { id: 'T1608.002', name: 'Stage Capabilities: Upload Tool', tactic: 'Resource Development', ruleCount: 1, isSubtechnique: true, parentTechnique: 'T1608' },
  { id: 'T1608.003', name: 'Stage Capabilities: Install Digital Certificate', tactic: 'Resource Development', ruleCount: 1, isSubtechnique: true, parentTechnique: 'T1608' },
  // Initial Access
  { id: 'T1078', name: 'Valid Accounts', tactic: 'Initial Access', ruleCount: 778, isSubtechnique: false },
  { id: 'T1078.001', name: 'Valid Accounts: Default Accounts', tactic: 'Initial Access', ruleCount: 17, isSubtechnique: true, parentTechnique: 'T1078' },
  { id: 'T1078.002', name: 'Valid Accounts: Domain Accounts', tactic: 'Initial Access', ruleCount: 35, isSubtechnique: true, parentTechnique: 'T1078' },
  { id: 'T1078.003', name: 'Valid Accounts: Local Accounts', tactic: 'Initial Access', ruleCount: 23, isSubtechnique: true, parentTechnique: 'T1078' },
  { id: 'T1078.004', name: 'Valid Accounts: Cloud Accounts', tactic: 'Initial Access', ruleCount: 311, isSubtechnique: true, parentTechnique: 'T1078' },
  { id: 'T1091', name: 'Replication Through Removable Media', tactic: 'Initial Access', ruleCount: 11, isSubtechnique: false },
  { id: 'T1133', name: 'External Remote Services', tactic: 'Initial Access', ruleCount: 222, isSubtechnique: false },
  { id: 'T1189', name: 'Drive-by Compromise', tactic: 'Initial Access', ruleCount: 46, isSubtechnique: false },
  { id: 'T1190', name: 'Exploit Public-Facing Application', tactic: 'Initial Access', ruleCount: 549, isSubtechnique: false },
  { id: 'T1195', name: 'Supply Chain Compromise', tactic: 'Initial Access', ruleCount: 97, isSubtechnique: false },
  { id: 'T1195.001', name: 'Supply Chain Compromise: Compromise Software Dependencies and Development Tools', tactic: 'Initial Access', ruleCount: 21, isSubtechnique: true, parentTechnique: 'T1195' },
  { id: 'T1195.002', name: 'Supply Chain Compromise: Compromise Software Supply Chain', tactic: 'Initial Access', ruleCount: 56, isSubtechnique: true, parentTechnique: 'T1195' },
  { id: 'T1199', name: 'Trusted Relationship', tactic: 'Initial Access', ruleCount: 18, isSubtechnique: false },
  { id: 'T1200', name: 'Hardware Additions', tactic: 'Initial Access', ruleCount: 15, isSubtechnique: false },
  { id: 'T1566', name: 'Phishing', tactic: 'Initial Access', ruleCount: 351, isSubtechnique: false },
  { id: 'T1566.001', name: 'Phishing: Spearphishing Attachment', tactic: 'Initial Access', ruleCount: 164, isSubtechnique: true, parentTechnique: 'T1566' },
  { id: 'T1566.002', name: 'Phishing: Spearphishing Link', tactic: 'Initial Access', ruleCount: 78, isSubtechnique: true, parentTechnique: 'T1566' },
  { id: 'T1566.003', name: 'Phishing: Spearphishing via Service', tactic: 'Initial Access', ruleCount: 2, isSubtechnique: true, parentTechnique: 'T1566' },
  { id: 'T1659', name: 'Content Injection', tactic: 'Initial Access', ruleCount: 4, isSubtechnique: false },
  // Execution
  { id: 'T1047', name: 'Windows Management Instrumentation', tactic: 'Execution', ruleCount: 140, isSubtechnique: false },
  { id: 'T1053', name: 'Scheduled Task/Job', tactic: 'Execution', ruleCount: 222, isSubtechnique: false },
  { id: 'T1053.002', name: 'Scheduled Task/Job: At', tactic: 'Execution', ruleCount: 19, isSubtechnique: true, parentTechnique: 'T1053' },
  { id: 'T1053.003', name: 'Scheduled Task/Job: Cron', tactic: 'Execution', ruleCount: 38, isSubtechnique: true, parentTechnique: 'T1053' },
  { id: 'T1053.005', name: 'Scheduled Task/Job: Scheduled Task', tactic: 'Execution', ruleCount: 130, isSubtechnique: true, parentTechnique: 'T1053' },
  { id: 'T1053.006', name: 'Scheduled Task/Job: Systemd Timers', tactic: 'Execution', ruleCount: 6, isSubtechnique: true, parentTechnique: 'T1053' },
  { id: 'T1053.007', name: 'Scheduled Task/Job: Container Orchestration Job', tactic: 'Execution', ruleCount: 4, isSubtechnique: true, parentTechnique: 'T1053' },
  { id: 'T1059', name: 'Command and Scripting Interpreter', tactic: 'Execution', ruleCount: 1505, isSubtechnique: false },
  { id: 'T1059.001', name: 'Command and Scripting Interpreter: PowerShell', tactic: 'Execution', ruleCount: 551, isSubtechnique: true, parentTechnique: 'T1059' },
  { id: 'T1059.002', name: 'Command and Scripting Interpreter: AppleScript', tactic: 'Execution', ruleCount: 49, isSubtechnique: true, parentTechnique: 'T1059' },
  { id: 'T1059.003', name: 'Command and Scripting Interpreter: Windows Command Shell', tactic: 'Execution', ruleCount: 179, isSubtechnique: true, parentTechnique: 'T1059' },
  { id: 'T1059.004', name: 'Command and Scripting Interpreter: Unix Shell', tactic: 'Execution', ruleCount: 341, isSubtechnique: true, parentTechnique: 'T1059' },
  { id: 'T1059.005', name: 'Command and Scripting Interpreter: Visual Basic', tactic: 'Execution', ruleCount: 113, isSubtechnique: true, parentTechnique: 'T1059' },
  { id: 'T1059.006', name: 'Command and Scripting Interpreter: Python', tactic: 'Execution', ruleCount: 88, isSubtechnique: true, parentTechnique: 'T1059' },
  { id: 'T1059.007', name: 'Command and Scripting Interpreter: JavaScript', tactic: 'Execution', ruleCount: 157, isSubtechnique: true, parentTechnique: 'T1059' },
  { id: 'T1059.009', name: 'Command and Scripting Interpreter: Cloud API', tactic: 'Execution', ruleCount: 6, isSubtechnique: true, parentTechnique: 'T1059' },
  { id: 'T1059.010', name: 'Command and Scripting Interpreter: AutoHotKey & AutoIT', tactic: 'Execution', ruleCount: 1, isSubtechnique: true, parentTechnique: 'T1059' },
  { id: 'T1059.011', name: 'Command and Scripting Interpreter: Lua', tactic: 'Execution', ruleCount: 14, isSubtechnique: true, parentTechnique: 'T1059' },
  { id: 'T1059.012', name: 'Command and Scripting Interpreter: Hypervisor CLI', tactic: 'Execution', ruleCount: 9, isSubtechnique: true, parentTechnique: 'T1059' },
  { id: 'T1059.013', name: 'Command and Scripting Interpreter: Container CLI/API', tactic: 'Execution', ruleCount: 1, isSubtechnique: true, parentTechnique: 'T1059' },
  { id: 'T1072', name: 'Software Deployment Tools', tactic: 'Execution', ruleCount: 30, isSubtechnique: false },
  { id: 'T1106', name: 'Native API', tactic: 'Execution', ruleCount: 58, isSubtechnique: false },
  { id: 'T1127', name: 'Trusted Developer Utilities Proxy Execution', tactic: 'Execution', ruleCount: 59, isSubtechnique: false },
  { id: 'T1127.001', name: 'Trusted Developer Utilities Proxy Execution: MSBuild', tactic: 'Execution', ruleCount: 23, isSubtechnique: true, parentTechnique: 'T1127' },
  { id: 'T1127.002', name: 'Trusted Developer Utilities Proxy Execution: ClickOnce', tactic: 'Execution', ruleCount: 1, isSubtechnique: true, parentTechnique: 'T1127' },
  { id: 'T1129', name: 'Shared Modules', tactic: 'Execution', ruleCount: 23, isSubtechnique: false },
  { id: 'T1197', name: 'BITS Jobs', tactic: 'Execution', ruleCount: 39, isSubtechnique: false },
  { id: 'T1203', name: 'Exploitation for Client Execution', tactic: 'Execution', ruleCount: 129, isSubtechnique: false },
  { id: 'T1204', name: 'User Execution', tactic: 'Execution', ruleCount: 322, isSubtechnique: false },
  { id: 'T1204.001', name: 'User Execution: Malicious Link', tactic: 'Execution', ruleCount: 31, isSubtechnique: true, parentTechnique: 'T1204' },
  { id: 'T1204.002', name: 'User Execution: Malicious File', tactic: 'Execution', ruleCount: 190, isSubtechnique: true, parentTechnique: 'T1204' },
  { id: 'T1204.003', name: 'User Execution: Malicious Image', tactic: 'Execution', ruleCount: 10, isSubtechnique: true, parentTechnique: 'T1204' },
  { id: 'T1204.004', name: 'User Execution: Malicious Copy and Paste', tactic: 'Execution', ruleCount: 10, isSubtechnique: true, parentTechnique: 'T1204' },
  { id: 'T1204.005', name: 'User Execution: Malicious Library', tactic: 'Execution', ruleCount: 1, isSubtechnique: true, parentTechnique: 'T1204' },
  { id: 'T1559', name: 'Inter-Process Communication', tactic: 'Execution', ruleCount: 38, isSubtechnique: false },
  { id: 'T1559.001', name: 'Inter-Process Communication: Component Object Model', tactic: 'Execution', ruleCount: 19, isSubtechnique: true, parentTechnique: 'T1559' },
  { id: 'T1559.002', name: 'Inter-Process Communication: Dynamic Data Exchange', tactic: 'Execution', ruleCount: 1, isSubtechnique: true, parentTechnique: 'T1559' },
  { id: 'T1559.003', name: 'Inter-Process Communication: XPC Services', tactic: 'Execution', ruleCount: 4, isSubtechnique: true, parentTechnique: 'T1559' },
  { id: 'T1569', name: 'System Services', tactic: 'Execution', ruleCount: 106, isSubtechnique: false },
  { id: 'T1569.001', name: 'System Services: Launchctl', tactic: 'Execution', ruleCount: 4, isSubtechnique: true, parentTechnique: 'T1569' },
  { id: 'T1569.002', name: 'System Services: Service Execution', tactic: 'Execution', ruleCount: 87, isSubtechnique: true, parentTechnique: 'T1569' },
  { id: 'T1574', name: 'Hijack Execution Flow', tactic: 'Execution', ruleCount: 321, isSubtechnique: false },
  { id: 'T1574.001', name: 'Hijack Execution Flow: DLL', tactic: 'Execution', ruleCount: 173, isSubtechnique: true, parentTechnique: 'T1574' },
  { id: 'T1574.006', name: 'Hijack Execution Flow: Dynamic Linker Hijacking', tactic: 'Execution', ruleCount: 26, isSubtechnique: true, parentTechnique: 'T1574' },
  { id: 'T1574.007', name: 'Hijack Execution Flow: Path Interception by PATH Environment Variable', tactic: 'Execution', ruleCount: 11, isSubtechnique: true, parentTechnique: 'T1574' },
  { id: 'T1574.011', name: 'Hijack Execution Flow: Services Registry Permissions Weakness', tactic: 'Execution', ruleCount: 17, isSubtechnique: true, parentTechnique: 'T1574' },
  { id: 'T1609', name: 'Container Administration Command', tactic: 'Execution', ruleCount: 36, isSubtechnique: false },
  { id: 'T1610', name: 'Deploy Container', tactic: 'Execution', ruleCount: 33, isSubtechnique: false },
  { id: 'T1648', name: 'Serverless Execution', tactic: 'Execution', ruleCount: 17, isSubtechnique: false },
  { id: 'T1651', name: 'Cloud Administration Command', tactic: 'Execution', ruleCount: 27, isSubtechnique: false },
  // Persistence
  { id: 'T1037', name: 'Boot or Logon Initialization Scripts', tactic: 'Persistence', ruleCount: 52, isSubtechnique: false },
  { id: 'T1098', name: 'Account Manipulation', tactic: 'Persistence', ruleCount: 564, isSubtechnique: false },
  { id: 'T1098.001', name: 'Account Manipulation: Additional Cloud Credentials', tactic: 'Persistence', ruleCount: 59, isSubtechnique: true, parentTechnique: 'T1098' },
  { id: 'T1098.003', name: 'Account Manipulation: Additional Cloud Roles', tactic: 'Persistence', ruleCount: 111, isSubtechnique: true, parentTechnique: 'T1098' },
  { id: 'T1136', name: 'Create Account', tactic: 'Persistence', ruleCount: 159, isSubtechnique: false },
  { id: 'T1136.001', name: 'Create Account: Local Account', tactic: 'Persistence', ruleCount: 48, isSubtechnique: true, parentTechnique: 'T1136' },
  { id: 'T1136.003', name: 'Create Account: Cloud Account', tactic: 'Persistence', ruleCount: 56, isSubtechnique: true, parentTechnique: 'T1136' },
  { id: 'T1505', name: 'Server Software Component', tactic: 'Persistence', ruleCount: 158, isSubtechnique: false },
  { id: 'T1505.003', name: 'Server Software Component: Web Shell', tactic: 'Persistence', ruleCount: 86, isSubtechnique: true, parentTechnique: 'T1505' },
  { id: 'T1543', name: 'Create or Modify System Process', tactic: 'Persistence', ruleCount: 251, isSubtechnique: false },
  { id: 'T1543.003', name: 'Create or Modify System Process: Windows Service', tactic: 'Persistence', ruleCount: 134, isSubtechnique: true, parentTechnique: 'T1543' },
  { id: 'T1546', name: 'Event Triggered Execution', tactic: 'Persistence', ruleCount: 241, isSubtechnique: false },
  { id: 'T1547', name: 'Boot or Logon Autostart Execution', tactic: 'Persistence', ruleCount: 252, isSubtechnique: false },
  { id: 'T1547.001', name: 'Boot or Logon Autostart Execution: Registry Run Keys / Startup Folder', tactic: 'Persistence', ruleCount: 115, isSubtechnique: true, parentTechnique: 'T1547' },
  { id: 'T1547.006', name: 'Boot or Logon Autostart Execution: Kernel Modules and Extensions', tactic: 'Persistence', ruleCount: 37, isSubtechnique: true, parentTechnique: 'T1547' },
  { id: 'T1556', name: 'Modify Authentication Process', tactic: 'Persistence', ruleCount: 157, isSubtechnique: false },
  { id: 'T1556.006', name: 'Modify Authentication Process: Multi-Factor Authentication', tactic: 'Persistence', ruleCount: 33, isSubtechnique: true, parentTechnique: 'T1556' },
  // Privilege Escalation
  { id: 'T1055', name: 'Process Injection', tactic: 'Privilege Escalation', ruleCount: 329, isSubtechnique: false },
  { id: 'T1055.012', name: 'Process Injection: Process Hollowing', tactic: 'Privilege Escalation', ruleCount: 11, isSubtechnique: true, parentTechnique: 'T1055' },
  { id: 'T1068', name: 'Exploitation for Privilege Escalation', tactic: 'Privilege Escalation', ruleCount: 231, isSubtechnique: false },
  { id: 'T1134', name: 'Access Token Manipulation', tactic: 'Privilege Escalation', ruleCount: 96, isSubtechnique: false },
  { id: 'T1134.001', name: 'Access Token Manipulation: Token Impersonation/Theft', tactic: 'Privilege Escalation', ruleCount: 31, isSubtechnique: true, parentTechnique: 'T1134' },
  { id: 'T1134.002', name: 'Access Token Manipulation: Create Process with Token', tactic: 'Privilege Escalation', ruleCount: 30, isSubtechnique: true, parentTechnique: 'T1134' },
  { id: 'T1484', name: 'Domain or Tenant Policy Modification', tactic: 'Privilege Escalation', ruleCount: 92, isSubtechnique: false },
  { id: 'T1548', name: 'Abuse Elevation Control Mechanism', tactic: 'Privilege Escalation', ruleCount: 365, isSubtechnique: false },
  { id: 'T1548.001', name: 'Abuse Elevation Control Mechanism: Setuid and Setgid', tactic: 'Privilege Escalation', ruleCount: 44, isSubtechnique: true, parentTechnique: 'T1548' },
  { id: 'T1548.002', name: 'Abuse Elevation Control Mechanism: Bypass User Account Control', tactic: 'Privilege Escalation', ruleCount: 137, isSubtechnique: true, parentTechnique: 'T1548' },
  { id: 'T1548.003', name: 'Abuse Elevation Control Mechanism: Sudo and Sudo Caching', tactic: 'Privilege Escalation', ruleCount: 60, isSubtechnique: true, parentTechnique: 'T1548' },
  { id: 'T1611', name: 'Escape to Host', tactic: 'Privilege Escalation', ruleCount: 62, isSubtechnique: false },
  // Defense Evasion
  { id: 'T1027', name: 'Obfuscated Files or Information', tactic: 'Defense Evasion', ruleCount: 284, isSubtechnique: false },
  { id: 'T1027.010', name: 'Obfuscated Files or Information: Command Obfuscation', tactic: 'Defense Evasion', ruleCount: 40, isSubtechnique: true, parentTechnique: 'T1027' },
  { id: 'T1036', name: 'Masquerading', tactic: 'Defense Evasion', ruleCount: 313, isSubtechnique: false },
  { id: 'T1036.003', name: 'Masquerading: Rename Legitimate Utilities', tactic: 'Defense Evasion', ruleCount: 60, isSubtechnique: true, parentTechnique: 'T1036' },
  { id: 'T1036.005', name: 'Masquerading: Match Legitimate Resource Name or Location', tactic: 'Defense Evasion', ruleCount: 69, isSubtechnique: true, parentTechnique: 'T1036' },
  { id: 'T1070', name: 'Indicator Removal', tactic: 'Defense Evasion', ruleCount: 200, isSubtechnique: false },
  { id: 'T1070.004', name: 'Indicator Removal: File Deletion', tactic: 'Defense Evasion', ruleCount: 59, isSubtechnique: true, parentTechnique: 'T1070' },
  { id: 'T1112', name: 'Modify Registry', tactic: 'Defense Evasion', ruleCount: 307, isSubtechnique: false },
  { id: 'T1140', name: 'Deobfuscate/Decode Files or Information', tactic: 'Defense Evasion', ruleCount: 102, isSubtechnique: false },
  { id: 'T1202', name: 'Indirect Command Execution', tactic: 'Defense Evasion', ruleCount: 71, isSubtechnique: false },
  { id: 'T1218', name: 'System Binary Proxy Execution', tactic: 'Defense Evasion', ruleCount: 672, isSubtechnique: false },
  { id: 'T1218.005', name: 'System Binary Proxy Execution: Mshta', tactic: 'Defense Evasion', ruleCount: 79, isSubtechnique: true, parentTechnique: 'T1218' },
  { id: 'T1218.010', name: 'System Binary Proxy Execution: Regsvr32', tactic: 'Defense Evasion', ruleCount: 69, isSubtechnique: true, parentTechnique: 'T1218' },
  { id: 'T1218.011', name: 'System Binary Proxy Execution: Rundll32', tactic: 'Defense Evasion', ruleCount: 152, isSubtechnique: true, parentTechnique: 'T1218' },
  { id: 'T1497', name: 'Virtualization/Sandbox Evasion', tactic: 'Defense Evasion', ruleCount: 21, isSubtechnique: false },
  { id: 'T1564', name: 'Hide Artifacts', tactic: 'Defense Evasion', ruleCount: 170, isSubtechnique: false },
  { id: 'T1620', name: 'Reflective Code Loading', tactic: 'Defense Evasion', ruleCount: 44, isSubtechnique: false },
  // Credential Access
  { id: 'T1003', name: 'OS Credential Dumping', tactic: 'Credential Access', ruleCount: 423, isSubtechnique: false },
  { id: 'T1003.001', name: 'OS Credential Dumping: LSASS Memory', tactic: 'Credential Access', ruleCount: 176, isSubtechnique: true, parentTechnique: 'T1003' },
  { id: 'T1003.002', name: 'OS Credential Dumping: Security Account Manager', tactic: 'Credential Access', ruleCount: 66, isSubtechnique: true, parentTechnique: 'T1003' },
  { id: 'T1003.003', name: 'OS Credential Dumping: NTDS', tactic: 'Credential Access', ruleCount: 60, isSubtechnique: true, parentTechnique: 'T1003' },
  { id: 'T1003.006', name: 'OS Credential Dumping: DCSync', tactic: 'Credential Access', ruleCount: 26, isSubtechnique: true, parentTechnique: 'T1003' },
  { id: 'T1040', name: 'Network Sniffing', tactic: 'Credential Access', ruleCount: 25, isSubtechnique: false },
  { id: 'T1056', name: 'Input Capture', tactic: 'Credential Access', ruleCount: 35, isSubtechnique: false },
  { id: 'T1110', name: 'Brute Force', tactic: 'Credential Access', ruleCount: 303, isSubtechnique: false },
  { id: 'T1110.001', name: 'Brute Force: Password Guessing', tactic: 'Credential Access', ruleCount: 48, isSubtechnique: true, parentTechnique: 'T1110' },
  { id: 'T1555', name: 'Credentials from Password Stores', tactic: 'Credential Access', ruleCount: 71, isSubtechnique: false },
  { id: 'T1557', name: 'Adversary-in-the-Middle', tactic: 'Credential Access', ruleCount: 44, isSubtechnique: false },
  { id: 'T1558', name: 'Steal or Forge Kerberos Tickets', tactic: 'Credential Access', ruleCount: 45, isSubtechnique: false },
  { id: 'T1621', name: 'Multi-Factor Authentication Request Generation', tactic: 'Credential Access', ruleCount: 11, isSubtechnique: false },
  { id: 'T1649', name: 'Steal or Forge Authentication Certificates', tactic: 'Credential Access', ruleCount: 20, isSubtechnique: false },
  // Discovery
  { id: 'T1046', name: 'Network Service Discovery', tactic: 'Discovery', ruleCount: 62, isSubtechnique: false },
  { id: 'T1069', name: 'Permission Groups Discovery', tactic: 'Discovery', ruleCount: 90, isSubtechnique: false },
  { id: 'T1082', name: 'System Information Discovery', tactic: 'Discovery', ruleCount: 104, isSubtechnique: false },
  { id: 'T1083', name: 'File and Directory Discovery', tactic: 'Discovery', ruleCount: 119, isSubtechnique: false },
  { id: 'T1087', name: 'Account Discovery', tactic: 'Discovery', ruleCount: 144, isSubtechnique: false },
  { id: 'T1482', name: 'Domain Trust Discovery', tactic: 'Discovery', ruleCount: 11, isSubtechnique: false },
  { id: 'T1518', name: 'Software Discovery', tactic: 'Discovery', ruleCount: 50, isSubtechnique: false },
  { id: 'T1614', name: 'System Location Discovery', tactic: 'Discovery', ruleCount: 17, isSubtechnique: false },
  // Lateral Movement
  { id: 'T1021', name: 'Remote Services', tactic: 'Lateral Movement', ruleCount: 298, isSubtechnique: false },
  { id: 'T1021.001', name: 'Remote Services: Remote Desktop Protocol', tactic: 'Lateral Movement', ruleCount: 103, isSubtechnique: true, parentTechnique: 'T1021' },
  { id: 'T1021.002', name: 'Remote Services: SMB/Windows Admin Shares', tactic: 'Lateral Movement', ruleCount: 89, isSubtechnique: true, parentTechnique: 'T1021' },
  { id: 'T1021.006', name: 'Remote Services: Windows Remote Management', tactic: 'Lateral Movement', ruleCount: 61, isSubtechnique: true, parentTechnique: 'T1021' },
  { id: 'T1534', name: 'Internal Spearphishing', tactic: 'Lateral Movement', ruleCount: 5, isSubtechnique: false },
  { id: 'T1550', name: 'Use Alternate Authentication Material', tactic: 'Lateral Movement', ruleCount: 31, isSubtechnique: false },
  // Collection
  { id: 'T1005', name: 'Data from Local System', tactic: 'Collection', ruleCount: 105, isSubtechnique: false },
  { id: 'T1039', name: 'Data from Network Shared Drive', tactic: 'Collection', ruleCount: 24, isSubtechnique: false },
  { id: 'T1074', name: 'Data Staged', tactic: 'Collection', ruleCount: 65, isSubtechnique: false },
  { id: 'T1114', name: 'Email Collection', tactic: 'Collection', ruleCount: 42, isSubtechnique: false },
  { id: 'T1119', name: 'Automated Collection', tactic: 'Collection', ruleCount: 32, isSubtechnique: false },
  { id: 'T1113', name: 'Screen Capture', tactic: 'Collection', ruleCount: 28, isSubtechnique: false },
  { id: 'T1115', name: 'Clipboard Data', tactic: 'Collection', ruleCount: 13, isSubtechnique: false },
  // Command and Control
  { id: 'T1071', name: 'Application Layer Protocol', tactic: 'Command and Control', ruleCount: 249, isSubtechnique: false },
  { id: 'T1090', name: 'Proxy', tactic: 'Command and Control', ruleCount: 61, isSubtechnique: false },
  { id: 'T1095', name: 'Non-Application Layer Protocol', tactic: 'Command and Control', ruleCount: 24, isSubtechnique: false },
  { id: 'T1105', name: 'Ingress Tool Transfer', tactic: 'Command and Control', ruleCount: 165, isSubtechnique: false },
  { id: 'T1132', name: 'Data Encoding', tactic: 'Command and Control', ruleCount: 31, isSubtechnique: false },
  { id: 'T1568', name: 'Dynamic Resolution', tactic: 'Command and Control', ruleCount: 45, isSubtechnique: false },
  { id: 'T1572', name: 'Protocol Tunneling', tactic: 'Command and Control', ruleCount: 37, isSubtechnique: false },
  { id: 'T1573', name: 'Encrypted Channel', tactic: 'Command and Control', ruleCount: 101, isSubtechnique: false },
  { id: 'T1008', name: 'Fallback Channels', tactic: 'Command and Control', ruleCount: 12, isSubtechnique: false },
  { id: 'T1104', name: 'Multi-Stage Channels', tactic: 'Command and Control', ruleCount: 7, isSubtechnique: false },
  // Exfiltration
  { id: 'T1029', name: 'Scheduled Transfer', tactic: 'Exfiltration', ruleCount: 19, isSubtechnique: false },
  { id: 'T1030', name: 'Data Transfer Size Limits', tactic: 'Exfiltration', ruleCount: 11, isSubtechnique: false },
  { id: 'T1041', name: 'Exfiltration Over C2 Channel', tactic: 'Exfiltration', ruleCount: 92, isSubtechnique: false },
  { id: 'T1048', name: 'Exfiltration Over Alternative Protocol', tactic: 'Exfiltration', ruleCount: 57, isSubtechnique: false },
  { id: 'T1537', name: 'Transfer Data to Cloud Account', tactic: 'Exfiltration', ruleCount: 23, isSubtechnique: false },
  { id: 'T1567', name: 'Exfiltration Over Web Service', tactic: 'Exfiltration', ruleCount: 39, isSubtechnique: false },
  // Impact
  { id: 'T1485', name: 'Data Destruction', tactic: 'Impact', ruleCount: 27, isSubtechnique: false },
  { id: 'T1486', name: 'Data Encrypted for Impact', tactic: 'Impact', ruleCount: 118, isSubtechnique: false },
  { id: 'T1489', name: 'Service Stop', tactic: 'Impact', ruleCount: 34, isSubtechnique: false },
  { id: 'T1490', name: 'Inhibit System Recovery', tactic: 'Impact', ruleCount: 43, isSubtechnique: false },
  { id: 'T1491', name: 'Defacement', tactic: 'Impact', ruleCount: 16, isSubtechnique: false },
  { id: 'T1498', name: 'Network Denial of Service', tactic: 'Impact', ruleCount: 16, isSubtechnique: false },
  { id: 'T1499', name: 'Endpoint Denial of Service', tactic: 'Impact', ruleCount: 32, isSubtechnique: false },
];

// Group by tactic for the matrix
const tacticOrder = [
  'Reconnaissance', 'Resource Development', 'Initial Access', 'Execution',
  'Persistence', 'Privilege Escalation', 'Defense Evasion', 'Credential Access',
  'Discovery', 'Lateral Movement', 'Collection', 'Command and Control',
  'Exfiltration', 'Impact',
];

const byTactic = new Map();
for (const t of techniques) {
  if (!byTactic.has(t.tactic)) byTactic.set(t.tactic, []);
  byTactic.get(t.tactic).push(t);
}
for (const [, techs] of byTactic) {
  techs.sort((a, b) => b.ruleCount - a.ruleCount);
}

const matrix = tacticOrder
  .filter(t => byTactic.has(t))
  .map(tactic => ({
    tactic,
    techniques: byTactic.get(tactic).map(t => ({
      id: t.id, name: t.name, ruleCount: t.ruleCount,
      isSubtechnique: t.isSubtechnique, parentTechnique: t.parentTechnique,
    })),
    totalRules: byTactic.get(tactic).reduce((s, t) => s + t.ruleCount, 0),
  }));

const totalRules = techniques.reduce((s, t) => s + t.ruleCount, 0);
const topLevelTechniques = techniques.filter(t => !t.isSubtechnique);
const subTechniques = techniques.filter(t => t.isSubtechnique);

const techniquesData = {
  generatedAt: new Date().toISOString(),
  source: 'detection.wiki',
  totalRules,
  techniqueCount: topLevelTechniques.length,
  subtechniqueCount: subTechniques.length,
  tacticCount: matrix.length,
  matrix,
  all: techniques.map(t => ({
    id: t.id, name: t.name, tactic: t.tactic, ruleCount: t.ruleCount,
    isSubtechnique: t.isSubtechnique, parentTechnique: t.parentTechnique,
  })),
};
writeFileSync(join(OUT, 'techniques.json'), JSON.stringify(techniquesData));

// ── Labs ─────────────────────────────────────────────────────────────
const labs = [
  { slug: 'clickonce-abuse', title: 'ClickOnce Abuse', author: 'sonny', date: '2026-04-01',
    description: 'Detect ClickOnce abuse and AppDomainManager injection using ClickOnceBlobber. Covers dfsvc.exe process telemetry, ClickOnce cache artifacts, Zeek logs, Sysmon unsigned module loads, and Suricata TLS fingerprints. Includes KQL detection queries.',
    techniques: ['T1204.001', 'T1127.002', 'T1574.014', 'T1071.001', 'T1547'] },
  { slug: 'windows-screensaver-files-and-rmm-persistence', title: 'Windows Screensaver Files and RMM Persistence', author: 'sonny', date: '2026-03-30',
    description: "This is a simple emulation of a campaign documented by ReliaQuest, 'New Campaign Uses Screensavers for RMM-Based Persistence'. LimeWire.com is used to deliver a self-extracting archive masquerading as a Windows screensaver file that installs ScreenConnect.",
    techniques: ['T1204.002', 'T1059.003', 'T1218.007', 'T1036'] },
  { slug: 'python-persistence-via-pth-files', title: 'Python Persistence via .pth Files', author: 'sonny', date: '2026-03-27',
    description: 'Abuse of Python .pth files to establish persistence on Windows. The lab demonstrates how code embedded in site-packages path files executes automatically when Python starts.',
    techniques: ['T1546', 'T1059', 'T1071', 'T1562.004'] },
  { slug: 'byovd-and-ksld-sys', title: 'BYOVD and KslD.sys', author: 'sonny', date: '2026-03-24',
    description: "Hands-on lab demonstrating a BYOVD technique using Microsoft's KslD.sys driver to extract domain credentials from LSASS. Explore detection gaps in Windows telemetry, learn how to implement controls using WDAC, and see how attackers evade monitoring.",
    techniques: ['T1003'] },
  { slug: 'dll-sideloading-with-the-windows-bluetooth-file-transfer-wizard', title: 'DLL Sideloading with the Windows Bluetooth File Transfer Wizard', author: 'sonny', date: '2026-03-18',
    description: 'KQL analysis lab of malicious DLL sideloading via the Windows Bluetooth File Transfer Wizard. Demonstrates loading from a user dir and how to detect the behavior using MDE telemetry.',
    techniques: ['T1218', 'T1574.002'] },
  { slug: 'clickfix-electron-script-jacking-and-mandatory-user-profiles', title: 'ClickFix, Electron Script-jacking, and Mandatory User Profiles', author: 'sonny', date: '2026-03-10',
    description: "This attack simulation is inspired by Seqrite Lab's Operation HanKook Phantom: North Korean APT37 targeting South Korea and Praetorian's Corrupting the Hive Mind: Persistence Through Forgotten Windows Internals. It relies on a simple ClickFix attack to launch a PowerShell script that drops a Loki C2 payload, which is in turn used to establish persistence with a Mandatory User Profile.",
    techniques: ['T1204', 'T1547', 'T1059'] },
];
writeFileSync(join(OUT, 'labs.json'), JSON.stringify(labs));

// ── Filters ──────────────────────────────────────────────────────────
const filters = {
  vendors: ['Sigma', 'Elastic', 'Splunk', 'Kusto', 'YARA-L', 'Panther', 'Sublime MQL'],
  vendorCounts: { Sigma: 4228, Elastic: 3369, Splunk: 2990, Kusto: 2498, 'YARA-L': 379, Panther: 1168, 'Sublime MQL': 1325 },
  platforms: ['Windows', 'Linux', 'macOS', 'AWS', 'Azure', 'GCP', 'Microsoft 365', 'Intune', 'Google Workspace', 'Okta', 'GitHub', 'Kubernetes'],
  domains: ['Endpoint', 'Cloud', 'Identity', 'SaaS', 'Container', 'Network', 'Web', 'Application'],
  statuses: [
    { name: 'stable', count: 6060 },
    { name: 'deprecated', count: 17 },
    { name: 'test', count: 3360 },
    { name: 'experimental', count: 983 },
    { name: 'unspecified', count: 5537 },
  ],
};
writeFileSync(join(OUT, 'filters.json'), JSON.stringify(filters));

// ── Index ────────────────────────────────────────────────────────────
const topTechniques = topLevelTechniques
  .sort((a, b) => b.ruleCount - a.ruleCount)
  .slice(0, 20)
  .map(t => ({ id: t.id, name: t.name, ruleCount: t.ruleCount, tactic: t.tactic }));

const index = {
  generatedAt: new Date().toISOString(),
  source: 'https://detection.wiki',
  description: 'Detection rule and event catalog — 15,957 rules from Sigma, Elastic, Splunk, Kusto, YARA-L, Panther, Sublime mapped to MITRE ATT&CK',
  stats: {
    totalRules: 15957,
    eventCount: 133319,
    techniqueCount: topLevelTechniques.length,
    subtechniqueCount: subTechniques.length,
    platformCount: platforms.length,
    labCount: labs.length,
    tacticCount: matrix.length,
  },
  platforms: platforms.map(p => p.name),
  vendors: Object.keys(filters.vendorCounts),
  topTechniques,
};
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2));

console.log(`\n✅ Manifest built:`);
console.log(`   ${OUT}/index.json`);
console.log(`   ${OUT}/techniques.json (${matrix.length} tactics, ${techniques.length} techniques)`);
console.log(`   ${OUT}/platforms.json (${platforms.length} platforms)`);
console.log(`   ${OUT}/labs.json (${labs.length} labs)`);
console.log(`   ${OUT}/filters.json`);
console.log(`\n   Total: ${totalRules.toLocaleString()} rules across ${techniques.length} MITRE techniques`);
