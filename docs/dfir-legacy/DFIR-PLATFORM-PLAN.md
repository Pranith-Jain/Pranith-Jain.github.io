# DFIR Platform - Implementation Plan

## 1. Platform Analysis

### Core Services from dfir-lab.ch

| Service                | Description                                                          | Free Tool Available          |
| ---------------------- | -------------------------------------------------------------------- | ---------------------------- |
| Phishing Email Checker | Heuristic phishing analysis with headers, URLs, attachments scanning | dfir-lab.ch/phishing-check   |
| IOC Enrichment         | IP/domain/hash/URL enrichment across 14+ providers                   | dfir-lab.ch/ioc-check        |
| Exposure Scanner       | Subdomain discovery, open ports, SSL issues, vulnerabilities         | dfir-lab.ch/exposure-scanner |
| Domain Lookup          | WHOIS, DNS, SPF/DMARC/BIMI, TLS analysis                             | dfir-lab.ch/domain-lookup    |
| File Analyzer          | File hash analysis, AV detection                                     | dfir-lab.ch/file-analyzer    |

### Wiki Knowledge Base Categories

- **Email Security**: SPF, DKIM, DMARC, ARC, Email Header Analysis, Homoglyph, Spoofing, Link Mismatch
- **Threat Intel**: IOC Enrichment, Attack Surface, IOCs, TI, Passive DNS, WHOIS, Reputation, Actor Profiling
- **Forensics**: Phishing Analysis, Digital Forensics, IR, Timeline, Log Analysis, Malware
- **Detection**: MITRE ATT&CK, Sigma, YARA, Hunting, Triage, SIEM, SOAR, Detection-as-Code
- **Attack Types**: BEC, Quishing, Thread Hijacking, Spear Phishing, Typosquatting, OAuth, Social Engineering

---

## 2. Brainstorming Session

### Architecture Options

#### Option A: Full SaaS Platform

- Backend: Node.js/Python API with threat intel providers
- Frontend: React/Next.js web interface
- Database: PostgreSQL + Redis caching
- Free tier with rate limiting
- Credit-based billing system

#### Option B: Open Source Self-Hosted

- API-first design (REST)
- CLI tool via Homebrew
- Community threat intel integrations
- Free forever tier
- Open source code

#### Option C: Hybrid (Recommended)

- Core services open source + Premium API features
- Free tools on website (like dfir-lab)
- CLI for terminal users
- Community contributions for threat intel

### Tech Stack Recommendation

| Component | Technology         | Reason                              |
| --------- | ------------------ | ----------------------------------- |
| Backend   | Python FastAPI     | Threat intel APIs, async handling   |
| Frontend  | Next.js + Tailwind | Performance, SEO                    |
| Database  | PostgreSQL + Redis | Structured data + caching           |
| CLI       | Python Click       | Cross-platform, similar to dfir-cli |
| Auth      | JWT + OAuth        | Simple, scalable                    |
| Hosting   | AWS/DigitalOcean   | Production-grade                    |

### Free Tools to Build

1. **IOC Checker** - IP/Domain/URL/Hash reputation across multiple providers
2. **Phishing Email Analyzer** - Header analysis, authenticity checks
3. **Domain Lookup** - WHOIS, DNS records, SSL info
4. **Exposure Scanner** - Subdomain enumeration, port scanning
5. **File Analyzer** - Hash lookup, malware family identification

### Implementation Priority

```
Phase 1 (MVP):
├── IOC Checker (Priority 1)
├── Phishing Email Checker (Priority 2)
└── CLI Tool (Priority 3)

Phase 2 (Growth):
├── Domain Lookup
├── Exposure Scanner
└── File Analyzer

Phase 3 (Enterprise):
├── API Platform
├── User Accounts
└── Credit System
```

---

## 3. Feature Specifications

### 3.1 IOC Checker

**Input Types**:

- IPv4/IPv6 addresses
- Domains & URLs
- File hashes (MD5/SHA-1/SHA-256)
- Email addresses

**Threat Intel Providers**:

- VirusTotal (API)
- AbuseIPDB (API)
- Shodan (API)
- GreyNoise (API)
- OTX AlienVault (API)
- URLScan.io (API)
- Hybrid Analysis (API)
- Pulsedive (API)

**Output**:

- Composite score (0-100)
- Verdict: Clean/Suspicious/Malicious
- Per-source breakdown
- Category tags
- Defanged IOC output

### 3.2 Phishing Email Checker

**Analysis Features**:

- SPF/DKIM/DMARC verification
- Header analysis
- URL extraction & analysis
- Attachment hash analysis
- Social engineering detection
- Sender reputation

**Output**:

- Verdict with confidence score
- Extracted IOCs
- Authentication results
- Threat tags

### 3.3 Domain Lookup

**Checks**:

- WHOIS lookup
- DNS record enumeration
- SPF/DMARC/BIMI analysis
- SSL certificate info
- Certificate Transparency logs
- Passive DNS history

### 3.4 Exposure Scanner

**Discovery**:

- Subdomain enumeration
- Open port scanning (top 1000)
- SSL/TLS issues
- Service detection
- CVE mapping

### 3.5 File Analyzer

**Analysis**:

- Hash lookup (VT, Hybrid Analysis)
- File type identification
- Detection ratio
- Sandbox results
- MITRE ATT&CK mapping

---

## 4. API Design

### Endpoints

```
GET  /api/v1/ioc/check?indicator=<value>
POST /api/v1/phishing/analyze
GET  /api/v1/domain/lookup?domain=<value>
GET  /api/v1/exposure/scan?domain=<value>
POST /api/v1/file/analyze
GET  /api/v1/wiki/articles
GET  /api/v1/wiki/article/<slug>
```

### Response Format

```json
{
  "success": true,
  "data": {
    "indicator": "8.8.8.8",
    "type": "ipv4",
    "score": 15,
    "verdict": "clean",
    "sources": [...],
    "tags": ["google-dns"],
    "defanged": "8[.]8[.]8[.]8"
  },
  "credits_used": 1
}
```

---

## 5. Development Roadmap

### Week 1-2: Project Setup

- [ ] Initialize repository
- [ ] Set up Next.js + FastAPI
- [ ] Configure PostgreSQL database
- [ ] Design database schema
- [ ] Set up CI/CD pipeline

### Week 3-4: IOC Checker

- [ ] Implement provider integrations
- [ ] Build scoring algorithm
- [ ] Create caching layer
- [ ] Build web interface
- [ ] Add rate limiting

### Week 5-6: Phishing Checker

- [ ] Email parser
- [ ] Header analysis engine
- [ ] URL extractor
- [ ] Authentication checks

### Week 7-8: Remaining Tools

- [ ] Domain Lookup
- [ ] Exposure Scanner
- [ ] File Analyzer

### Week 9-10: API & Auth

- [ ] REST API endpoints
- [ ] User authentication
- [ ] Credit system
- [ ] Documentation

### Week 11-12: Polish & Launch

- [ ] Performance optimization
- [ ] Security audit
- [ ] Load testing
- [ ] Documentation
- [ ] Public release

---

## 6. Dependencies & APIs Needed

### Threat Intel API Keys (Free Tier Available)

| Provider   | Free Limit       | Use Case          |
| ---------- | ---------------- | ----------------- |
| VirusTotal | 4-10 lookups/min | Hash, Domain, URL |
| AbuseIPDB  | 100/day          | IP reputation     |
| Shodan     | 1 query/min      | Network exposure  |
| GreyNoise  | 1 query/min      | Background noise  |
| OTX        | 10k pulses       | Threat pulses     |
| URLScan    | 100/month        | URL sandbox       |

---

## 7. Wiki Content Structure

### Categories

1. **Email Security** (8 articles)
2. **Threat Intelligence** (14 articles)
3. **Forensics** (6 articles)
4. **Detection Engineering** (9 articles)
5. **Attack Types** (13 articles)

### Article Template

```markdown
---
title: <Concept Name>
category: <Category>
description: <Brief explanation>
related_tools: [<Tool Name>]
related_concepts: [<Concept 1>, <Concept 2>]
---

# <Concept Name>

## Definition

## How It Works

## Practical Examples

## Related Tools

## See Also
```

---

## 8. Next Steps

1. **Confirm platform scope** - Full SaaS vs Open Source?
2. **Select primary provider** - AWS, DigitalOcean, or self-hosted?
3. **Gather threat intel API keys** - Apply for free tiers
4. **Define MVP features** - IOC Checker minimum viable
5. **Set timeline** - Launch target date

---

_Document Version: 1.0_
_Created: 2026-04-19_
