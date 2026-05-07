export type WikiCategory =
  | 'Email Security'
  | 'Threat Intelligence'
  | 'Forensics'
  | 'Detection Engineering'
  | 'Attack Types';

export interface WikiArticle {
  slug: string;
  title: string;
  category: WikiCategory;
  description: string;
  body: string; // markdown
}

export const wikiArticles: WikiArticle[] = [
  // ── Email Security ──────────────────────────────────────────────────────────
  {
    slug: 'spf',
    title: 'SPF (Sender Policy Framework)',
    category: 'Email Security',
    description:
      'A DNS-based email authentication protocol that specifies which mail servers are authorized to send email on behalf of a domain.',
    body: `## What is SPF?

Sender Policy Framework (SPF) is a DNS-based email authentication protocol that allows domain owners to specify which mail servers are authorized to send email on behalf of their domain.

## How It Works

1. Domain owner publishes a TXT record in DNS listing the authorized sending IP addresses.
2. Receiving mail server queries the SPF record before accepting the email.
3. If the sending server is not listed, the email may be rejected or marked as spam.

## SPF Record Syntax

\`\`\`
v=spf1 ip4:192.0.2.0/24 include:_spf.example.com ~all
\`\`\`

- **v=spf1** — version identifier
- **ip4** — authorised IPv4 address or CIDR network
- **include** — includes another domain's SPF record
- **~all** — softfail (recommended for initial deployment)

## Best Practices

- Start with \`~all\` (softfail) rather than \`-all\` (fail) until you've validated all sending paths.
- Monitor DMARC aggregate reports before enforcing a strict policy.
- Keep the total number of DNS lookups under 10 to avoid validation failures (RFC 7208 §4.6.4).
`,
  },
  {
    slug: 'dkim',
    title: 'DKIM (DomainKeys Identified Mail)',
    category: 'Email Security',
    description:
      'An email authentication standard that uses public-key cryptography to verify that a message was sent and authorized by the owner of a domain.',
    body: `## What is DKIM?

DKIM is an email authentication standard that uses public-key cryptography to verify that an email was not altered in transit and was sent by the claimed sender.

## How It Works

1. The sending mail server signs the email headers (and optionally the body) with a private key.
2. The public key is published in DNS as a TXT record under \`<selector>._domainkey.<domain>\`.
3. The receiving server fetches the public key and validates the signature.

## DKIM Selectors

DKIM uses selectors to support multiple simultaneous keys (e.g., for key rotation):

- \`default._domainkey.example.com\`
- \`google._domainkey.example.com\`
- \`selector1._domainkey.example.com\`

## Common Provider Selectors

| Provider | Selector |
|---|---|
| Google Workspace | google._domainkey |
| Microsoft 365 | selector1._domainkey |
| Amazon SES | amazonses._domainkey |
| SendGrid | s1._domainkey |

## Key Rotation

Rotate DKIM keys periodically (annually at minimum). Keep the old key in DNS for at least 48 hours after switching to allow in-flight messages to be verified.
`,
  },
  {
    slug: 'dmarc',
    title: 'DMARC (Domain-based Message Authentication, Reporting and Conformance)',
    category: 'Email Security',
    description:
      'An email authentication protocol that builds on SPF and DKIM to give domain owners control over how unauthenticated messages are handled and to enable abuse reporting.',
    body: `## What is DMARC?

DMARC builds on SPF and DKIM to give domain owners explicit control over how receiving mail servers handle messages that fail authentication, and provides mechanisms for aggregate and forensic reporting.

## Policy Values

| Policy | Effect |
|---|---|
| \`p=none\` | Monitor only — no delivery impact |
| \`p=quarantine\` | Mark failing messages as spam |
| \`p=reject\` | Reject failing messages outright |

## DMARC Reports

- **RUA (Aggregate)** — XML reports sent to a mailbox summarising authentication results for a domain.
- **RUF (Forensic)** — Per-message failure reports; use with caution due to privacy implications.

## Example Record

\`\`\`
v=DMARC1; p=reject; rua=mailto:dmarc@example.com; ruf=mailto:forensic@example.com; fo=1
\`\`\`

## Deployment Roadmap

1. Publish \`p=none\` and collect aggregate reports for 2–4 weeks.
2. Confirm all legitimate sending sources pass SPF or DKIM.
3. Step up to \`p=quarantine\` at a low percentage (\`pct=10\`).
4. Ramp pct to 100, then move to \`p=reject\`.
`,
  },
  {
    slug: 'arc-authentication',
    title: 'ARC Authentication',
    category: 'Email Security',
    description:
      'Authenticated Received Chain preserves email authentication results across forwarding hops so receiving servers can evaluate the original authentication state.',
    body: `## What is ARC?

Authenticated Received Chain (ARC) is a protocol that preserves email authentication results across forwarding or mailing-list hops, solving a classic failure mode where DMARC breaks legitimate forwarded mail.

## Why ARC Exists

When a mailing list re-sends a message, the original SPF and DKIM signatures typically no longer verify because the list server modifies headers or changes the envelope sender. DMARC then rejects the mail even though it was originally legitimate.

## How ARC Works

Each intermediary that handles the message appends three headers:

- **ARC-Seal** — signed set of all ARC headers added so far
- **ARC-Message-Signature** — DKIM-style signature of the message at this hop
- **ARC-Authentication-Results** — the authentication results seen at this hop

Receiving servers trust the chain if all seals are valid and the first hop is a trusted intermediary.

## Practical Impact

ARC is evaluated alongside DMARC. A receiving server may override a DMARC \`p=reject\` policy if it trusts the ARC chain. This makes forwarding to Gmail, Microsoft 365, and other strict receivers work without manual whitelisting.
`,
  },
  {
    slug: 'email-header-analysis',
    title: 'Email Header Analysis',
    category: 'Email Security',
    description:
      "The process of examining RFC 5322 email headers to trace a message's delivery path, verify authentication results, and identify anomalies.",
    body: `## Overview

Email headers are structured metadata prepended to a message body. Analysing them reveals the delivery path, authentication outcomes, and potential red flags for phishing or spoofing.

## Key Headers to Examine

| Header | Purpose |
|---|---|
| \`Received\` | Each hop adds a Received header; read bottom-to-top for delivery path |
| \`From\` | Display address — easily forged |
| \`Return-Path\` | Envelope sender used for bounces |
| \`Authentication-Results\` | SPF, DKIM, DMARC results reported by the receiving MTA |
| \`DKIM-Signature\` | Cryptographic signature for the message |
| \`Message-ID\` | Unique identifier; mismatched domain is suspicious |
| \`X-Originating-IP\` | Original client IP (set by some providers) |

## Reading the Received Chain

\`\`\`
Received: from mail.attacker.com (mail.attacker.com [198.51.100.42])
        by mx.victim.com with ESMTP id abc123
        for <user@victim.com>; Wed, 1 Jan 2025 12:00:00 +0000
\`\`\`

- Read from **bottom to top** (oldest hop first).
- Cross-reference originating IP against threat intel feeds.
- Look for clock skew > 10 minutes between hops.

## Common Red Flags

- \`From\` display name matches a trusted entity but envelope sender domain differs.
- Authentication-Results shows \`spf=fail\` or \`dkim=none\`.
- Message-ID domain does not match the From domain.
- Unusually short Received chain (may indicate header injection).
`,
  },
  {
    slug: 'homoglyph-domains',
    title: 'Homoglyph Domains',
    category: 'Email Security',
    description:
      'Domains that substitute visually identical or near-identical Unicode characters to impersonate legitimate domains.',
    body: `## What are Homoglyph Domains?

Homoglyph attacks abuse the visual similarity of Unicode characters to register domains that look identical to legitimate ones in most fonts — for example, replacing the Latin \`a\` (U+0061) with the Cyrillic \`а\` (U+0430).

## Examples

| Legitimate | Homoglyph | Substitution |
|---|---|---|
| paypal.com | pаypal.com | Cyrillic а |
| microsoft.com | mіcrosoft.com | Cyrillic і |
| apple.com | appIe.com | uppercase i for l |

## Detection Techniques

1. **IDN punycode inspection** — Browsers render IDN domains as punycode (\`xn--\`) when characters mix scripts. Look for \`xn--\` in raw headers.
2. **Unicode normalisation** — Normalise domain strings to NFC/NFKC before display.
3. **Script-mixing detection** — Flag domains that mix Latin with Cyrillic, Greek, or other scripts.
4. **Certificate Transparency monitoring** — Subscribe to CT logs for newly-issued certificates containing confusable strings.

## Defensive Measures

- Register common homoglyph variants of your own domain.
- Enable DMARC \`p=reject\` to prevent your real domain from being spoofed directly.
- Use brand monitoring services that watch CT logs for confusable registrations.
`,
  },
  {
    slug: 'email-spoofing',
    title: 'Email Spoofing',
    category: 'Email Security',
    description:
      'The forgery of email header fields to make a message appear to originate from a sender other than its true source.',
    body: `## What is Email Spoofing?

Email spoofing is the manipulation of email headers — most commonly the \`From\` display name or address — to impersonate a trusted sender. Because SMTP has no built-in sender authentication, spoofing has been trivially easy since the protocol's inception.

## Types of Spoofing

| Type | Technique | Detection |
|---|---|---|
| Display-name spoofing | Legitimate-looking name, different email | Inspect raw From address |
| Exact-domain spoofing | Forged \`From\` matches your domain | DMARC \`p=reject\` prevents delivery |
| Cousin-domain spoofing | Similar-looking domain (typosquat) | Threat intel + domain monitoring |
| Lookalike subdomain | legitimate.attacker.com | Brand monitoring |

## Why SPF Alone Is Insufficient

SPF validates the envelope sender (Return-Path), not the \`From\` header visible to end users. An attacker can send from a domain that passes SPF while forging the \`From\` header — only DMARC alignment closes this gap.

## Mitigation

1. Publish SPF, DKIM, and DMARC records for every sending domain.
2. Enforce \`p=reject\` after monitoring.
3. Train users to inspect sender addresses, not just display names.
4. Configure mail clients to flag external emails with a banner.
`,
  },
  {
    slug: 'link-display-mismatch',
    title: 'Link-Display Mismatch',
    category: 'Email Security',
    description:
      'A phishing technique where the visible anchor text shows a different URL than the actual href destination.',
    body: `## What is a Link-Display Mismatch?

A link-display mismatch occurs when the visible text of a hyperlink shows a trusted URL (e.g., \`https://bank.com\`) while the underlying \`href\` points to a malicious site. This exploits the tendency of users to trust what they read rather than what the link actually points to.

## Example

\`\`\`html
<a href="https://evil.example.com/steal">https://legitimate-bank.com</a>
\`\`\`

The user sees a legitimate URL; clicking sends them to the attacker's site.

## Variants

- **URL shorteners** — hide destination behind a redirect service.
- **Open redirects** — \`https://trusted.com/redirect?url=evil.com\` appears trustworthy.
- **Punycode links** — IDN URL in the href renders strangely in some clients.
- **HTML entities** — \`h&#116;tps://bank.com\` may confuse regex-based scanners.

## Detection

Phishing analysis tools parse the raw HTML source and compare \`href\` attributes against the anchor text. Any URL in an \`href\` that does not match its display text is flagged for inspection.

## User Guidance

- Hover over links before clicking to reveal the destination URL.
- Use email clients that surface the raw \`href\` on hover.
- When in doubt, navigate to the destination manually via a bookmark.
`,
  },

  // ── Threat Intelligence ──────────────────────────────────────────────────────
  {
    slug: 'indicators-of-compromise',
    title: 'Indicators of Compromise (IOCs)',
    category: 'Threat Intelligence',
    description:
      'Observable artifacts — IPs, domains, file hashes, URLs — that indicate a system or network may have been breached or targeted.',
    body: `## What are IOCs?

Indicators of Compromise (IOCs) are observable artifacts that, when identified in a system or network, suggest the presence of a threat actor or malicious activity. They are the foundational currency of threat intelligence sharing.

## Common IOC Types

| Type | Examples |
|---|---|
| IP address | 198.51.100.42, 2001:db8::1 |
| Domain name | evil.example.com |
| URL | https://evil.example.com/payload |
| File hash | MD5, SHA-1, SHA-256 of malware samples |
| Email address | phisher@malicious.com |
| Registry key | HKCU\\Software\\Malware\\Persistence |
| Mutex name | \\BaseNamedObjects\\BadMutex |

## Limitations of IOCs

IOCs are **tactical and perishable**. Threat actors rotate infrastructure rapidly. A hash or IP that was malicious yesterday may be inactive today. For this reason, IOCs should be combined with behavioural indicators (TTPs from the MITRE ATT&CK framework) for durable detection.

## IOC Lifecycle

1. **Collection** — from threat intel feeds, sandbox detonations, incident investigations.
2. **Enrichment** — add context (WHOIS, passive DNS, threat actor attribution).
3. **Operationalisation** — push to SIEM, EDR, firewall blocklists.
4. **Expiry** — age out stale IOCs to reduce false positives.
`,
  },
  {
    slug: 'ioc-enrichment',
    title: 'IOC Enrichment',
    category: 'Threat Intelligence',
    description:
      'The process of augmenting raw indicators of compromise with contextual threat intelligence to improve triage speed and accuracy.',
    body: `## What is IOC Enrichment?

IOC enrichment takes a bare indicator (e.g., an IP address) and adds contextual data — registration details, historical DNS, associated malware families, threat actor attribution, and reputation scores — to allow analysts to make faster, more confident triage decisions.

## Enrichment Sources

| Source | Data Provided |
|---|---|
| VirusTotal | Multi-AV scan results, community votes, relationships |
| Shodan | Open ports, banners, historical hosting data |
| PassiveDNS | Historical IP-to-domain mappings |
| WHOIS / RDAP | Registrant, registrar, creation date |
| AbuseIPDB | Crowdsourced abuse reports |
| AlienVault OTX | Threat pulses, malware families |

## Enrichment Workflow

\`\`\`
Raw IOC → Normalise type → Query sources in parallel
       → Aggregate results → Score & classify
       → Push to ticket / SIEM → Archive
\`\`\`

## Scoring Approaches

- **Weighted average** across source reputation scores.
- **Threshold-based** verdicts (clean / suspicious / malicious).
- **TLP-aware** — some intelligence is restricted and cannot be freely shared.
`,
  },
  {
    slug: 'threat-intelligence',
    title: 'Threat Intelligence',
    category: 'Threat Intelligence',
    description:
      'Evidence-based knowledge about existing or emerging cyber threats, including context, mechanisms, and indicators.',
    body: `## What is Threat Intelligence?

Threat intelligence (TI) is evidence-based knowledge about cyber threats — including context, mechanisms, indicators, implications, and actionable advice — used to inform decisions about how to respond to or prevent attacks.

## Intelligence Types

| Type | Time Horizon | Audience |
|---|---|---|
| **Strategic** | Months–years | C-suite, board |
| **Operational** | Days–weeks | SOC managers, IR leads |
| **Tactical** | Hours–days | Analysts, threat hunters |
| **Technical** | Real-time | SIEMs, EDRs, firewalls |

## Intelligence Lifecycle

1. **Planning** — define intelligence requirements (PIRs/SIRs).
2. **Collection** — OSINT, commercial feeds, ISACs, internal telemetry.
3. **Processing** — normalise, deduplicate, translate.
4. **Analysis** — assess credibility, relevance, impact.
5. **Dissemination** — STIX/TAXII feeds, reports, alerting.
6. **Feedback** — measure effectiveness, refine requirements.

## Sharing Standards

- **STIX 2.1** — structured representation of threat intel objects.
- **TAXII 2.1** — transport protocol for sharing STIX bundles.
- **TLP** — Traffic Light Protocol for handling sensitivity.
`,
  },
  {
    slug: 'passive-dns',
    title: 'Passive DNS',
    category: 'Threat Intelligence',
    description:
      'A historical record of DNS resolution data — domain-to-IP mappings observed over time — used for infrastructure pivoting and threat actor tracking.',
    body: `## What is Passive DNS?

Passive DNS is a database of historical DNS resolution data collected by sensors at recursive resolvers or network taps. Unlike active DNS queries (which return the current record), passive DNS shows what a domain resolved to in the past — and when.

## Use Cases

- **Infrastructure pivoting** — find all domains that ever resolved to a suspicious IP.
- **Fast-flux detection** — identify domains with abnormally high IP churn rates.
- **DGA detection** — algorithmically generated domains appear briefly in passive DNS before disappearing.
- **Threat actor attribution** — correlate infrastructure reuse across campaigns.

## Example Query Flow

\`\`\`
IP: 198.51.100.42
  → Passive DNS lookup
  → Domains seen at this IP: evil1.com, evil2.com, c2.malware.net
  → Pivot to each domain
  → Find other IPs, other timeframes, related campaigns
\`\`\`

## Data Providers

- Farsight Security DNSDB
- VirusTotal passive DNS
- SecurityTrails
- RiskIQ (Microsoft Defender TI)
- PassiveDNS.cn

## Limitations

Passive DNS coverage depends on sensor placement. Domains only queried by a small population may not appear in the dataset.
`,
  },
  {
    slug: 'certificate-transparency',
    title: 'Certificate Transparency',
    category: 'Threat Intelligence',
    description:
      'A public logging framework that records all SSL/TLS certificates issued by certificate authorities, enabling monitoring for fraudulent or unexpected certificates.',
    body: `## What is Certificate Transparency?

Certificate Transparency (CT) is an open framework (RFC 6962) that requires Certificate Authorities (CAs) to log every TLS certificate they issue to publicly auditable, append-only logs. This enables domain owners to detect misissued or fraudulent certificates.

## How It Works

1. CA issues a certificate and submits it to one or more CT logs.
2. The log returns a **Signed Certificate Timestamp (SCT)** that is embedded in the certificate.
3. Browsers verify the SCT is present before trusting the certificate.
4. Anyone can query CT logs for certificates issued to any domain.

## Security Applications

- **Brand monitoring** — watch for certificates issued to lookalike domains (typosquats, homoglyphs).
- **Subdomain discovery** — CT logs reveal subdomains that may not be in DNS.
- **Phishing infrastructure tracking** — attackers often obtain free certificates before launching campaigns.
- **CA mis-issuance detection** — organisations can detect if a CA issues a cert for their domain without authorisation.

## Monitoring Tools

- **crt.sh** — free public CT log search.
- **certstream** — real-time feed of newly-issued certificates.
- **Facebook CT monitoring** — free alerts for your registered domains.
`,
  },
  {
    slug: 'whois-lookup',
    title: 'WHOIS / RDAP Lookup',
    category: 'Threat Intelligence',
    description:
      'A protocol for querying domain registration information — registrant, registrar, dates — used to attribute infrastructure and detect suspicious registrations.',
    body: `## What is WHOIS?

WHOIS is a query/response protocol (RFC 3912) that provides information about domain name registrations — including registrant contact details, registrar, creation/expiry dates, and nameservers. RDAP (Registration Data Access Protocol, RFC 7480) is its modern JSON-based successor.

## Key Fields for Threat Intel

| Field | Intelligence Value |
|---|---|
| Creation date | Newly-registered domains are high-risk |
| Registrar | Certain registrars are frequently abused |
| Registrant email | Pivot to other domains registered with same email |
| Nameservers | Shared infrastructure signals clustering |
| Privacy proxy | Masked registrant data is common for malicious domains |

## Freshly-Registered Domain Heuristics

Threat actors often register domains days or hours before a campaign. A domain created within 30 days combined with:
- Privacy-protected WHOIS
- Bulletproof hosting ASN
- No web presence

…is a strong signal of malicious intent.

## RDAP vs WHOIS

RDAP provides structured JSON responses, supports internationalised registration data, and has access controls. Prefer RDAP for programmatic lookups; fall back to WHOIS for legacy infrastructure.
`,
  },
  {
    slug: 'domain-reputation',
    title: 'Domain Reputation',
    category: 'Threat Intelligence',
    description:
      'A score or classification assigned to a domain based on historical behaviour, association with malicious activity, and infrastructure signals.',
    body: `## What is Domain Reputation?

Domain reputation is a composite score derived from multiple signals that indicates how likely a domain is to be associated with malicious activity — phishing, malware distribution, spam, or command-and-control.

## Reputation Signals

| Signal | Weight |
|---|---|
| Age of domain | High (new = risky) |
| WHOIS privacy | Medium |
| Malware/phishing history | Very high |
| Hosting ASN | Medium (bulletproof ASNs are red flags) |
| Passive DNS volatility | High (fast-flux) |
| Certificate Transparency age | Medium |
| AV detection rate | Very high |

## Reputation Sources

- VirusTotal — aggregates 70+ AV and URL scanner results
- Google Safe Browsing — phishing and malware blacklist
- Spamhaus — spam and botnet infrastructure
- AbuseIPDB — community-reported abuse
- Palo Alto URL Filtering — enterprise-grade classification

## Handling Low-Reputation Domains

- Block at DNS resolver for known-malicious domains.
- Alert on access to newly-registered / low-reputation domains.
- Never click links to low-reputation domains in email without sandboxing.
`,
  },
  {
    slug: 'ip-reputation',
    title: 'IP Reputation',
    category: 'Threat Intelligence',
    description:
      'A score or classification assigned to an IP address based on observed malicious activity, geolocation, hosting provider, and threat actor association.',
    body: `## What is IP Reputation?

IP reputation is an aggregate assessment of how likely a given IP address is to be used for malicious purposes, based on observed behaviour and infrastructure signals.

## Key Signals

| Signal | Details |
|---|---|
| Abuse history | Prior reports of spam, scanning, exploitation |
| ASN / hosting provider | Bulletproof hosts (e.g., AS174, certain RU/CN ASNs) |
| Geolocation | Not deterministic but contextually relevant |
| Open ports | SSH/RDP exposed on non-standard ports can signal C2 |
| Tor exit node | IPs used as Tor exits appear in threat feeds |
| VPN / proxy | Anonymising services used to evade attribution |

## Reputation Feeds

- **Spamhaus XBL** — IPs used to send spam
- **CINS Score** — network-level threat scoring
- **Emerging Threats** — open feed of known-bad IPs
- **AbuseIPDB** — crowdsourced IP abuse reports
- **Shodan** — port/banner data useful for context

## False Positive Considerations

Cloud provider IP ranges (AWS, GCP, Azure) are often shared. A malicious actor may use the same IP range as legitimate services. Always enrich with additional context before blocking production traffic.
`,
  },
  {
    slug: 'threat-actor-profiling',
    title: 'Threat Actor Profiling',
    category: 'Threat Intelligence',
    description:
      'The process of identifying and documenting threat group tactics, infrastructure patterns, and objectives to enable attribution and predictive defence.',
    body: `## What is Threat Actor Profiling?

Threat actor profiling is the systematic collection and analysis of information about adversary groups — their motivations, capabilities, tactics, techniques, and procedures (TTPs), and infrastructure — to enable attribution and proactive defence.

## Profile Components

- **Motivation** — financial gain, espionage, hacktivism, sabotage
- **Sophistication level** — script kiddie to nation-state APT
- **Target sectors** — finance, healthcare, critical infrastructure
- **TTPs** — mapped to MITRE ATT&CK
- **Infrastructure** — known C2 domains, IPs, ASNs, hosting providers
- **Malware tooling** — custom implants, commodity RATs

## Diamond Model

The Diamond Model of Intrusion Analysis structures actor profiling around four vertices:

\`\`\`
    Adversary ─────── Capability
        │                  │
     Infrastructure ─── Victim
\`\`\`

Pivoting between vertices allows analysts to uncover related activity across campaigns.

## Attribution Challenges

- Threat actors reuse and share infrastructure.
- Nation-states conduct false-flag operations.
- Attribution requires a high evidentiary bar; treat all attributions with appropriate uncertainty.
`,
  },
  {
    slug: 'dns-security',
    title: 'DNS Security',
    category: 'Threat Intelligence',
    description:
      'Practices and technologies for protecting DNS infrastructure against manipulation, exfiltration, and abuse as a covert channel.',
    body: `## Why DNS Security Matters

DNS is often called "the phonebook of the internet," but it is also one of the most abused protocols by threat actors — used for C2 communication, data exfiltration, fast-flux hosting, and DGA-based botnet resilience.

## Common DNS Threats

| Threat | Description |
|---|---|
| **DNS hijacking** | Redirecting queries to attacker-controlled resolvers |
| **DNS cache poisoning** | Injecting false records into resolver caches |
| **DNS tunneling** | Encoding data in DNS queries/responses for covert C2 |
| **Fast-flux** | Rapidly rotating IP records to evade blocklists |
| **DGA domains** | Algorithmically generated C2 domains |

## Defensive Technologies

- **DNSSEC** — cryptographic signing of DNS records prevents cache poisoning.
- **DoT / DoH** — DNS-over-TLS and DNS-over-HTTPS prevent eavesdropping and tampering in transit.
- **RPZ (Response Policy Zones)** — resolver-level blocking of known-malicious domains.
- **Protective DNS** — cloud services (Cloudflare Gateway, Cisco Umbrella) that block malicious domains at the resolver level.

## DNS Monitoring

- Log all DNS queries from endpoints.
- Alert on queries to newly-registered domains.
- Detect high query rates to unusual domains (potential tunneling).
`,
  },
  {
    slug: 'ssl-tls-certificates',
    title: 'SSL/TLS Certificates',
    category: 'Threat Intelligence',
    description:
      'Digital certificates that authenticate server identity and enable encrypted communications — a key infrastructure signal in threat intelligence.',
    body: `## SSL/TLS Certificates as Intelligence

While TLS certificates primarily serve a security function (authentication + encryption), they are rich sources of threat intelligence. Certificate data is entirely public via Certificate Transparency logs.

## Certificate Fields of Interest

| Field | Intelligence Value |
|---|---|
| Subject CN / SAN | Actual hostnames being secured |
| Issuer | Let's Encrypt certificates are free and commonly abused |
| Serial number | Pivoting to related certificates from the same CA account |
| Valid from / to | Short-lived certs can indicate automation |
| Organisation | Fake company names in DV certs |
| Fingerprint | SHA-256 fingerprint for IOC tracking |

## Let's Encrypt Abuse

Let's Encrypt's free, automated DV certificates are heavily used by phishers — HTTPS is no longer a trust signal. A site can have a valid TLS certificate and still be malicious.

## Certificate Pivoting

From a known-malicious domain:
1. Retrieve certificate fingerprint.
2. Search CT logs for other certificates with the same fingerprint or issued to the same Organisation.
3. Uncover related phishing infrastructure.

## Tools

- crt.sh — CT log search
- Censys — certificate search and pivoting
- SSL Labs — certificate configuration analysis
`,
  },
  {
    slug: 'attack-surface-management',
    title: 'Attack Surface Management',
    category: 'Threat Intelligence',
    description:
      "The continuous process of discovering, inventorying, classifying, and reducing an organisation's externally exposed digital assets.",
    body: `## What is Attack Surface Management?

Attack Surface Management (ASM) is the continuous discovery, inventory, classification, prioritisation, and security monitoring of an organisation's internet-facing digital assets — including assets the organisation may not be aware of (shadow IT, acquired infrastructure).

## Components of the External Attack Surface

- **Domains and subdomains** — discovered via CT logs, passive DNS, brute-force
- **IP ranges** — allocated ASNs, cloud provider accounts
- **Open ports and services** — web, SSH, RDP, databases
- **SSL/TLS certificates** — issued to your domains
- **Email infrastructure** — SPF/DKIM/DMARC configuration
- **Third-party integrations** — SaaS, APIs, CDNs

## ASM Lifecycle

\`\`\`
Discover → Inventory → Classify → Prioritise → Remediate → Monitor
\`\`\`

## Key Metrics

- **Mean Time to Discover** (MTD) — how quickly new assets appear in inventory
- **Exposure score** — aggregate risk across all exposed assets
- **Unknown asset ratio** — percentage of discovered assets not in CMDB

## Tools

- Shodan — internet-wide port scanning
- Censys — certificate and port data
- SecurityTrails — domain and DNS history
- RiskIQ Surface — commercial ASM platform
`,
  },
  {
    slug: 'open-ports',
    title: 'Open Ports',
    category: 'Threat Intelligence',
    description:
      "Network ports on a host that are accepting connections — a key signal for understanding an asset's exposure and potential attack vectors.",
    body: `## Open Ports as Intelligence

Every open port is a potential attack vector. Internet-wide scanners like Shodan continuously map open ports across the public internet, providing threat intelligence teams with visibility into exposed services.

## High-Risk Ports

| Port | Service | Risk |
|---|---|---|
| 22 | SSH | Brute-force attacks |
| 23 | Telnet | Cleartext authentication |
| 3389 | RDP | Ransomware initial access |
| 445 | SMB | WannaCry / EternalBlue |
| 1433 | MSSQL | Direct database exposure |
| 5900 | VNC | Remote desktop hijacking |
| 6379 | Redis | Unauthenticated by default |
| 9200 | Elasticsearch | Data exposure |

## Shodan Queries for Threat Intel

\`\`\`
org:"Target Corp" port:3389
ssl.cert.subject.cn:"*.target.com" port:443
\`\`\`

## Defensive Actions

- Restrict internet-facing services to necessary ports only.
- Use a firewall or security group to deny all inbound except required ports.
- Deploy honeypots on common attack ports to detect scanning activity.
`,
  },
  {
    slug: 'vulnerability-scanning',
    title: 'Vulnerability Scanning',
    category: 'Threat Intelligence',
    description:
      'The automated process of identifying security weaknesses in systems, services, and configurations before attackers can exploit them.',
    body: `## What is Vulnerability Scanning?

Vulnerability scanning is the automated process of probing systems, services, and configurations to identify known security weaknesses — missing patches, misconfigured services, weak credentials, and exposed attack surface.

## Scan Types

| Type | Scope | Authentication |
|---|---|---|
| Network / port scan | Open ports and services | None |
| Unauthenticated vuln scan | CVE matching on banners | None |
| Authenticated scan | Deep OS and application checks | Credentials required |
| Web application scan | OWASP Top 10 in web apps | Optional |

## Common Tools

- **Nessus** — enterprise vulnerability management
- **OpenVAS** — open-source alternative
- **Nuclei** — template-based, fast external scanning
- **Nikto** — web server misconfiguration scanning
- **Nmap NSE** — scripted service-level checks

## Integrating with Threat Intel

Combine CVE data with exploit availability data (Exploit-DB, CISA KEV) to prioritise patching. A vulnerability rated CVSS 7.0 with a public exploit in active use is far more urgent than a CVSS 9.0 with no known exploitation.

## CISA KEV

The CISA Known Exploited Vulnerabilities (KEV) catalogue lists CVEs actively exploited in the wild. Remediating KEV entries should take absolute priority.
`,
  },

  // ── Forensics ────────────────────────────────────────────────────────────────
  {
    slug: 'digital-forensics',
    title: 'Digital Forensics',
    category: 'Forensics',
    description:
      'The scientific discipline of identifying, preserving, analysing, and presenting digital evidence in a forensically sound manner.',
    body: `## What is Digital Forensics?

Digital forensics (DF) is the application of scientific investigation methods to identify, preserve, extract, analyse, and present digital evidence from computers, networks, mobile devices, and cloud systems — in a manner that maintains evidentiary integrity.

## Core Principles

1. **Preserve evidence integrity** — use write blockers; document chain of custody.
2. **Work from copies** — forensic images, not originals.
3. **Document everything** — timestamped notes, tool versions, hash verification.
4. **Maintain chain of custody** — evidence handling logs for legal admissibility.

## Evidence Sources

| Source | Examples |
|---|---|
| Disk | MFT, deleted files, registry, prefetch |
| Memory | Running processes, encryption keys, network sockets |
| Network | PCAP, NetFlow, DNS logs, proxy logs |
| Cloud | CloudTrail, Azure Monitor, GCP audit logs |
| Mobile | Call records, app data, location history |

## Forensic Imaging

\`\`\`bash
# Create a forensic image with hash verification
dc3dd if=/dev/sda of=/evidence/disk.img hash=sha256 log=/evidence/hash.log
\`\`\`

## Artefact Hierarchy (Locard's Exchange Principle)

Every contact leaves a trace. In digital forensics, every action — file creation, login, network connection — leaves artefacts in multiple locations. Cross-correlating artefacts across sources increases evidentiary strength.
`,
  },
  {
    slug: 'incident-response',
    title: 'Incident Response',
    category: 'Forensics',
    description:
      'The organised approach to detecting, containing, eradicating, and recovering from cybersecurity incidents while minimising damage.',
    body: `## What is Incident Response?

Incident Response (IR) is the structured methodology used by organisations to prepare for, detect, contain, eradicate, and recover from cybersecurity incidents — and to learn from them to prevent recurrence.

## IR Lifecycle (NIST SP 800-61)

\`\`\`
Preparation → Detection & Analysis → Containment, Eradication & Recovery → Post-Incident Activity
\`\`\`

## Phase Details

### Preparation
- Develop IR plan, playbooks, and runbooks.
- Ensure logging is in place across all critical systems.
- Establish communication channels and escalation paths.

### Detection & Analysis
- Triage alerts from SIEM, EDR, email security.
- Determine scope, affected systems, and initial timeline.
- Classify incident severity.

### Containment
- **Short-term** — isolate affected hosts, revoke credentials.
- **Long-term** — patch, reconfigure, or replace compromised systems.

### Eradication
- Remove malware, backdoors, and persistence mechanisms.
- Verify clean state with forensic analysis.

### Recovery
- Restore from clean backups.
- Monitor restored systems closely for signs of re-infection.

### Post-Incident
- Write incident report with root cause analysis.
- Update detection rules and playbooks.
- Measure metrics: MTTD, MTTR.
`,
  },
  {
    slug: 'phishing-analysis',
    title: 'Phishing Email Analysis',
    category: 'Forensics',
    description:
      'The forensic examination of suspected phishing emails — parsing headers, verifying authentication, and extracting malicious indicators.',
    body: `## Phishing Analysis Workflow

Phishing analysis is the systematic examination of a suspected phishing email to determine its origin, technique, and payload — and to extract indicators for defensive use.

## Step 1: Obtain Raw Source

From most mail clients: **View → Show Original** (Gmail) or **File → Properties** (Outlook). Never click links in the email itself.

## Step 2: Parse Headers

Key headers to examine:
- \`Authentication-Results\` — did SPF, DKIM, DMARC pass?
- \`Received\` chain — trace the actual sending IP.
- \`From\` vs \`Return-Path\` — mismatch is a red flag.
- \`Message-ID\` — domain mismatch from From: is suspicious.

## Step 3: Extract IOCs

- URLs (compare display text vs href)
- Sender IP from Received headers
- Attachment hashes (MD5, SHA-256)
- Embedded domains

## Step 4: Analyse Payload

- Submit URLs to URLScan.io or VirusTotal.
- Submit attachments to a sandbox (Any.run, Hybrid Analysis).
- Detonate in an isolated VM if automated analysis is inconclusive.

## Step 5: Classify and Report

- **Verdict**: benign / suspicious / malicious
- **Technique**: credential harvest, malware delivery, BEC, etc.
- **Target**: who was this sent to? Is this targeted or bulk?

## IOC Extraction Tools

- Email Header Analyser (MXToolbox)
- PhishTool
- DKIM Verifier browser extension
`,
  },
  {
    slug: 'timeline-analysis',
    title: 'Timeline Analysis',
    category: 'Forensics',
    description:
      'The process of reconstructing a chronological sequence of events across multiple evidence sources to understand attacker actions.',
    body: `## What is Timeline Analysis?

Timeline analysis is the forensic technique of correlating timestamps from multiple evidence sources to reconstruct a chronological sequence of attacker actions during an incident.

## Evidence Sources for Timelines

| Source | Timestamps Available |
|---|---|
| NTFS MFT ($STANDARD_INFORMATION) | $CREATED, $MODIFIED, $MFT_MODIFIED, $ACCESSED (MACB) |
| Windows Event Logs | Logon events, process creation, service installs |
| Prefetch files | Last execution time + prior 7 timestamps |
| Sysmon | Process creation, network connections, file operations |
| Web proxy logs | URL access with timestamps |
| DNS logs | Resolution timestamps |
| Cloud audit logs | API call timestamps with source IPs |

## MACB Timestamps

Windows NTFS maintains four timestamps per file:
- **M**odified — last write to file content
- **A**ccessed — last read
- **C**hanged — MFT entry modified ($MFT_MODIFIED)
- **B**orn — file creation ($CREATED)

Attackers sometimes timestomp (modify) these timestamps. Cross-correlation with other artefacts (prefetch, Sysmon) can detect tampering.

## Tooling

\`\`\`bash
# Plaso / log2timeline — generates a supertimeline from multiple sources
log2timeline.py evidence.plaso /evidence/disk.img
psort.py -o l2tcsv evidence.plaso > timeline.csv
\`\`\`
`,
  },
  {
    slug: 'log-analysis',
    title: 'Log Analysis',
    category: 'Forensics',
    description:
      'The examination of system, application, and network logs to reconstruct events, detect anomalies, and gather evidence during an investigation.',
    body: `## Why Log Analysis?

Logs are the primary source of post-hoc visibility in most IR investigations. Effective log analysis requires understanding what each log source records, what it does not record, and how to correlate across sources.

## Critical Log Sources

| Source | What It Records |
|---|---|
| Windows Security Event Log | Logons (4624/4625), privilege use, account changes |
| Sysmon | Process creation (1), network (3), file (11), registry (13) |
| Web server logs | HTTP requests, user-agent, source IP |
| Firewall / NSG logs | Allow/deny by IP:port |
| DNS server logs | Query/response by client IP |
| Cloud provider audit | API calls with identity and source |
| Email server logs | SMTP transactions, relay chains |

## Key Event IDs (Windows)

| ID | Meaning |
|---|---|
| 4624 | Successful logon |
| 4625 | Failed logon |
| 4688 | Process creation |
| 4698 | Scheduled task created |
| 7045 | New service installed |
| 4672 | Special privileges assigned |

## Log Retention

NIST recommends retaining security-relevant logs for at least 12 months. Many regulations (PCI-DSS, HIPAA) specify 1–7 years. Ensure logs are write-protected and centralised — local logs on compromised hosts cannot be trusted.
`,
  },
  {
    slug: 'malware-analysis',
    title: 'Malware Analysis',
    category: 'Forensics',
    description:
      'The process of examining malicious software to understand its behaviour, capabilities, persistence mechanisms, and command-and-control infrastructure.',
    body: `## What is Malware Analysis?

Malware analysis is the examination of malicious software to determine what it does, how it works, and how to detect and defend against it. Analysis ranges from quick automated detonation to deep manual reverse engineering.

## Analysis Tiers

### Tier 1: Automated Sandbox
- Submit sample to Any.run, Hybrid Analysis, or Tria.ge.
- Review: network connections, registry changes, file drops, process tree.
- Extracts IOCs quickly but may miss evasion techniques.

### Tier 2: Static Analysis
- Compute file hashes (MD5, SHA-256) for threat intel queries.
- Extract strings: \`strings -n 8 malware.exe\`
- Examine PE headers: imports, exports, sections, compile timestamp.
- Yara rule matching for known malware family signatures.

### Tier 3: Dynamic Analysis
- Detonate in an isolated VM with network monitoring.
- Use Process Monitor, Wireshark, Regshot to capture behaviour.
- Monitor API calls with API Monitor or Frida.

### Tier 4: Code-Level Reverse Engineering
- Disassemble with IDA Pro, Ghidra, or Binary Ninja.
- Debug with x64dbg or WinDbg.
- De-obfuscate packed or encoded payloads.

## Common Persistence Mechanisms

- Registry Run keys: \`HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\`
- Scheduled tasks
- Services
- DLL hijacking
- WMI subscriptions
`,
  },

  // ── Detection Engineering ────────────────────────────────────────────────────
  {
    slug: 'mitre-attack',
    title: 'MITRE ATT&CK Framework',
    category: 'Detection Engineering',
    description:
      'A knowledge base of adversary tactics and techniques based on real-world observations, used to understand, detect, and defend against attacks.',
    body: `## What is MITRE ATT&CK?

MITRE ATT&CK (Adversarial Tactics, Techniques, and Common Knowledge) is an open, globally-accessible knowledge base of adversary behaviours derived from real-world incident observations. It is the industry standard framework for understanding and communicating about attacker behaviour.

## Framework Structure

ATT&CK is organised as a matrix:
- **Tactics** — the *why* (14 enterprise tactics from Reconnaissance to Impact)
- **Techniques** — the *how* (hundreds of techniques under each tactic)
- **Sub-techniques** — more specific implementations of techniques
- **Procedures** — specific real-world examples of how groups use techniques

## 14 Enterprise Tactics

1. Reconnaissance
2. Resource Development
3. Initial Access
4. Execution
5. Persistence
6. Privilege Escalation
7. Defense Evasion
8. Credential Access
9. Discovery
10. Lateral Movement
11. Collection
12. Command and Control
13. Exfiltration
14. Impact

## Use Cases

- **Threat modelling** — map your defences against known tactics.
- **Detection gap analysis** — identify where you have no coverage.
- **Red team planning** — simulate realistic adversary behaviour.
- **CTI reporting** — standardised language for describing campaigns.

## ATT&CK Navigator

The ATT&CK Navigator (attack.mitre.org/resources/navigator) is a free web tool for annotating and comparing technique coverage across defences or threat groups.
`,
  },
  {
    slug: 'sigma-rules',
    title: 'Sigma Rules',
    category: 'Detection Engineering',
    description:
      'A vendor-agnostic open standard for writing generic detection rules that can be converted to SIEM queries for any platform.',
    body: `## What are Sigma Rules?

Sigma is a vendor-agnostic, open-source signature format for writing detection rules that target log data. A single Sigma rule can be compiled to Splunk SPL, Elasticsearch KQL, Microsoft Sentinel KQL, IBM QRadar AQL, and many other SIEM query languages.

## Rule Structure

\`\`\`yaml
title: Mimikatz Activity Detected
status: stable
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    CommandLine|contains:
      - 'sekurlsa'
      - 'logonpasswords'
  condition: selection
level: high
tags:
  - attack.credential_access
  - attack.t1003.001
\`\`\`

## Key Components

- **logsource** — defines the data source (OS, product, category)
- **detection** — selection criteria and logical conditions
- **condition** — boolean expression over selections
- **level** — informational / low / medium / high / critical
- **tags** — ATT&CK technique references

## Benefits

- Write once, deploy anywhere.
- Community-maintained rule repository (SigmaHQ on GitHub).
- Reduces vendor lock-in for detection logic.

## Conversion Tools

\`\`\`bash
# sigma-cli (sigmahq/sigma-cli)
sigma convert -t splunk -p splunk_windows rule.yml
\`\`\`
`,
  },
  {
    slug: 'yara-rules',
    title: 'YARA Rules',
    category: 'Detection Engineering',
    description:
      'A pattern-matching tool for identifying and classifying malware samples based on binary strings, hex patterns, and regular expressions.',
    body: `## What are YARA Rules?

YARA is a pattern-matching tool widely used for identifying malware samples. Rules can match on strings, byte sequences, regular expressions, and file-level conditions, and can be applied to files, processes, or memory regions.

## Rule Structure

\`\`\`
rule Cobalt_Strike_Beacon {
    meta:
        description = "Detects Cobalt Strike Beacon shellcode patterns"
        author = "security researcher"
        date = "2024-01-01"
    strings:
        $s1 = { FC E8 89 00 00 00 }  // typical shellcode prologue
        $s2 = "MZARUH" nocase
        $pe = { 4D 5A }
    condition:
        $pe at 0 and ($s1 or $s2)
}
\`\`\`

## Condition Keywords

- **all of them** — all strings must match
- **any of ($s*)** — any string starting with $s
- **2 of ($a, $b, $c)** — at least 2 must match
- **filesize < 1MB** — file size condition
- **for any i in (1..#s): @s[i] < 1024** — string position logic

## Applications

- Malware family classification in sandbox detonations.
- Threat hunting across endpoint artefacts.
- Email attachment scanning at the gateway.
- Memory scanning for fileless malware.

## Repositories

- YARA-Rules (GitHub: Yara-Rules/rules)
- VirusTotal yara_rules
- Malware bazaar / MalwareBazaar
`,
  },
  {
    slug: 'threat-hunting',
    title: 'Threat Hunting',
    category: 'Detection Engineering',
    description:
      'The proactive, hypothesis-driven search for adversary activity that has evaded existing automated security controls.',
    body: `## What is Threat Hunting?

Threat hunting is the proactive, analyst-led search for malicious activity that has not been flagged by automated security controls (SIEM, EDR, IDS). Unlike reactive detection, hunting starts with a hypothesis and uses telemetry to either confirm or refute it.

## Hunting Methodology

\`\`\`
Hypothesis → Data Collection → Investigation → Discovery → Improvement
\`\`\`

### 1. Hypothesis Formation
- Based on threat intelligence ("APT29 uses DLL search-order hijacking")
- Based on ATT&CK techniques with low detection coverage
- Based on observed anomalies

### 2. Data Collection
- Identify required log sources (EDR, Sysmon, proxy, DNS)
- Ensure sufficient retention period

### 3. Investigation
- Query for indicators of the technique
- Use statistical methods to identify outliers

### 4. Discovery
- Document findings (true positive or false positive)
- Create detection rule if pattern is repeatable

### 5. Improvement
- Feed new detections back to the SIEM
- Update threat model and ATT&CK coverage map

## Hunt Types

| Type | Description |
|---|---|
| Intel-driven | Based on a specific threat actor's TTPs |
| Situation-aware | Triggered by external events (new CVE, sector-wide campaign) |
| Anomaly-based | Statistical outlier detection without prior hypothesis |
`,
  },
  {
    slug: 'alert-triage',
    title: 'Alert Triage',
    category: 'Detection Engineering',
    description:
      'The process of evaluating, prioritising, and deciding the appropriate response to security alerts generated by detection systems.',
    body: `## What is Alert Triage?

Alert triage is the structured process of evaluating incoming security alerts to determine their validity, severity, and urgency — and routing them to the appropriate response action.

## Triage Outcomes

1. **True Positive (TP)** — real malicious activity; escalate for incident response.
2. **False Positive (FP)** — benign activity triggering the rule; tune detection.
3. **Benign True Positive (BTP)** — expected behaviour that technically matches (authorised pen test, etc.).

## Triage Process

\`\`\`
Alert received
  → Is this a known FP pattern? → Yes → Close / tune rule
  → Enrich alert with context (user, asset, previous activity)
  → Does context support malicious intent?
    → Yes → Escalate to IR
    → No  → Document and close with justification
\`\`\`

## Reducing Alert Fatigue

Alert fatigue is a serious operational problem — analysts become desensitised when false positive rates are too high.

- **Tune rules** regularly; aim for FP rate < 5%.
- **Prioritise by asset criticality** — alert on server compromise harder than workstation.
- **Contextualise** — enrich every alert with user history, threat intel, asset criticality.
- **SOAR playbooks** — automate initial enrichment to reduce analyst toil.

## Key Metrics

- MTTD (Mean Time to Detect)
- MTTA (Mean Time to Acknowledge)
- FP ratio per rule
`,
  },
  {
    slug: 'siem',
    title: 'SIEM',
    category: 'Detection Engineering',
    description:
      "Security Information and Event Management — a platform that aggregates, correlates, and alerts on log data from across an organisation's infrastructure.",
    body: `## What is a SIEM?

A Security Information and Event Management (SIEM) platform aggregates log data from disparate sources (endpoints, servers, network devices, cloud services), normalises it into a common schema, applies correlation rules, and generates alerts for analyst review.

## Core SIEM Functions

1. **Log ingestion** — collect data from agents, syslog, APIs.
2. **Normalisation** — parse and map fields to a common event model.
3. **Correlation** — apply rules and detect patterns across events.
4. **Alerting** — generate cases or tickets for analyst review.
5. **Dashboards** — visualise security posture.
6. **Search** — ad-hoc investigation of historical data.

## Common SIEM Platforms

| Platform | Type |
|---|---|
| Splunk Enterprise Security | Commercial |
| Microsoft Sentinel | Cloud-native (Azure) |
| Elastic SIEM | Open-core |
| IBM QRadar | Commercial |
| Chronicle / Google SecOps | Cloud-native |
| Wazuh | Open-source |

## SIEM Maturity Levels

- **Level 1** — basic log collection, no tuned rules
- **Level 2** — vendor use-case content enabled
- **Level 3** — custom correlation rules, regular tuning
- **Level 4** — integrated threat intel, automated response (SOAR)
- **Level 5** — ML-based baselining, continuous optimisation
`,
  },
  {
    slug: 'soar',
    title: 'SOAR',
    category: 'Detection Engineering',
    description:
      'Security Orchestration, Automation, and Response — platforms that automate repetitive SOC tasks and orchestrate responses across security tools.',
    body: `## What is SOAR?

Security Orchestration, Automation, and Response (SOAR) platforms enable SOC teams to automate repetitive tasks, orchestrate workflows across multiple security tools, and respond to incidents faster and more consistently.

## Core Capabilities

- **Playbook automation** — codify response procedures as automated workflows.
- **Tool integration** — connect SIEM, EDR, ticketing, threat intel, firewall via APIs.
- **Case management** — track incidents from detection through closure.
- **Metrics and reporting** — measure MTTD, MTTR, analyst workload.

## Example Playbooks

### Phishing Triage Playbook
1. Extract IOCs from reported email.
2. Check IOCs against VirusTotal and internal blocklists.
3. If malicious: block sender domain at gateway, quarantine similar emails, open incident.
4. If benign: close ticket, notify reporter.

### Endpoint Isolation Playbook
1. Receive alert for malware detection on endpoint.
2. Query EDR for process tree and network connections.
3. Isolate host from network via EDR API.
4. Open P1 incident, page on-call analyst.

## SOAR vs SIEM

SIEM detects and alerts. SOAR responds. Modern platforms blur this boundary (Sentinel, Chronicle) but the distinction remains useful conceptually.
`,
  },
  {
    slug: 'detection-as-code',
    title: 'Detection-as-Code',
    category: 'Detection Engineering',
    description:
      'The practice of managing detection logic as version-controlled, tested, and deployed code — applying software engineering principles to security detection.',
    body: `## What is Detection-as-Code?

Detection-as-Code (DaC) applies software engineering practices — version control, code review, automated testing, CI/CD deployment — to the management of detection rules. It treats detection logic as a first-class engineering artefact.

## Core Principles

1. **Version control all detection rules** — Git history for every change.
2. **Code review for rule changes** — peer review before deployment.
3. **Automated testing** — unit tests with synthetic log data validate rules before production.
4. **CI/CD deployment** — automated push to SIEM on merge to main.
5. **Documentation as code** — detection rationale, false positive notes inline.

## Benefits

- Reproducible detection environments (staging vs production parity).
- Rollback capability when rules cause alert storms.
- Audit trail of who changed what and why.
- Encourages rule reuse and modularisation.

## Tooling

- **Sigma** — write once, compile to any SIEM.
- **Panther** — cloud-native DaC platform.
- **detection-rules (Elastic)** — open-source detection repo with tests.
- **SOC Falcon** — rule testing framework.

## Test Example

\`\`\`python
def test_mimikatz_rule():
    log_event = {"CommandLine": "sekurlsa::logonpasswords"}
    assert rule_matches("mimikatz_detection", log_event)
\`\`\`
`,
  },
  {
    slug: 'api-security',
    title: 'API Security',
    category: 'Detection Engineering',
    description:
      'Practices and controls for protecting APIs from abuse, unauthorised access, and data exposure — increasingly critical as APIs become the primary integration layer.',
    body: `## Why API Security Matters

APIs are the primary integration mechanism for modern applications, making them high-value targets. The OWASP API Security Top 10 defines the most critical API vulnerabilities.

## OWASP API Security Top 10

1. **Broken Object Level Authorisation (BOLA)** — access other users' objects by changing IDs.
2. **Broken Authentication** — weak tokens, missing expiry, credential stuffing.
3. **Broken Object Property Level Authorisation** — mass assignment, over-exposure.
4. **Unrestricted Resource Consumption** — rate limiting missing, DoS possible.
5. **Broken Function Level Authorisation** — non-admin accessing admin endpoints.
6. **Unrestricted Access to Sensitive Business Flows** — automated abuse of business logic.
7. **Server Side Request Forgery (SSRF)** — API fetches attacker-controlled URLs.
8. **Security Misconfiguration** — verbose errors, open CORS, default credentials.
9. **Improper Inventory Management** — undocumented / legacy API versions in production.
10. **Unsafe Consumption of APIs** — trusting third-party API responses without validation.

## Detection Engineering for APIs

- Log all API calls with: endpoint, method, status, response time, user/token.
- Alert on: excessive 4xx errors, unusually high response data volumes, access from anomalous IPs.
- Detect BOLA by flagging access to object IDs not previously seen for a given user.
`,
  },

  // ── Attack Types ─────────────────────────────────────────────────────────────
  {
    slug: 'bec',
    title: 'Business Email Compromise (BEC)',
    category: 'Attack Types',
    description:
      'A social engineering attack where adversaries hijack or spoof corporate email accounts to initiate fraudulent wire transfers or data theft.',
    body: `## What is BEC?

Business Email Compromise (BEC) is a highly targeted fraud scheme where attackers compromise or impersonate senior executives or finance personnel to trick employees into transferring funds or sensitive data.

## BEC Categories (FBI IC3)

1. **CEO fraud** — attacker impersonates CEO to instruct finance to wire funds.
2. **Account compromise** — legitimate email account hijacked to request payments.
3. **False invoice scheme** — impersonate a supplier requesting payment to a new account.
4. **Attorney impersonation** — impersonate legal counsel, urgency framing.
5. **Data theft** — target HR/payroll staff for W-2 forms or employee PII.

## Attack Flow

\`\`\`
Reconnaissance (LinkedIn, WHOIS)
  → Register lookalike domain or compromise mailbox
  → Send urgent payment request from "CEO"
  → Request funds transferred to attacker-controlled account
\`\`\`

## BEC Red Flags

- Unexpected urgency or secrecy requests.
- Wire transfer to a new bank account.
- CEO requesting payment outside normal channels.
- Email sent from a personal address impersonating a corporate one.

## Defences

- Multi-person approval for wire transfers above a threshold.
- Out-of-band verification (phone call to known number) for large transfers.
- DMARC \`p=reject\` to prevent exact-domain spoofing.
- User awareness training on BEC techniques.
`,
  },
  {
    slug: 'spear-phishing',
    title: 'Spear Phishing',
    category: 'Attack Types',
    description:
      'A targeted phishing attack directed at specific individuals or organisations, leveraging personalised context to increase credibility.',
    body: `## What is Spear Phishing?

Spear phishing is a targeted variant of phishing that uses personalised information — gathered through OSINT — to craft convincing lures directed at specific individuals or groups. Unlike bulk phishing, spear phishing sacrifices scale for precision.

## OSINT Sources Used by Attackers

- LinkedIn (job role, employer, colleagues, recent projects)
- Company website (org chart, news, technology stack)
- Twitter/X (interests, recent events, travel)
- Data breaches (email/password from prior leaks)
- GitHub (code, email addresses in commits)

## Lure Types

| Lure | Example |
|---|---|
| Document delivery | "Please review the attached contract" |
| Credential harvest | Fake Office 365 login page |
| Software update | "Update required to access the VPN" |
| HR-themed | "Your 2024 W-2 is ready" |
| IT-themed | "Your account will be suspended" |

## Difference from Whaling

Whaling is spear phishing specifically targeting C-suite executives (CEO, CFO) where the potential payoff (BEC) is highest.

## Detection

- Anomalous inbound email from newly-registered domains.
- Authentication failures (SPF/DMARC) from lookalike domains.
- User reports of suspicious emails — a very effective detection signal.
`,
  },
  {
    slug: 'qr-phishing',
    title: 'QR Phishing (Quishing)',
    category: 'Attack Types',
    description:
      'A phishing technique that embeds malicious URLs inside QR codes to bypass URL-scanning email security controls.',
    body: `## What is Quishing?

QR phishing (quishing) embeds a malicious URL inside a QR code image. The image is attached to or embedded in a phishing email. Because email security gateways scan text-based URLs but often cannot decode QR code images, this technique bypasses URL filtering controls.

## Why QR Codes Evade Security

- Email gateways perform URL extraction on text and HTML, not image pixel data.
- Even if the gateway extracts the URL from the QR image, it may not follow redirects aggressively.
- Mobile devices often have permissive browser settings.
- Users trust QR codes as a "scan on your phone" medium — this creates a side-channel that bypasses corporate proxy inspection.

## Common Delivery Scenarios

- "Your MFA device needs re-registration — scan this QR code."
- "Scan to view secure document" embedded in a PDF attachment.
- Physical quishing — QR codes affixed to public charging stations or parking meters.

## Detection

- Email security tools that perform OCR on images and decode QR codes (newer gateway capability).
- Policy-based blocking of emails with QR code images from external senders.
- Mobile Device Management (MDM) enforcing safe browsing on corporate devices.

## Response

If a user scans a quishing QR code:
1. Isolate the device if credentials were entered.
2. Reset credentials for any accounts accessed.
3. Review access logs for the targeted application.
`,
  },
  {
    slug: 'thread-hijacking',
    title: 'Thread Hijacking',
    category: 'Attack Types',
    description:
      'An attack where an adversary compromises a mailbox and injects malicious replies into existing legitimate email threads to gain trust.',
    body: `## What is Thread Hijacking?

Thread hijacking (also called conversation hijacking) is an attack where an adversary with access to a compromised email account replies to existing, legitimate email threads with malicious content. Because the reply appears in an established conversation with known contacts, recipients are far more likely to trust it.

## How It Works

1. Attacker compromises an email account (credential phishing, password spray).
2. Reads existing email threads in the inbox.
3. Replies to a thread with a malicious attachment or link — often with contextual plausibility (e.g., "As a follow-up to our earlier discussion, please see the attached invoice").
4. Recipient trusts the email because it appears in an existing conversation thread.

## Notable Malware Using This Technique

- **Emotet** — automated thread hijacking at scale using stolen email content.
- **Qakbot** — reply-chain phishing used as initial access broker.

## Why It's Hard to Detect

- Email is from a legitimate domain (no SPF/DKIM failure).
- Subject line is \`Re:\` an existing conversation.
- May include prior thread content for additional credibility.

## Defences

- MFA on all email accounts — prevents credential-based compromise.
- Monitor for unusual email access from new IPs / countries.
- Disable legacy authentication protocols (Basic Auth) on Exchange/M365.
- User training — "verify unexpected attachments via a separate channel."
`,
  },
  {
    slug: 'credential-harvesting',
    title: 'Credential Harvesting',
    category: 'Attack Types',
    description:
      'The theft of usernames and passwords through fake login pages, malicious forms, or credential-stealer malware.',
    body: `## What is Credential Harvesting?

Credential harvesting is the collection of authentication credentials — usernames, passwords, session tokens — through deceptive means. It is one of the most common initial access techniques (ATT&CK T1598).

## Harvesting Methods

| Method | Description |
|---|---|
| Phishing page | Cloned login page that captures credentials |
| Adversary-in-the-Middle (AiTM) | Real-time proxy captures session token after MFA |
| Credential-stealer malware | Grabs saved passwords from browser credential stores |
| Keylogger | Captures keystrokes at the OS level |
| Form jacking | Malicious JavaScript on legitimate site captures form input |

## Adversary-in-the-Middle (AiTM)

AiTM phishing defeats MFA by acting as a proxy between the victim and the legitimate service. The victim authenticates normally (including MFA), and the proxy captures the session cookie — which the attacker can use directly.

Tools: Evilginx, Modlishka, Muraena.

## Detection

- Impossible travel: login from geographically implausible locations.
- New device / browser fingerprint after successful phishing.
- Session token reuse from a different IP shortly after authentication.
- Multiple failed logins followed by a success.

## Mitigations

- FIDO2 / Passkeys — phishing-resistant MFA that AiTM cannot bypass.
- Conditional Access based on device compliance.
- Token binding to reduce session hijacking impact.
`,
  },
  {
    slug: 'typosquatting',
    title: 'Typosquatting',
    category: 'Attack Types',
    description:
      'Registering domain names that are deliberate misspellings or character transpositions of legitimate domains to capture misdirected traffic.',
    body: `## What is Typosquatting?

Typosquatting (also URL hijacking) is the registration of domain names that are deliberate misspellings, transpositions, or near-matches of legitimate domains — to intercept users who mistype a URL or click a link in a phishing email.

## Common Typosquat Patterns

| Pattern | Example (targeting google.com) |
|---|---|
| Missing letter | gogle.com |
| Transposition | googel.com |
| Extra letter | googgle.com |
| Adjacent key | goofle.com |
| Wrong TLD | google.co (vs .com) |
| Subdomain abuse | google.com.malicious.com |
| Pluralisation | googles.com |

## Attack Scenarios

- **Credential harvest** — clone the legitimate site's login page.
- **Malware delivery** — serve drive-by downloads to visitors.
- **Package squatting** — npm, PyPI packages with similar names to popular libraries.
- **Ad revenue** — monetise misdirected traffic via ads.

## Defences

- Defensive registration of common typosquats and TLD variants.
- Certificate Transparency monitoring for new certificates on confusable domains.
- Brand protection services (MarkMonitor, Corsair) that monitor and take down typosquats.
- Email gateways that detect links to typosquatted domains.
`,
  },
  {
    slug: 'oauth-phishing',
    title: 'OAuth Phishing',
    category: 'Attack Types',
    description:
      'An attack that tricks users into granting OAuth consent to a malicious application, giving it persistent access to their account without capturing a password.',
    body: `## What is OAuth Phishing?

OAuth phishing (also called consent phishing or OAuth abuse) tricks users into authorising a malicious third-party application with delegated access to their account — typically their Microsoft 365 or Google Workspace email and files. Unlike traditional phishing, no password is captured; the attacker gets an OAuth refresh token that grants persistent access.

## Attack Flow

\`\`\`
Phishing email with link to "document"
  → Redirects to legitimate Microsoft/Google OAuth consent screen
  → User sees "This app wants to: Read your email, Access your files"
  → User clicks "Accept" (often without reading carefully)
  → Attacker receives OAuth refresh token
  → Persistent access to mailbox, OneDrive, SharePoint
\`\`\`

## Why It's Effective

- The OAuth consent page is legitimate — hosted by Microsoft/Google.
- No malicious domain to block.
- No credentials are entered on a fake page.
- Bypasses MFA entirely.
- Token may persist for months or years.

## Detection

- Audit OAuth application consents in your tenant (Microsoft Entra ID: Enterprise Applications).
- Alert on new OAuth consents from non-approved publishers.
- Review applications with read_mail, mail.readwrite, or files.read.all permissions.

## Response

1. Revoke the malicious application's consent across all users.
2. Review all access by the application (audit logs).
3. Block the application's client ID in your OAuth policies.
`,
  },
  {
    slug: 'social-engineering',
    title: 'Social Engineering',
    category: 'Attack Types',
    description:
      'Psychological manipulation techniques that exploit human trust, urgency, and authority to deceive individuals into taking harmful actions.',
    body: `## What is Social Engineering?

Social engineering is the manipulation of people rather than systems — exploiting psychological biases (authority, urgency, fear, reciprocity) to trick individuals into revealing information, transferring funds, or taking actions that benefit the attacker.

## Psychological Principles Exploited

| Principle | Example |
|---|---|
| **Authority** | "This is the CEO — transfer the funds now" |
| **Urgency** | "Your account will be locked in 24 hours" |
| **Fear** | "We detected suspicious activity on your account" |
| **Reciprocity** | "We've done you a favour — now we need your help" |
| **Social proof** | "All your colleagues have already updated their passwords" |
| **Scarcity** | "This offer expires today" |

## Attack Vectors

- **Phishing** — email-based deception.
- **Vishing** — voice/phone-based (fake IT helpdesk).
- **Smishing** — SMS-based phishing.
- **Pretexting** — creating a fabricated scenario.
- **Baiting** — leaving infected USB drives in car parks.
- **Tailgating** — physical access by following an authorised person through a secured door.

## Defences

- Regular security awareness training with phishing simulations.
- Clear procedures for verifying identity before sensitive actions.
- Never bypass security controls at the request of someone claiming authority.
`,
  },
  {
    slug: 'ransomware',
    title: 'Ransomware',
    category: 'Attack Types',
    description:
      'Malware that encrypts victim files and demands payment — typically cryptocurrency — for the decryption key.',
    body: `## What is Ransomware?

Ransomware is malware that encrypts a victim's files or systems, rendering them inaccessible, and demands payment (typically cryptocurrency) for the decryption key. Modern ransomware groups also exfiltrate data before encrypting ("double extortion") and threaten public release if the ransom is not paid.

## Ransomware Kill Chain

\`\`\`
Initial Access (phishing, RDP, VPN CVE)
  → Establish persistence
  → Lateral movement (credential theft, BloodHound)
  → Exfiltrate sensitive data
  → Deploy ransomware payload across the estate
  → Delete Volume Shadow Copies (vssadmin delete shadows /all)
  → Encrypt files
  → Drop ransom note
\`\`\`

## Notable Ransomware Groups

- LockBit, BlackCat (ALPHV), Cl0p, Royal, Akira

## Critical Defences

1. **Offline backups** — immutable, airgapped, tested.
2. **MFA everywhere** — especially on RDP, VPN, and email.
3. **Patch management** — prioritise CISA KEV entries.
4. **EDR with ransomware protection** — behavioural blocking of mass file encryption.
5. **Least privilege** — limit blast radius of compromised credentials.
6. **Network segmentation** — prevent lateral movement.

## Incident Response

- Do NOT pay without consulting law enforcement (OFAC sanctions risk).
- Preserve encrypted systems for decryptor development.
- Engage a ransomware-specialist IR firm.
`,
  },
  {
    slug: 'supply-chain-attack',
    title: 'Supply Chain Attack',
    category: 'Attack Types',
    description:
      'An attack that compromises a trusted third-party vendor or software dependency to gain access to its downstream customers.',
    body: `## What is a Supply Chain Attack?

A supply chain attack (also: software supply chain attack, third-party risk) targets the relationship of trust between a vendor and its customers. By compromising the vendor's software or update mechanism, the attacker gains access to all of the vendor's customers simultaneously.

## Notable Examples

| Attack | Year | Method |
|---|---|---|
| SolarWinds SUNBURST | 2020 | Trojanised software update |
| Kaseya VSA | 2021 | RMM software exploit |
| 3CX Desktop App | 2023 | Compromised installer |
| XZ Utils backdoor | 2024 | Social engineering of open-source maintainer |

## Attack Vectors

- **Build pipeline compromise** — inject malicious code during compilation (CI/CD).
- **Open source package hijacking** — typosquat or dependency confusion.
- **Compromised code signing certificate** — allows signing malicious updates.
- **Vendor account compromise** — gain access to vendor's deployment systems.

## Defences

- **Software Bill of Materials (SBOM)** — inventory all dependencies.
- **Dependency pinning** — pin to exact versions and verify hashes.
- **SLSA framework** — supply chain levels for software artefacts.
- **Code signing verification** — verify signatures on all installed software.
- **Vendor risk assessments** — review security posture of critical software vendors.
`,
  },
  {
    slug: 'watering-hole-attack',
    title: 'Watering Hole Attack',
    category: 'Attack Types',
    description:
      'An attack that compromises a website frequently visited by a target group, serving malware to visitors from the targeted organisation.',
    body: `## What is a Watering Hole Attack?

A watering hole attack compromises a website known to be frequently visited by the attacker's intended targets. When targets visit the site, the attacker's malicious code runs in their browser — typically delivering a drive-by exploit or a malicious download.

## Why "Watering Hole"?

Named after the predatory tactic of waiting at a water source for prey to arrive. Rather than hunting targets directly (which may trigger detection), the attacker waits for targets to come to them.

## Attack Flow

\`\`\`
Identify target organisation's interests (industry forums, news sites, vendor portals)
  → Compromise one of those sites (web vulnerability, supply chain)
  → Inject malicious JavaScript or exploit kit
  → Wait for targets to visit
  → Exploit browser or plugin vulnerability
  → Deploy payload (RAT, backdoor)
\`\`\`

## Notable Examples

- **Lazarus Group** — compromised cryptocurrency forum sites targeting financial institutions.
- **WateringHole attacks on ICS sector** — compromised ICS vendor websites to target energy sector.

## Defences

- Patch browsers and plugins aggressively.
- Use a corporate web proxy that inspects JavaScript.
- Browser isolation (RBI) for high-risk browsing.
- DNS filtering to block known exploit kit infrastructure.
`,
  },
  {
    slug: 'brute-force-attack',
    title: 'Brute Force Attack',
    category: 'Attack Types',
    description:
      'A method that systematically tries all possible password combinations or a large password list to gain unauthorised access.',
    body: `## What is a Brute Force Attack?

A brute force attack attempts to guess credentials by trying many possible values — either exhaustively (all combinations) or using wordlists and rule-based mutations of common passwords.

## Attack Variants

| Variant | Description |
|---|---|
| **Pure brute force** | Try all character combinations (impractical for long passwords) |
| **Dictionary attack** | Try words from a wordlist (rockyou.txt etc.) |
| **Credential stuffing** | Replay stolen username:password pairs from prior breaches |
| **Password spraying** | Try a few common passwords against many accounts (avoids lockout) |
| **Reverse brute force** | Try one password against many usernames |

## Credential Stuffing vs Password Spraying

- **Credential stuffing** uses exact username:password pairs from breaches. Success rate ~0.1–2% but scales to millions of accounts.
- **Password spraying** avoids lockout by trying "Password1!" once against all accounts. Effective against organisations with weak password policies.

## Detection

- Alert on high volume of failed login attempts from a single IP.
- Alert on distributed failures across many IPs (spray pattern).
- Alert on successful login after multiple failures.
- Impossible travel detection for credential stuffing.

## Mitigations

- MFA — renders most brute force attacks useless.
- Account lockout after N failures.
- CAPTCHA on public-facing login forms.
- Have I Been Pwned API for breach-exposed passwords.
`,
  },
  {
    slug: 'insider-threat',
    title: 'Insider Threat',
    category: 'Attack Types',
    description:
      'A security risk originating from within the organisation — employees, contractors, or partners who misuse legitimate access.',
    body: `## What is an Insider Threat?

An insider threat is a security risk that originates from within the organisation — a current or former employee, contractor, business partner, or supplier who uses their legitimate access to cause harm, whether maliciously, negligently, or inadvertently.

## Insider Threat Types

| Type | Description |
|---|---|
| **Malicious insider** | Intentionally exfiltrates data, sabotages systems |
| **Negligent insider** | Accidental data loss, falling for phishing |
| **Compromised insider** | Legitimate user whose account is taken over by an external attacker |

## Motivations (Malicious)

- Financial gain (data theft for sale, fraud)
- Revenge (disgruntled employee)
- Espionage (nation-state recruited insider)
- Ideology

## Behavioural Indicators

- Unusual data access volumes (downloading large amounts of sensitive data)
- Access to systems outside normal job function
- Connecting USB storage to corporate endpoints
- Accessing systems outside business hours
- Resignation preceded by bulk data copying

## Defences

- **UEBA** (User and Entity Behaviour Analytics) — baseline and alert on anomalous access patterns.
- **DLP** (Data Loss Prevention) — monitor and block sensitive data exfiltration.
- **Least privilege** — limit access to what is necessary for the role.
- **Offboarding process** — revoke access immediately on separation.
- **Audit logging** — ensure all access to sensitive data is logged.
`,
  },
];
