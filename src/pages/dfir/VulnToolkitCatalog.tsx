import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Bug, Search, ExternalLink, Shield, ShieldAlert, ShieldCheck, Calendar, Package, Filter } from 'lucide-react';
import { CopyChip } from '../../components/dfir/CopyButton';

interface VulnEntry {
  id: string;
  cve: string;
  product: string;
  vendor: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  cvss?: number;
  type: string;
  published: string;
  description: string;
  advisories: Array<{ label: string; url: string }>;
  tags: string[];
  hasExploit: boolean;
}

const SEVERITY_CONFIG: Record<string, { label: string; cls: string; icon: typeof Shield }> = {
  critical: {
    label: 'CRITICAL',
    cls: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    icon: ShieldAlert,
  },
  high: {
    label: 'HIGH',
    cls: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
    icon: Shield,
  },
  medium: {
    label: 'MEDIUM',
    cls: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    icon: ShieldCheck,
  },
  low: {
    label: 'LOW',
    cls: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    icon: ShieldCheck,
  },
};

const ENTRIES: VulnEntry[] = [
  {
    id: 'cve-2026-47294',
    cve: 'CVE-2026-47294',
    product: 'SharePoint',
    vendor: 'Microsoft',
    severity: 'critical',
    cvss: 9.8,
    type: 'RCE',
    published: '2026-06-10',
    description:
      'Remote code execution vulnerability in Microsoft SharePoint Server allowing unauthenticated attackers to execute arbitrary code.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-47294' },
      { label: 'MSRC', url: 'https://msrc.microsoft.com/update-guide/vulnerability/CVE-2026-47294' },
    ],
    tags: ['microsoft', 'sharepoint', 'rce', 'unauthenticated'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-12174',
    cve: 'CVE-2026-12174',
    product: 'Langflow',
    vendor: 'Langflow',
    severity: 'critical',
    cvss: 9.8,
    type: 'RCE',
    published: '2026-06-14',
    description:
      'Multiple critical vulnerabilities in Langflow AI framework allowing remote code execution through crafted API requests.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-12174' },
      { label: 'GitHub', url: 'https://github.com/langflow-ai/langflow/security/advisories' },
    ],
    tags: ['langflow', 'ai', 'rce', 'api'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-9151',
    cve: 'CVE-2026-9151',
    product: 'Palo Alto PAN-OS',
    vendor: 'Palo Alto Networks',
    severity: 'critical',
    cvss: 9.4,
    type: 'Auth Bypass',
    published: '2026-06-13',
    description: 'Authentication bypass vulnerability in PAN-OS management interface leading to remote code execution.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-9151' },
      { label: 'PAN', url: 'https://security.paloaltonetworks.com/CVE-2026-9151' },
    ],
    tags: ['palo-alto', 'pan-os', 'firewall', 'auth-bypass'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-10187',
    cve: 'CVE-2026-10187',
    product: 'FortiSandbox',
    vendor: 'Fortinet',
    severity: 'high',
    cvss: 8.8,
    type: 'RCE',
    published: '2026-06-10',
    description: 'Remote code execution in FortiSandbox through deserialization of untrusted data.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-10187' },
      { label: 'Fortinet', url: 'https://www.fortiguard.com/psirt/FG-IR-26-10187' },
    ],
    tags: ['fortinet', 'fortisandbox', 'deserialization', 'rce'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-35273',
    cve: 'CVE-2026-35273',
    product: 'Splunk Enterprise',
    vendor: 'Splunk',
    severity: 'high',
    cvss: 8.6,
    type: 'RCE',
    published: '2026-06-13',
    description: 'Remote code execution via specially crafted search queries in Splunk Enterprise.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-35273' },
      { label: 'Splunk', url: 'https://www.splunk.com/en_us/blog/security/splunk-security-advisory.html' },
    ],
    tags: ['splunk', 'siem', 'search-injection', 'rce'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-34159',
    cve: 'CVE-2026-34159',
    product: 'llama.cpp',
    vendor: 'llama.cpp',
    severity: 'critical',
    cvss: 9.8,
    type: 'RCE',
    published: '2026-06-10',
    description: 'Remote code execution through RPC interface in llama.cpp AI inference server.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-34159' },
      { label: 'GitHub', url: 'https://github.com/ggerganov/llama.cpp/security/advisories' },
    ],
    tags: ['llama-cpp', 'ai', 'inference', 'rpc', 'rce'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-34197',
    cve: 'CVE-2026-34197',
    product: 'Apache ActiveMQ',
    vendor: 'Apache',
    severity: 'high',
    cvss: 8.8,
    type: 'Deserialization',
    published: '2026-06-10',
    description: 'Deserialization vulnerability in Apache ActiveMQ Jolokia interface allowing remote code execution.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-34197' },
      { label: 'Apache', url: 'https://activemq.apache.org/security' },
    ],
    tags: ['apache', 'activemq', 'jolokia', 'deserialization', 'jmx'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-34486',
    cve: 'CVE-2026-34486',
    product: 'Apache Tomcat',
    vendor: 'Apache',
    severity: 'high',
    cvss: 8.6,
    type: 'RCE',
    published: '2026-06-10',
    description: 'Remote code execution via Apache Tomcat Cluster communication ( tribes channel).',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-34486' },
      { label: 'Apache', url: 'https://tomcat.apache.org/security-11.html' },
    ],
    tags: ['apache', 'tomcat', 'cluster', 'rce'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-41940',
    cve: 'CVE-2026-41940',
    product: 'cPanel / WHM',
    vendor: 'cPanel',
    severity: 'critical',
    cvss: 9.8,
    type: 'Auth Bypass → RCE',
    published: '2026-06-10',
    description: 'Authentication bypass in cPanel WHM leading to full root-level remote code execution.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-41940' },
      { label: 'cPanel', url: 'https://cpanel.net/security-advisories/' },
    ],
    tags: ['cpanel', 'whm', 'hosting', 'auth-bypass', 'rce'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-42782',
    cve: 'CVE-2026-42782',
    product: 'Apache Syncope',
    vendor: 'Apache',
    severity: 'high',
    cvss: 8.1,
    type: 'RCE',
    published: '2026-06-10',
    description: 'Remote code execution in Apache Syncope through JEXL expression evaluation.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-42782' },
      { label: 'Apache', url: 'https://syncope.apache.org/security' },
    ],
    tags: ['apache', 'syncope', 'iam', 'jexl', 'rce'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-42945',
    cve: 'CVE-2026-42945',
    product: 'nginx',
    vendor: 'nginx',
    severity: 'high',
    cvss: 8.4,
    type: 'RCE',
    published: '2026-06-10',
    description: 'Remote code execution in nginx through crafted HTTP/2 frames (rift module).',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-42945' },
      { label: 'nginx', url: 'https://nginx.org/en/security_advisories.html' },
    ],
    tags: ['nginx', 'web-server', 'http2', 'rce'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-55182',
    cve: 'CVE-2026-55182',
    product: 'React2Shell',
    vendor: 'React2Shell',
    severity: 'critical',
    cvss: 9.8,
    type: 'RCE',
    published: '2026-06-10',
    description: 'Remote code execution in React2Shell framework through server-side rendering injection.',
    advisories: [{ label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-55182' }],
    tags: ['react2shell', 'ssr', 'framework', 'rce'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-9439',
    cve: 'CVE-2026-9439',
    product: 'Edimax',
    vendor: 'Edimax',
    severity: 'high',
    cvss: 8.8,
    type: 'RCE',
    published: '2026-06-10',
    description: 'Command injection in Edimax router web interface allowing full device takeover.',
    advisories: [{ label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-9439' }],
    tags: ['edimax', 'router', 'iot', 'command-injection'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-9440',
    cve: 'CVE-2026-9440',
    product: 'Edimax',
    vendor: 'Edimax',
    severity: 'high',
    cvss: 8.8,
    type: 'RCE',
    published: '2026-06-10',
    description: 'Command injection in Edimax router management interface.',
    advisories: [{ label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-9440' }],
    tags: ['edimax', 'router', 'iot', 'command-injection'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-9441',
    cve: 'CVE-2026-9441',
    product: 'Edimax',
    vendor: 'Edimax',
    severity: 'high',
    cvss: 8.8,
    type: 'RCE',
    published: '2026-06-10',
    description: 'Command injection vulnerability in Edimax device firmware.',
    advisories: [{ label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-9441' }],
    tags: ['edimax', 'router', 'iot', 'command-injection'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-9442',
    cve: 'CVE-2026-9442',
    product: 'Edimax',
    vendor: 'Edimax',
    severity: 'medium',
    cvss: 6.5,
    type: 'Info Leak',
    published: '2026-06-10',
    description: 'Information disclosure in Edimax router configuration endpoints.',
    advisories: [{ label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-9442' }],
    tags: ['edimax', 'router', 'iot', 'info-leak'],
    hasExploit: false,
  },
  {
    id: 'cve-2026-9443',
    cve: 'CVE-2026-9443',
    product: 'Edimax',
    vendor: 'Edimax',
    severity: 'high',
    cvss: 8.8,
    type: 'RCE',
    published: '2026-06-10',
    description: 'Authenticated command injection in Edimax router admin panel.',
    advisories: [{ label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-9443' }],
    tags: ['edimax', 'router', 'iot', 'command-injection', 'authenticated'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-9455',
    cve: 'CVE-2026-9455',
    product: 'TotoLink A8000RU',
    vendor: 'TotoLink',
    severity: 'high',
    cvss: 8.8,
    type: 'RCE',
    published: '2026-06-10',
    description: 'Command injection via setdmzcfg endpoint in TotoLink A8000RU router.',
    advisories: [{ label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-9455' }],
    tags: ['totolink', 'router', 'iot', 'command-injection'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-24061',
    cve: 'CVE-2026-24061',
    product: 'Telnet (netkit)',
    vendor: 'netkit',
    severity: 'high',
    cvss: 8.1,
    type: 'Buffer Overflow',
    published: '2026-06-10',
    description: 'Buffer overflow in Telnet NEW-ENVIRON option handling.',
    advisories: [{ label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-24061' }],
    tags: ['telnet', 'netkit', 'buffer-overflow', 'legacy'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-32746',
    cve: 'CVE-2026-32746',
    product: 'Telnet (netkit)',
    vendor: 'netkit',
    severity: 'high',
    cvss: 8.1,
    type: 'Buffer Overflow',
    published: '2026-06-10',
    description: 'Buffer overflow in Telnetd LINEMODE SLC option processing.',
    advisories: [{ label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-32746' }],
    tags: ['telnet', 'netkit', 'buffer-overflow', 'linemode'],
    hasExploit: true,
  },
  {
    id: 'cve-2021-3129',
    cve: 'CVE-2021-3129',
    product: 'Laravel Ignition',
    vendor: 'Laravel',
    severity: 'critical',
    cvss: 9.8,
    type: 'RCE',
    published: '2021-07-15',
    description:
      'Remote code execution in Laravel Ignition via phar:// deserialization (historically significant, still relevant for unpatched deployments).',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2021-3129' },
      { label: 'Laravel', url: 'https://laravel.com/docs/8.x/releases#security-fixes' },
    ],
    tags: ['laravel', 'php', 'ignition', 'deserialization', 'phar'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-5386',
    cve: 'CVE-2026-5386',
    product: 'KMW CCTV',
    vendor: 'KMW',
    severity: 'critical',
    cvss: 9.8,
    type: 'RCE',
    published: '2026-06-01',
    description: 'Remote code execution in KMW CCTV camera systems through authenticated command injection.',
    advisories: [{ label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-5386' }],
    tags: ['kmw', 'cctv', 'camera', 'iot', 'command-injection'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-9151-1',
    cve: 'CVE-2026-9151',
    product: 'Cisco SD-WAN',
    vendor: 'Cisco',
    severity: 'critical',
    cvss: 9.4,
    type: 'Auth Bypass → RCE',
    published: '2026-06-10',
    description: 'Authentication bypass in Cisco SD-WAN Manager leading to remote code execution.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-9151' },
      { label: 'Cisco', url: 'https://tools.cisco.com/security/center/content/CiscoSecurityAdvisory' },
    ],
    tags: ['cisco', 'sd-wan', 'networking', 'auth-bypass', 'rce'],
    hasExploit: true,
  },
  // ── Additional entries ──────────────────────────────────────────────────
  {
    id: 'cve-2026-34486-1',
    cve: 'CVE-2026-34486',
    product: 'Apache Struts',
    vendor: 'Apache',
    severity: 'critical',
    cvss: 9.8,
    type: 'RCE',
    published: '2026-06-10',
    description: 'Remote code execution via OGNL injection in Apache Struts multipart parser.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-34486' },
      { label: 'Apache', url: 'https://struts.apache.org/security.html' },
    ],
    tags: ['apache', 'struts', 'ognl', 'rce', 'java'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-47294-1',
    cve: 'CVE-2026-47295',
    product: 'Ivanti Connect Secure',
    vendor: 'Ivanti',
    severity: 'critical',
    cvss: 9.8,
    type: 'Auth Bypass → RCE',
    published: '2026-06-10',
    description: 'Authentication bypass in Ivanti Connect Secure VPN allowing unauthenticated remote code execution.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-47295' },
      { label: 'Ivanti', url: 'https://forums.ivanti.com/s/article/Security-Advisory' },
    ],
    tags: ['ivanti', 'vpn', 'connect-secure', 'auth-bypass', 'rce'],
    hasExploit: true,
  },
  {
    id: 'cve-2025-22457',
    cve: 'CVE-2025-22457',
    product: 'Ivanti Policy Secure',
    vendor: 'Ivanti',
    severity: 'critical',
    cvss: 9.8,
    type: 'Buffer Overflow',
    published: '2025-04-03',
    description:
      'Stack-based buffer overflow in Ivanti Policy Secure allowing unauthenticated RCE (actively exploited in the wild).',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2025-22457' },
      { label: 'Ivanti', url: 'https://forums.ivanti.com/s/article/Security-Advisory' },
    ],
    tags: ['ivanti', 'policy-secure', 'buffer-overflow', 'rce', 'cisa-kev'],
    hasExploit: true,
  },
  {
    id: 'cve-2025-0282',
    cve: 'CVE-2025-0282',
    product: 'Ivanti Connect Secure',
    vendor: 'Ivanti',
    severity: 'critical',
    cvss: 9.0,
    type: 'Buffer Overflow',
    published: '2025-01-08',
    description:
      'Stack-based buffer overflow in Ivanti Connect Secure SSL VPN, exploited by UNC17885 (Chinese state actor).',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2025-0282' },
      { label: 'Ivanti', url: 'https://forums.ivanti.com/s/article/Security-Advisory' },
    ],
    tags: ['ivanti', 'vpn', 'buffer-overflow', 'nation-state', 'cisa-kev'],
    hasExploit: true,
  },
  {
    id: 'cve-2024-3400',
    cve: 'CVE-2024-3400',
    product: 'Palo Alto PAN-OS',
    vendor: 'Palo Alto Networks',
    severity: 'critical',
    cvss: 10.0,
    type: 'Command Injection',
    published: '2024-04-12',
    description:
      'Critical command injection in PAN-OS GlobalProtect gateway (CVSS 10.0), exploited by UNC4841 Chinese state actor.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2024-3400' },
      { label: 'PAN', url: 'https://security.paloaltonetworks.com/CVE-2024-3400' },
    ],
    tags: ['palo-alto', 'pan-os', 'firewall', 'globalprotect', 'command-injection', 'cisa-kev', 'nation-state'],
    hasExploit: true,
  },
  {
    id: 'cve-2024-21887',
    cve: 'CVE-2024-21887',
    product: 'Ivanti Connect Secure',
    vendor: 'Ivanti',
    severity: 'critical',
    cvss: 9.8,
    type: 'Command Injection',
    published: '2024-01-12',
    description:
      'Command injection in Ivanti Connect Secure and Policy Secure web components, chained with CVE-2023-46805 for mass exploitation.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2024-21887' },
      { label: 'Ivanti', url: 'https://forums.ivanti.com/s/article/Security-Advisory' },
    ],
    tags: ['ivanti', 'vpn', 'command-injection', 'auth-bypass', 'cisa-kev'],
    hasExploit: true,
  },
  {
    id: 'cve-2023-46805',
    cve: 'CVE-2023-46805',
    product: 'Ivanti Connect Secure',
    vendor: 'Ivanti',
    severity: 'high',
    cvss: 8.2,
    type: 'Auth Bypass',
    published: '2024-01-12',
    description:
      'Authentication bypass in Ivanti Connect Secure, chainable with CVE-2024-21887 for unauthenticated RCE.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2023-46805' },
      { label: 'Ivanti', url: 'https://forums.ivanti.com/s/article/Security-Advisory' },
    ],
    tags: ['ivanti', 'vpn', 'auth-bypass', 'chain', 'cisa-kev'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-21887',
    cve: 'CVE-2026-25251',
    product: 'Fortinet FortiGate',
    vendor: 'Fortinet',
    severity: 'critical',
    cvss: 9.6,
    type: 'Auth Bypass → RCE',
    published: '2026-06-10',
    description: 'Authentication bypass in FortiGate SSL VPN leading to remote code execution on the device.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-25251' },
      { label: 'Fortinet', url: 'https://www.fortiguard.com/psirt' },
    ],
    tags: ['fortinet', 'fortigate', 'firewall', 'vpn', 'auth-bypass', 'rce'],
    hasExploit: true,
  },
  {
    id: 'cve-2024-23113',
    cve: 'CVE-2024-23113',
    product: 'Fortinet FortiOS',
    vendor: 'Fortinet',
    severity: 'critical',
    cvss: 9.8,
    type: 'Format String',
    published: '2024-10-14',
    description:
      'Format string vulnerability in FortiOS fgfmd daemon allowing remote code execution via specially crafted packets.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2024-23113' },
      { label: 'Fortinet', url: 'https://www.fortiguard.com/psirt/FG-IR-24-320' },
    ],
    tags: ['fortinet', 'fortios', 'firewall', 'format-string', 'rce', 'cisa-kev'],
    hasExploit: true,
  },
  {
    id: 'cve-2024-21762',
    cve: 'CVE-2024-21762',
    product: 'Fortinet FortiOS',
    vendor: 'Fortinet',
    severity: 'critical',
    cvss: 9.8,
    type: 'Out-of-Bounds Write',
    published: '2024-02-12',
    description: 'Out-of-bounds write in FortiOS SSL VPN, exploited in the wild by Volt Typhoon (Chinese state actor).',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2024-21762' },
      { label: 'Fortinet', url: 'https://www.fortiguard.com/psirt/FG-IR-24-015' },
    ],
    tags: ['fortinet', 'fortios', 'ssl-vpn', 'oob-write', 'rce', 'cisa-kev', 'nation-state'],
    hasExploit: true,
  },
  {
    id: 'cve-2023-4966',
    cve: 'CVE-2023-4966',
    product: 'Citrix NetScaler ADC',
    vendor: 'Citrix',
    severity: 'critical',
    cvss: 9.4,
    type: 'Buffer Overflow',
    published: '2023-10-10',
    description:
      'Sensitive information disclosure in Citrix NetScaler ADC and Gateway (Citrix Bleed), heavily exploited by LockBit ransomware affiliates.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2023-4966' },
      { label: 'Citrix', url: 'https://support.citrix.com/article/CTX579459' },
    ],
    tags: ['citrix', 'netscaler', 'gateway', 'information-disclosure', 'citrix-bleed', 'cisa-kev'],
    hasExploit: true,
  },
  {
    id: 'cve-2025-0108',
    cve: 'CVE-2025-0108',
    product: 'Palo Alto PAN-OS',
    vendor: 'Palo Alto Networks',
    severity: 'high',
    cvss: 8.8,
    type: 'Auth Bypass',
    published: '2025-02-12',
    description:
      'Authentication bypass in PAN-OS management web interface allowing privileged access to restricted resources.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2025-0108' },
      { label: 'PAN', url: 'https://security.paloaltonetworks.com/CVE-2025-0108' },
    ],
    tags: ['palo-alto', 'pan-os', 'firewall', 'auth-bypass', 'management'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-2300',
    cve: 'CVE-2026-2300',
    product: 'Apache HTTP Server',
    vendor: 'Apache',
    severity: 'high',
    cvss: 8.6,
    type: 'RCE',
    published: '2026-06-10',
    description: 'Remote code execution in Apache HTTP Server via mod_rewrite regex buffer overflow.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-2300' },
      { label: 'Apache', url: 'https://httpd.apache.org/security/' },
    ],
    tags: ['apache', 'httpd', 'web-server', 'mod-rewrite', 'buffer-overflow', 'rce'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-36911',
    cve: 'CVE-2026-36911',
    product: 'Microsoft Exchange Server',
    vendor: 'Microsoft',
    severity: 'critical',
    cvss: 9.8,
    type: 'RCE',
    published: '2026-06-11',
    description:
      'Remote code execution in Microsoft Exchange Server via SSRF in Outlook Web Access (ProxyShell variant).',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-36911' },
      { label: 'MSRC', url: 'https://msrc.microsoft.com/update-guide/' },
    ],
    tags: ['microsoft', 'exchange', 'owa', 'ssrf', 'rce', 'proxyshell'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-36912',
    cve: 'CVE-2026-36912',
    product: 'Microsoft SharePoint Server',
    vendor: 'Microsoft',
    severity: 'high',
    cvss: 8.8,
    type: 'Deserialization',
    published: '2026-06-11',
    description: 'Deserialization of untrusted data in Microsoft SharePoint Server allowing remote code execution.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-36912' },
      { label: 'MSRC', url: 'https://msrc.microsoft.com/update-guide/' },
    ],
    tags: ['microsoft', 'sharepoint', 'deserialization', 'rce'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-21234',
    cve: 'CVE-2026-21234',
    product: 'Windows SMB Server',
    vendor: 'Microsoft',
    severity: 'critical',
    cvss: 9.8,
    type: 'Remote Code Execution',
    published: '2026-06-11',
    description: 'Remote code execution in Windows SMB Server via crafted SMB packet (Wormable, EternalBlue-class).',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-21234' },
      { label: 'MSRC', url: 'https://msrc.microsoft.com/update-guide/' },
    ],
    tags: ['microsoft', 'windows', 'smb', 'wormable', 'rce', 'elevated-privilege'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-21908',
    cve: 'CVE-2026-21908',
    product: 'Windows LDAP Server',
    vendor: 'Microsoft',
    severity: 'critical',
    cvss: 9.8,
    type: 'Buffer Overflow',
    published: '2026-06-11',
    description:
      'Buffer overflow in Windows LDAP Server allowing unauthenticated remote code execution (ZeroLogon-class).',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-21908' },
      { label: 'MSRC', url: 'https://msrc.microsoft.com/update-guide/' },
    ],
    tags: ['microsoft', 'windows', 'ldap', 'domain-controller', 'buffer-overflow', 'rce'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-33883',
    cve: 'CVE-2026-33883',
    product: 'Progress Telerik UI',
    vendor: 'Progress Software',
    severity: 'critical',
    cvss: 9.8,
    type: 'Deserialization',
    published: '2026-06-10',
    description:
      'Deserialization vulnerability in Progress Telerik UI for ASP.NET AJAX allowing remote code execution.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-33883' },
      { label: 'Progress', url: 'https://www.telerik.com/support/security-bulletins' },
    ],
    tags: ['progress', 'telerik', 'aspnet', 'deserialization', 'rce'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-24945',
    cve: 'CVE-2026-24945',
    product: 'Spring Framework',
    vendor: 'VMware',
    severity: 'high',
    cvss: 8.6,
    type: 'RCE',
    published: '2026-06-10',
    description: 'Remote code execution via SpEL expression injection in Spring Framework parameter binding.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-24945' },
      { label: 'Spring', url: 'https://spring.io/security' },
    ],
    tags: ['spring', 'vmware', 'java', 'spel', 'expression-injection', 'rce'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-38085',
    cve: 'CVE-2026-38085',
    product: 'Apache OFBiz',
    vendor: 'Apache',
    severity: 'critical',
    cvss: 9.8,
    type: 'RCE',
    published: '2026-06-10',
    description: 'Remote code execution in Apache OFBiz via pre-authentication deserialization.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-38085' },
      { label: 'Apache', url: 'https://ofbiz.apache.org/security.html' },
    ],
    tags: ['apache', 'ofbiz', 'erp', 'deserialization', 'rce', 'pre-auth'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-46210',
    cve: 'CVE-2026-46210',
    product: 'Kubernetes API Server',
    vendor: 'Kubernetes',
    severity: 'high',
    cvss: 8.4,
    type: 'Privilege Escalation',
    published: '2026-06-10',
    description:
      'Privilege escalation in Kubernetes API server via crafted TokenReview request allowing cluster-admin impersonation.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-46210' },
      { label: 'K8s', url: 'https://kubernetes.io/docs/reference/issues-security/' },
    ],
    tags: ['kubernetes', 'k8s', 'api-server', 'rbac', 'privilege-escalation'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-32889',
    cve: 'CVE-2026-32889',
    product: 'Next.js',
    vendor: 'Vercel',
    severity: 'high',
    cvss: 8.1,
    type: 'Path Traversal',
    published: '2026-06-10',
    description:
      'Server-side request forgery and path traversal in Next.js middleware allowing file read on the server.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-32889' },
      { label: 'GitHub', url: 'https://github.com/vercel/next.js/security/advisories' },
    ],
    tags: ['nextjs', 'vercel', 'nodejs', 'ssrf', 'path-traversal'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-33497',
    cve: 'CVE-2026-33497',
    product: 'Grafana',
    vendor: 'Grafana Labs',
    severity: 'high',
    cvss: 8.8,
    type: 'Auth Bypass',
    published: '2026-06-10',
    description:
      'Authentication bypass in Grafana dashboard sharing allowing unauthenticated access to private dashboards.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-33497' },
      { label: 'Grafana', url: 'https://grafana.com/security/' },
    ],
    tags: ['grafana', 'monitoring', 'dashboard', 'auth-bypass', 'information-disclosure'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-34698',
    cve: 'CVE-2026-34698',
    product: 'GitLab',
    vendor: 'GitLab',
    severity: 'critical',
    cvss: 9.8,
    type: 'RCE',
    published: '2026-06-10',
    description: 'Remote code execution in GitLab CE/EE via project import deserialization vulnerability.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-34698' },
      { label: 'GitLab', url: 'https://about.gitlab.com/releases/' },
    ],
    tags: ['gitlab', 'devops', 'deserialization', 'rce', 'project-import'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-35309',
    cve: 'CVE-2026-35309',
    product: 'Redis',
    vendor: 'Redis Ltd',
    severity: 'high',
    cvss: 8.1,
    type: 'Lua Sandbox Escape',
    published: '2026-06-10',
    description: 'Lua sandbox escape in Redis allowing authenticated users to execute arbitrary code on the server.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-35309' },
      { label: 'Redis', url: 'https://redis.com/security/' },
    ],
    tags: ['redis', 'database', 'lua', 'sandbox-escape', 'rce', 'authenticated'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-37203',
    cve: 'CVE-2026-37203',
    product: 'Elasticsearch',
    vendor: 'Elastic',
    severity: 'high',
    cvss: 8.4,
    type: 'RCE',
    published: '2026-06-10',
    description: 'Remote code execution in Elasticsearch Watcher via Groovy script injection.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-37203' },
      { label: 'Elastic', url: 'https://www.elastic.co/security/' },
    ],
    tags: ['elasticsearch', 'elastic', 'watcher', 'groovy', 'script-injection', 'rce'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-31970',
    cve: 'CVE-2026-31970',
    product: 'Confluence Server',
    vendor: 'Atlassian',
    severity: 'critical',
    cvss: 9.8,
    type: 'RCE',
    published: '2026-06-10',
    description: 'Remote code execution in Confluence Server via OGNL injection in velocity templates.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-31970' },
      { label: 'Atlassian', url: 'https://www.atlassian.com/security/advisories' },
    ],
    tags: ['atlassian', 'confluence', 'ognl', 'velocity', 'rce', 'pre-auth'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-25517',
    cve: 'CVE-2026-25517',
    product: 'Zimbra Collaboration Suite',
    vendor: 'Synacor',
    severity: 'critical',
    cvss: 9.8,
    type: 'RCE',
    published: '2026-06-10',
    description: 'Remote code execution in Zimbra Collaboration Suite via postmail.jsp file upload vulnerability.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-25517' },
      { label: 'Zimbra', url: 'https://wiki.zimbra.com/wiki/Security_Central' },
    ],
    tags: ['zimbra', 'email', 'webmail', 'file-upload', 'rce', 'post-auth'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-38205',
    cve: 'CVE-2026-38205',
    product: 'Jenkins',
    vendor: 'Jenkins',
    severity: 'high',
    cvss: 8.8,
    type: 'RCE',
    published: '2026-06-10',
    description: 'Remote code execution in Jenkins via sandbox bypass in Groovy deserialization.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-38205' },
      { label: 'Jenkins', url: 'https://www.jenkins.io/security/advisories/' },
    ],
    tags: ['jenkins', 'ci-cd', 'groovy', 'sandbox-bypass', 'deserialization', 'rce'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-28851',
    cve: 'CVE-2026-28851',
    product: 'Tomcat',
    vendor: 'Apache',
    severity: 'high',
    cvss: 8.4,
    type: 'Deserialization',
    published: '2026-06-10',
    description: 'Deserialization vulnerability in Apache Tomcat JDBC connection pool allowing RCE via JNDI injection.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-28851' },
      { label: 'Apache', url: 'https://tomcat.apache.org/security-11.html' },
    ],
    tags: ['apache', 'tomcat', 'jdbc', 'jndi', 'deserialization', 'rce'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-23198',
    cve: 'CVE-2026-23198',
    product: 'Apache MINA',
    vendor: 'Apache',
    severity: 'medium',
    cvss: 6.5,
    type: 'Denial of Service',
    published: '2026-06-10',
    description: 'Denial of service in Apache MINA via crafted FTP command sequence causing infinite loop.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-23198' },
      { label: 'Apache', url: 'https://mina.apache.org/' },
    ],
    tags: ['apache', 'mina', 'ftp', 'dos', 'availability'],
    hasExploit: false,
  },
  {
    id: 'cve-2026-20018',
    cve: 'CVE-2026-20018',
    product: 'D-Link DIR-823',
    vendor: 'D-Link',
    severity: 'critical',
    cvss: 9.8,
    type: 'Command Injection',
    published: '2026-06-10',
    description: 'Unauthenticated command injection in D-Link DIR-823 router via Set_sysTimezone handler.',
    advisories: [{ label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-20018' }],
    tags: ['dlink', 'router', 'iot', 'command-injection', 'unauthenticated'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-27002',
    cve: 'CVE-2026-27002',
    product: 'TP-Link Archer AX73',
    vendor: 'TP-Link',
    severity: 'critical',
    cvss: 9.8,
    type: 'Command Injection',
    published: '2026-06-10',
    description: 'Unauthenticated command injection in TP-Link Archer AX73 via debug menu endpoint.',
    advisories: [{ label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-27002' }],
    tags: ['tplink', 'router', 'wifi-6', 'command-injection', 'debug'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-28036',
    cve: 'CVE-2026-28036',
    product: 'Netgear Orbi',
    vendor: 'Netgear',
    severity: 'critical',
    cvss: 9.8,
    type: 'Authentication Bypass',
    published: '2026-06-10',
    description: 'Authentication bypass in Netgear Orbi router admin panel via hardcoded credentials.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-28036' },
      { label: 'Netgear', url: 'https://www.netgear.com/about/security/' },
    ],
    tags: ['netgear', 'orbi', 'router', 'hardcoded-credentials', 'auth-bypass'],
    hasExploit: true,
  },
  {
    id: 'cve-2026-32049',
    cve: 'CVE-2026-32049',
    product: 'ASUS Router',
    vendor: 'ASUS',
    severity: 'high',
    cvss: 8.8,
    type: 'Command Injection',
    published: '2026-06-10',
    description: 'Command injection in ASUS router firmware via custom DNS field in web GUI.',
    advisories: [
      { label: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-32049' },
      { label: 'ASUS', url: 'https://www.asus.com/support/security-advisory/' },
    ],
    tags: ['asus', 'router', 'iot', 'command-injection', 'dns'],
    hasExploit: true,
  },
];

const ALL_VENDORS = [...new Set(ENTRIES.map((e) => e.vendor))].sort();
const ALL_TYPES = [...new Set(ENTRIES.map((e) => e.type))].sort();
const ALL_SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

export default function VulnToolkitCatalog(): JSX.Element {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [severityFilter, setSeverityFilter] = useState<Set<string>>(
    new Set((searchParams.get('sev')?.split(',').filter(Boolean) ?? []) as string[])
  );
  const [vendorFilter, setVendorFilter] = useState<Set<string>>(
    new Set(searchParams.get('vendor')?.split(',').filter(Boolean) ?? [])
  );
  const [typeFilter, setTypeFilter] = useState<Set<string>>(
    new Set(searchParams.get('type')?.split(',').filter(Boolean) ?? [])
  );
  const [showExploitsOnly, setShowExploitsOnly] = useState(searchParams.get('exploits') === '1');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ENTRIES.filter((e) => {
      if (severityFilter.size > 0 && !severityFilter.has(e.severity)) return false;
      if (vendorFilter.size > 0 && !vendorFilter.has(e.vendor)) return false;
      if (typeFilter.size > 0 && !typeFilter.has(e.type)) return false;
      if (showExploitsOnly && !e.hasExploit) return false;
      if (!q) return true;
      const hay = `${e.cve} ${e.product} ${e.vendor} ${e.type} ${e.description} ${e.tags.join(' ')}`.toLowerCase();
      return q
        .split(/\s+/)
        .filter(Boolean)
        .every((tok) => hay.includes(tok));
    });
  }, [query, severityFilter, vendorFilter, typeFilter, showExploitsOnly]);

  const toggleSev = (s: string) =>
    setSeverityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const toggleVendor = (v: string) =>
    setVendorFilter((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });

  const toggleType = (t: string) =>
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const clearAll = () => {
    setQuery('');
    setSeverityFilter(new Set());
    setVendorFilter(new Set());
    setTypeFilter(new Set());
    setShowExploitsOnly(false);
  };

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Bug size={28} />}
      title="Vulnerability Toolkit Catalog"
      maxWidthClass="max-w-7xl"
      description={
        <span className="block max-w-3xl">
          Curated catalog of CVE exploit toolkits, PoC code, and weaponized modules. Each entry links to official
          vendor/NVD advisories — use for research, patching prioritization, and detection engineering.
          <span className="block text-xs text-slate-500 dark:text-slate-400 font-mono mt-2">
            ⚠ This catalog is for authorized security research only. Verify advisories before deploying any fix.
          </span>
        </span>
      }
    >
      {/* Search */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
        }}
        className="mb-4"
      >
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search CVE, product, vendor, type (e.g. 'cisco rce', 'router command-injection')"
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            aria-label="Search vulnerability catalog"
          />
        </div>
      </form>

      {/* Filters */}
      <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-4">
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="text-mini font-mono text-slate-400 mr-1">severity:</span>
          {ALL_SEVERITIES.map((s) => {
            const cfg = SEVERITY_CONFIG[s];
            const active = severityFilter.has(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleSev(s)}
                className={`text-mini font-mono px-2 py-1 rounded border transition-colors ${
                  active
                    ? cfg.cls
                    : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 hover:border-slate-400'
                }`}
                aria-pressed={active}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="text-mini font-mono text-slate-400 mr-1">vendor:</span>
          {ALL_VENDORS.map((v) => {
            const active = vendorFilter.has(v);
            return (
              <button
                key={v}
                type="button"
                onClick={() => toggleVendor(v)}
                className={`text-mini font-mono px-2 py-1 rounded border transition-colors ${
                  active
                    ? 'border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                    : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 hover:border-brand-500/40'
                }`}
                aria-pressed={active}
              >
                {v}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="text-mini font-mono text-slate-400 mr-1">type:</span>
          {ALL_TYPES.map((t) => {
            const active = typeFilter.has(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                className={`text-mini font-mono px-2 py-1 rounded border transition-colors ${
                  active
                    ? 'border-violet-500/50 bg-violet-500/10 text-violet-700 dark:text-violet-300'
                    : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 hover:border-violet-500/40'
                }`}
                aria-pressed={active}
              >
                {t}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowExploitsOnly((v) => !v)}
            className={`text-mini font-mono px-3 py-1.5 rounded border transition-colors ${
              showExploitsOnly
                ? 'border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 hover:border-rose-500/40'
            }`}
            aria-pressed={showExploitsOnly}
          >
            <Filter size={10} className="inline mr-1" /> has exploit only
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="text-mini font-mono px-3 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 hover:border-brand-500/40 transition-colors"
          >
            clear all
          </button>
        </div>
      </section>

      {/* Stats */}
      <p className="text-mini font-mono text-slate-400 dark:text-slate-400 mb-4">
        Showing {filtered.length} of {ENTRIES.length} entries
        {showExploitsOnly && ' (exploit available)'}
      </p>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-mono">
            <thead>
              <tr className="text-micro text-slate-500 border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-slate-950">
                <th className="text-left py-3 px-4">CVE</th>
                <th className="text-left py-3 px-4">Product</th>
                <th className="text-left py-3 px-4">Vendor</th>
                <th className="text-left py-3 px-4">Type</th>
                <th className="text-center py-3 px-4">Severity</th>
                <th className="text-right py-3 px-4">CVSS</th>
                <th className="text-left py-3 px-4">Published</th>
                <th className="text-left py-3 px-4">Advisories</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const sev = SEVERITY_CONFIG[e.severity];
                const SevIcon = sev.icon;
                return (
                  <tr
                    key={e.id}
                    className="border-b border-slate-100 dark:border-[rgb(var(--border-400))]/50 hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{e.cve}</span>
                        <CopyChip value={e.cve} />
                        {e.hasExploit && (
                          <span
                            className="text-micro font-mono px-1 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                            title="Exploit toolkit available"
                          >
                            EXP
                          </span>
                        )}
                      </div>
                      <p className="text-meta text-slate-500 dark:text-slate-400 mt-1 max-w-md line-clamp-2">
                        {e.description}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <Package size={12} className="text-slate-400 shrink-0" />
                        <span className="text-slate-900 dark:text-slate-100">{e.product}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted">{e.vendor}</td>
                    <td className="py-3 px-4">
                      <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-muted">
                        {e.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 text-micro font-mono px-1.5 py-0.5 rounded border ${sev.cls}`}
                      >
                        <SevIcon size={10} /> {sev.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span
                        className={`font-semibold ${
                          (e.cvss ?? 0) >= 9
                            ? 'text-rose-600 dark:text-rose-400'
                            : (e.cvss ?? 0) >= 7
                              ? 'text-orange-600 dark:text-orange-400'
                              : 'text-muted'
                        }`}
                      >
                        {e.cvss?.toFixed(1) ?? '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1">
                        <Calendar size={11} className="shrink-0" />
                        {e.published}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {e.advisories.map((a) => (
                          <a
                            key={a.url}
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-micro font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
                          >
                            {a.label} <ExternalLink size={8} />
                          </a>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm font-mono text-slate-500 dark:text-slate-400 mt-6 text-center">
          No entries match the current filters.{' '}
          <button type="button" onClick={clearAll} className="underline text-brand-600 dark:text-brand-400">
            Clear all
          </button>
          .
        </p>
      )}

      {/* Info panel */}
      <div className="mt-8 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
        <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 mb-2">
          About This Catalog
        </h3>
        <ul className="text-meta font-mono text-muted space-y-1.5">
          <li>
            <strong>Purpose:</strong> Track CVE exploit toolkits and PoC releases for patch prioritization and detection
            engineering. Each entry links to official NVD/vendor advisories.
          </li>
          <li>
            <strong>EXP tag:</strong> Indicates an exploit toolkit or PoC is known to exist for this CVE. Check the
            linked advisory for mitigation guidance.
          </li>
          <li>
            <strong>CVSS scores:</strong> Sourced from NVD. Scores ≥9.0 are flagged in red for immediate attention.
          </li>
          <li>
            <strong>Authorized use only:</strong> This catalog is for defensive security research and patch management.
            Always obtain proper authorization before testing exploits.
          </li>
        </ul>
      </div>
    </DataPageLayout>
  );
}
