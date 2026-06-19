import { useState } from 'react';
import { BackLink } from '../../components/BackLink';
import { CopyButton } from '../../components/dfir/CopyButton';
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Search,
  Shield,
  Link2,
  FileBox,
  User,
  Lock,
  RefreshCw,
  ClipboardCheck,
  type LucideIcon,
} from 'lucide-react';

interface PhaseSection {
  id: string;
  icon: LucideIcon;
  title: string;
  purpose: string;
  description: string;
  decisionTree: string[];
  tools: string[];
  queries: Array<{ language: string; code: string }>;
  escalationL1: string[];
  escalationL2: string[];
  escalationL3: string[];
  artifacts: string[];
}

const QUERIES: Record<string, Array<{ language: string; code: string }>> = {
  triage: [
    {
      language: 'KQL',
      code: `// Identify phishing emails by common indicators
EmailEvents
| where Timestamp > ago(24h)
| where SenderMailFromDomain != "yourdomain.com"
| where ThreatTypes has "Phish"
| project Timestamp, RecipientEmailAddress, SenderMailFromAddress,
           Subject, ThreatTypes, DetectionMethods`,
    },
    {
      language: 'SPL',
      code: `// Suspicious email detection in Splunk
index=email sourcetype=mail
| eval subject_lower=lower(Subject)
| where match(subject_lower, "(urgent|password|verify|account|invoice|payment)")
| stats count by from_addr, subject, recipient`,
    },
  ],
  header: [
    {
      language: 'KQL',
      code: `// Check SPF/DKIM/DMARC verdicts
EmailEvents
| where Timestamp > ago(7d)
| where SenderMailFromDomain !endswith "yourdomain.com"
| where AuthenticationDetails has "fail"
| project Timestamp, RecipientEmailAddress, SenderMailFromAddress,
           AuthenticationDetails, SenderIPv4`,
    },
    {
      language: 'XQL',
      code: `// Email header analysis
dataset = email
| filter sender_domain != "yourdomain.com"
| alter spf_verdict = spf_result, dkim_verdict = dkim_result,
        dmarc_verdict = dmarc_result
| filter spf_verdict = "fail" or dkim_verdict = "fail"
| fields timestamp, recipient, sender, subject, spf_verdict,
         dkim_verdict, dmarc_verdict, sender_ip`,
    },
  ],
  url: [
    {
      language: 'KQL',
      code: `// URL click events from phishing emails
UrlClickEvents
| where Timestamp > ago(7d)
| where ThreatTypes has "Phish"
| summarize Clicks = count() by Url, ActionType, AccountUpn
| top 10 by Clicks desc`,
    },
    {
      language: 'SPL',
      code: `// Web proxy URL access by user
index=proxy sourcetype=web
| search url=*evil* OR url=*login* OR url=*verify*
| stats values(url) as urls, count by user, src_ip
| where mvcount(urls) > 1`,
    },
  ],
  attachment: [
    {
      language: 'KQL',
      code: `// Attachment detection in email
EmailAttachmentInfo
| where Timestamp > ago(7d)
| where FileType in ("docm", "xlsm", "pptm", "js", "vbs", "ps1")
| project Timestamp, RecipientEmailAddress, FileName, FileType,
           FileSize, SHA256`,
    },
    {
      language: 'SPL',
      code: `// Suspicious attachment types
index=email sourcetype=mail
| search attachment_type=docm OR attachment_type=js
  OR attachment_type=vbs OR attachment_type=ps1
| stats count by attachment_name, attachment_hash, sender`,
    },
  ],
  identity: [
    {
      language: 'KQL',
      code: `// Suspicious sign-in events after phishing
SigninLogs
| where TimeGenerated > ago(24h)
| where UserPrincipalName == "target@domain.com"
| where RiskLevelDuringSignIn in ("medium", "high")
| project TimeGenerated, UserPrincipalName, IPAddress,
           Location, RiskLevelDuringSignIn, Status`,
    },
    {
      language: 'SPL',
      code: `// Failed logins from unusual locations
index=windows sourcetype=WinEventLog:Security
| search EventCode=4625
| eval user = mvindex(Account_Name, 1)
| stats count by user, src_ip, WorkstationName
| where count > 5`,
    },
  ],
  scope: [
    {
      language: 'KQL',
      code: `// Mailbox forwarding rules
EmailMailboxSettings
| where Timestamp > ago(7d)
| where ForwardingAddress != "" or ForwardingSmtpAddress != ""
| project Timestamp, AccountUpn, ForwardingAddress,
           ForwardingSmtpAddress, ForwardingType`,
    },
    {
      language: 'KQL',
      code: `// Inbox rule creation events
EmailMailboxSettings
| where Timestamp > ago(7d)
| where Operation in ("Set-Mailbox", "New-InboxRule")
| where Parameters has "ForwardTo" or Parameters has "RedirectTo"
| project Timestamp, AccountUpn, Operation, Parameters`,
    },
  ],
  containment: [
    {
      language: 'KQL',
      code: `// Contain measures applied
let indicators = dynamic(["evil-domain.xyz", "203.0.113.42"]);
EmailEvents
| where SenderMailFromDomain in (indicators)
| project Timestamp, RecipientEmailAddress, Subject,
           SenderMailFromAddress`,
    },
    {
      language: 'SPL',
      code: `// Identify all recipients of malicious email
index=email sourcetype=mail
| search from="*evil-domain.xyz"
| stats values(recipient) as all_recipients by subject, timestamp`,
    },
  ],
  remediation: [
    {
      language: 'KQL',
      code: `// Post-remediation re-auth events
SigninLogs
| where TimeGenerated > ago(24h)
| where UserPrincipalName startswith "target"
| where RiskLevelDuringSignIn == "none"
| summarize LatestLogin = max(TimeGenerated) by UserPrincipalName`,
    },
    {
      language: 'KQL',
      code: `// Verify password reset completed
AuditLogs
| where TimeGenerated > ago(24h)
| where OperationName == "Reset user password"
| where TargetResources has "john.doe"
| project TimeGenerated, OperationName, Result`,
    },
  ],
  post: [
    {
      language: 'YARA',
      code: `rule Phish_Campaign_2026_EvilDomain
{
  meta:
    description = "Detects emails from evil-domain.xyz campaign"
    author = "SOC Team"
    date = "2026-06-15"
    hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  strings:
    $domain = "evil-domain.xyz"
    $subject = "Invoice June 2026"
    $macro_variable = "Sub AutoOpen()"
  condition:
    any of them
}`,
    },
    {
      language: 'Sigma',
      code: `title: Evil-Domain Phishing Campaign
id: phish-2026-evil-domain
status: test
logsource:
  category: email
  product: m365
detection:
  selection:
    SenderDomain: 'evil-domain.xyz'
    Subject|contains: 'Invoice'
  condition: selection
falsepositives:
  - Unknown
level: high`,
    },
  ],
};

const PHASES: PhaseSection[] = [
  {
    id: 'triage',
    icon: Search,
    title: 'Triage & Classification',
    purpose: 'Determine if the reported email is a phish, BEC, spam, or benign.',
    description:
      'Initial assessment of the reported email. Review the subject, sender, urgency cues, and any embedded threats. Classify into category and assign severity.',
    decisionTree: [
      'Does the email contain urgent language? → Yes: escalate to phish/BEC',
      'Is the sender domain suspicious or newly registered? → Yes: phish',
      'Are there mismatched display name / From address? → Yes: phish',
      'Does the email request credential entry or payment? → Yes: BEC or phish',
      'If none of the above, classify as spam or benign',
    ],
    tools: ['Email gateway review', 'Header analysis tool', 'Threat intelligence lookup', 'URL preview'],
    queries: QUERIES.triage,
    escalationL1: ['External sender with urgent language', 'Any spoofed display name', 'Unusual attachment type'],
    escalationL2: ['SPF/DKIM/DMARC failure', 'Known malicious sender domain', 'URL pointing to credential harvester'],
    escalationL3: ['Credential harvesting confirmed', 'Malware delivered', 'Multiple users targeted'],
    artifacts: ['Original email (EML/MSG)', 'Email headers (full)', 'Verdict classification'],
  },
  {
    id: 'header',
    icon: Shield,
    title: 'Header Analysis',
    purpose: 'Extract SPF/DKIM/DMARC verdicts, trace hop chain, and identify sender origination.',
    description:
      'Parse email headers to validate authentication results, trace the email path through MTAs, and identify the true originating IP.',
    decisionTree: [
      'SPF pass/fail? → Fail: sender IP not authorized',
      'DKIM signature valid? → Fail: message may be tampered',
      'DMARC policy? → none: no protection, quarantine: partial, reject: strong',
      'Reply-To differs from From? → BEC indicator',
      'Hop chain shows unusual route? → proxy / relay abuse',
    ],
    tools: ['Header parser', 'SPF/DKIM/DMARC validator', 'IP geolocation', 'Reverse DNS'],
    queries: QUERIES.header,
    escalationL1: ['DMARC policy = none', 'SPF softfail', 'Single Received hop'],
    escalationL2: ['SPF hardfail', 'DKIM signature mismatch', 'Sender IP in known blocklist'],
    escalationL3: ['Full auth failure chain (SPF + DKIM + DMARC all fail)'],
    artifacts: ['Full email headers (text)', 'SPF/DKIM/DMARC verdicts', 'Originating IP'],
  },
  {
    id: 'url',
    icon: Link2,
    title: 'URL Investigation',
    purpose: 'Reputation check, sandbox screenshot, domain age, and URL structure analysis.',
    description:
      'Extract all URLs from the email and analyze each for malicious intent. Check domain registration age, urlscan.io reputation, and redirect chains.',
    decisionTree: [
      'URL uses HTTPS with suspicious domain? → check cert transparency',
      'Domain registered < 30 days ago? → likely malicious',
      'URL has encoded characters or redirects? → obfuscation attempt',
      'urlscan.io verdict malicious? → sandbox detonation',
      'Shortened URL? → expand and scan original target',
    ],
    tools: ['urlscan.io', 'VirusTotal URL', 'WHOIS lookup', 'Domain age checker', 'URL decoder'],
    queries: QUERIES.url,
    escalationL1: ['URL pointing to known phishing kit', 'Suspicious domain age < 90 days'],
    escalationL2: ['Malicious urlscan verdict', 'Redirect chain to credential harvester'],
    escalationL3: ['Active phishing page with credential capture form', 'Drive-by download detected'],
    artifacts: ['Extracted URLs (full)', 'urlscan.io screenshots', 'Domain WHOIS records', 'Redirect chain'],
  },
  {
    id: 'attachment',
    icon: FileBox,
    title: 'Attachment Analysis',
    purpose: 'Hash calculation, sandbox submission, static analysis, and YARA scan.',
    description:
      'Analyze attachments using hash lookups (VirusTotal), static analysis (file type, macros), and behavioral sandbox detonation.',
    decisionTree: [
      'File type matches extension? → no: extension spoofing',
      'Macros or scripts present? → likely malicious',
      'VirusTotal hits > 0? → known malware',
      'Sandbox creates network connections? → C2 beacon',
      'YARA rule matches? → known family',
    ],
    tools: ['VirusTotal', 'Cape sandbox', 'Joe Sandbox', 'YARA', 'OLE tools', 'PE analyzer'],
    queries: QUERIES.attachment,
    escalationL1: ['Unusual attachment extension', 'Attachment > 10MB'],
    escalationL2: ['Macro-enabled document', 'VirusTotal hit on hash'],
    escalationL3: ['Sandbox detonation shows C2 beacon', 'Ransomware or loader binary'],
    artifacts: ['File hash (MD5, SHA-256)', 'Sandbox report', 'YARA scan results', 'Extracted payload'],
  },
  {
    id: 'identity',
    icon: User,
    title: 'Identity & Session Review',
    purpose: 'Review MFA events, logins, Okta alerts, and session activity for the targeted user.',
    description:
      'Check if the phishing campaign successfully compromised identities. Review authentication logs, MFA events, and suspicious session activity.',
    decisionTree: [
      'Did user click the link? → Yes: credential harvesting likely',
      'Any successful logins after the email? → potential compromise',
      'MFA prompts accepted from unusual locations? → account takeover',
      'New devices registered? → persistence',
      'Mailbox login from unfamiliar IP? → data access',
    ],
    tools: ['Azure AD Sign-in Logs', 'Okta System Log', 'M365 Unified Audit Log', 'Risky Users report'],
    queries: QUERIES.identity,
    escalationL1: ['User clicked phishing URL', 'Suspicious login within 1 hour of email'],
    escalationL2: ['Successful login from unusual geo', 'MFA prompt accepted by user'],
    escalationL3: ['Multiple compromised accounts', 'Mailbox data exfiltration detected'],
    artifacts: ['Sign-in log entries', 'MFA event details', 'IP geolocation data', 'Session IDs'],
  },
  {
    id: 'scope',
    icon: Search,
    title: 'Scope Determination',
    purpose: 'Mailbox search, inbox rules, forwarding rules, Teams and Zoom abuse check.',
    description:
      'Determine the full scope of the compromise. Search all mailboxes for the phishing email, check for inbox rules, and investigate lateral movement vectors.',
    decisionTree: [
      'How many users received the email? → scope of email blast',
      'Any inbox rules created? → forward/redirect/auto-delete',
      'Mailbox forwarding enabled? → data exfiltration route',
      'Teams / Zoom meeting invites with same context? → lateral phishing',
      'OneDrive/SharePoint file access from unusual IP? → data theft',
    ],
    tools: ['M365 eDiscovery', 'Exchange Admin Center', 'Teams audit logs', 'SharePoint audit logs'],
    queries: QUERIES.scope,
    escalationL1: ['Email sent to > 10 users', 'Inbox rule created after email'],
    escalationL2: ['Mailbox forwarding rule added', 'Teams meeting with phishing context'],
    escalationL3: ['Widespread distribution (100+ users)', 'Cross-tenant forwarding detected'],
    artifacts: ['Complete recipient list', 'Inbox rule inventory', 'Forwarding configuration', 'Teams/Zoom audit'],
  },
  {
    id: 'containment',
    icon: Lock,
    title: 'Containment',
    purpose: 'Block indicators, quarantine emails, disable accounts, and delete malicious messages.',
    description:
      'Execute containment actions to prevent further compromise. Block IOCs at the gateway, quarantine the malicious email across all recipients, and secure compromised accounts.',
    decisionTree: [
      'Block sender domain at gateway → immediate action',
      'Quarantine email from all mailboxes → stop further access',
      'Block URLs at proxy → prevent re-visit',
      'Disable compromised accounts → stop active sessions',
      'Reset passwords and revoke tokens → re-secure identity',
    ],
    tools: ['Email security gateway', 'M365 Security & Compliance', 'EDR blocklist', 'IAM admin console'],
    queries: QUERIES.containment,
    escalationL1: ['Block sender domain', 'Quarantine email from one mailbox'],
    escalationL2: ['Disable user account', 'Block URL at proxy level'],
    escalationL3: ['Mass quarantine across all tenants', 'Emergency incident response activation'],
    artifacts: ['Containment actions taken (list)', 'Blocklist entries', 'Ticket/incident IDs'],
  },
  {
    id: 'remediation',
    icon: RefreshCw,
    title: 'Remediation',
    purpose: 'Password reset, MFA enforcement, user training, and system hardening.',
    description:
      'Restore affected systems to a secure state. Ensure compromised accounts are fully remediated, MFA is enforced, and users receive security awareness training.',
    decisionTree: [
      'Password reset forced on all affected accounts?',
      'MFA re-enrolled for compromised accounts?',
      'Conditional Access policies updated?',
      'User notified and assigned training?',
      'DMARC policy updated to reject?',
    ],
    tools: ['IAM platform', 'M365 Admin Center', 'Security awareness platform', 'Conditional Access'],
    queries: QUERIES.remediation,
    escalationL1: ['Password reset for affected user', 'MFA re-enrollment'],
    escalationL2: ['Conditional Access policy creation', 'DMARC policy update to quarantine/reject'],
    escalationL3: ['Full tenant security review', 'Architecture change (e.g. DMARC reject, MFA enforced)'],
    artifacts: ['Password change confirmation', 'MFA registration audit', 'Training assignment records'],
  },
  {
    id: 'post',
    icon: ClipboardCheck,
    title: 'Post-Incident',
    purpose: 'IOC sharing, signature creation (YARA/Sigma), lessons learned, and report generation.',
    description:
      'Finalize the incident with knowledge-sharing artifacts. Publish IOCs to threat intel platforms, create detection signatures, and conduct a lessons-learned review.',
    decisionTree: [
      'Share IOCs with threat intel platform (MISP)?',
      'Create YARA rules for any new malware family?',
      'Write Sigma rule for detection across SIEMs?',
      'Conduct lessons learned with team?',
      'Update incident response runbook?',
    ],
    tools: ['MISP', 'YARA', 'Sigma', 'STIX/TAXII', 'Incident management platform'],
    queries: QUERIES.post,
    escalationL1: ['Share IOCs via blocklist', 'Write basic YARA rule'],
    escalationL2: ['Publish to MISP community', 'Create Sigma detection rule'],
    escalationL3: ['Cross-organization threat advisory', 'New detection content across all SOC tools'],
    artifacts: ['IOC list (STIX 2.1)', 'YARA rules', 'Sigma rules', 'Incident report (PDF/markdown)'],
  },
];

export default function PhishBook(): JSX.Element {
  const [expanded, setExpanded] = useState<string | null>('triage');

  const toggle = (id: string) => {
    setExpanded((prev) => (prev === id ? null : id));
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-10">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <BookOpen size={28} className="text-brand-600 dark:text-brand-400" /> PHISHBOOK
        </h1>
        <p className="text-muted max-w-2xl leading-relaxed">
          Phishing Incident Response Playbook — decision trees, enrichment tools, query templates, and escalation
          criteria across 9 investigation phases.
        </p>
      </div>

      <div className="mb-8">
        <div className="surface-card p-4 flex items-center gap-4 overflow-x-auto">
          {PHASES.map((p, i) => {
            const isExpanded = expanded === p.id;
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono font-semibold whitespace-nowrap transition-colors ${
                  isExpanded
                    ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border border-brand-300/50 dark:border-brand-700/50'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                }`}
              >
                <Icon size={14} />
                <span>{i + 1}</span>
                <span className="hidden sm:inline">{p.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-6">
        {PHASES.map((phase) => {
          const open = expanded === phase.id;
          const Icon = phase.icon;
          return (
            <div
              key={phase.id}
              className={`surface-card overflow-hidden transition-all ${open ? 'ring-1 ring-brand-500/20' : ''}`}
            >
              <button
                type="button"
                onClick={() => toggle(phase.id)}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors cursor-pointer"
                aria-expanded={open}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
                    <Icon size={16} className="text-brand-600 dark:text-brand-400" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-display font-bold text-sm">{phase.title}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{phase.purpose}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-[10px] font-mono text-slate-400">
                    {PHASES.indexOf(phase) + 1} / {PHASES.length}
                  </span>
                  {open ? (
                    <ChevronDown size={16} className="text-slate-400" />
                  ) : (
                    <ChevronRight size={16} className="text-slate-400" />
                  )}
                </div>
              </button>

              {open && (
                <div className="px-5 pb-6 space-y-6 animate-fade-in-up">
                  <p className="text-sm text-muted leading-relaxed">{phase.description}</p>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                      <h3 className="font-display font-bold text-xs mb-3 flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                        <ArrowRight size={12} /> Decision Flow
                      </h3>
                      <div className="space-y-2">
                        {phase.decisionTree.map((d, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-2 text-xs font-mono text-slate-700 dark:text-slate-300"
                          >
                            <span
                              className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                d.includes('Yes') ||
                                d.includes('phish') ||
                                d.includes('malicious') ||
                                d.includes('compromise')
                                  ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                              }`}
                            >
                              {i + 1}
                            </span>
                            <span>{d}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-display font-bold text-xs mb-3 flex items-center gap-2 text-sky-700 dark:text-sky-400">
                        <Shield size={12} /> Enrichment Tools
                      </h3>
                      <div className="flex flex-wrap gap-2 mb-6">
                        {phase.tools.map((t) => (
                          <span
                            key={t}
                            className="text-[10px] font-mono px-2 py-1 rounded-md bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 border border-sky-200/50 dark:border-sky-800/50"
                          >
                            {t}
                          </span>
                        ))}
                      </div>

                      <h3 className="font-display font-bold text-xs mb-3 flex items-center gap-2 text-amber-700 dark:text-amber-400">
                        <AlertTriangle size={12} /> Escalation Triggers
                      </h3>
                      <div className="space-y-1.5 text-xs font-mono">
                        {phase.escalationL1.length > 0 && (
                          <div className="flex items-start gap-2">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 flex-shrink-0 mt-0.5">
                              L1
                            </span>
                            <span className="text-muted">{phase.escalationL1.join(', ')}</span>
                          </div>
                        )}
                        {phase.escalationL2.length > 0 && (
                          <div className="flex items-start gap-2">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 flex-shrink-0 mt-0.5">
                              L2
                            </span>
                            <span className="text-muted">{phase.escalationL2.join(', ')}</span>
                          </div>
                        )}
                        {phase.escalationL3.length > 0 && (
                          <div className="flex items-start gap-2">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 flex-shrink-0 mt-0.5">
                              L3
                            </span>
                            <span className="text-muted">{phase.escalationL3.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-display font-bold text-xs mb-3 flex items-center gap-2 text-brand-700 dark:text-brand-400">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="4 17 10 11 4 5" />
                        <line x1="12" y1="19" x2="20" y2="19" />
                      </svg>
                      Query Templates
                    </h3>
                    <div className="space-y-3">
                      {phase.queries.map((q, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-950/5 dark:bg-slate-950/30 overflow-hidden"
                        >
                          <div className="flex items-center justify-between px-4 py-2 bg-slate-100/50 dark:bg-[rgb(var(--surface-200))]/50 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                            <span className="text-[10px] font-mono font-bold text-slate-500">{q.language}</span>
                            <CopyButton value={q.code} title={`Copy ${q.language} query`} />
                          </div>
                          <pre className="p-4 text-xs font-mono text-slate-700 dark:text-slate-300 overflow-x-auto leading-relaxed">
                            {q.code}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-display font-bold text-xs mb-3 flex items-center gap-2 text-purple-700 dark:text-purple-400">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                      Key Artifacts
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {phase.artifacts.map((a) => (
                        <span
                          key={a}
                          className="text-[10px] font-mono px-2 py-1 rounded-md bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200/50 dark:border-purple-800/50 flex items-center gap-1"
                        >
                          <CheckCircle2 size={10} />
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
