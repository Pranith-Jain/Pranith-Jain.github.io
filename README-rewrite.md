<div align="center">

```
██████╗ ██████╗  █████╗ ███╗   ██╗██╗████████╗██╗  ██╗
██╔══██╗██╔══██╗██╔══██╗████╗  ██║██║╚══██╔══╝██║  ██║
██████╔╝██████╔╝███████║██╔██╗ ██║██║   ██║   ███████║
██╔═══╝ ██╔══██╗██╔══██║██║╚██╗██║██║   ██║   ██╔══██║
██║     ██║  ██║██║  ██║██║ ╚████║██║   ██║   ██║  ██║
╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝   ╚═╝   ╚═╝  ╚═╝
```

### Security Engineer · Threat Intel · AI Security · Product Builder

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/pranithjain/)
[![Portfolio](https://img.shields.io/badge/Portfolio-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://pranithjain.qzz.io)
[![DFIR Toolkit](https://img.shields.io/badge/DFIR_Toolkit-2c3ee5?style=for-the-badge&logo=cloudflare&logoColor=white)](https://pranithjain.qzz.io/dfir)
[![Threat Intel](https://img.shields.io/badge/Threat_Intel-c026d3?style=for-the-badge&logo=cloudflare&logoColor=white)](https://pranithjain.qzz.io/threatintel)
[![Email](https://img.shields.io/badge/Email-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:hello@pranithjain.qzz.io)
[![X](https://img.shields.io/badge/X-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/Npj8448)

![Profile Views](https://komarev.com/ghpvc/?username=Pranith-Jain&label=Profile+Views&color=0e75b6&style=flat)

</div>

---

## whoami

```yaml
role: Security Engineer · Threat Intel · AI Security · Product Builder
focus:
  - Threat Intelligence & IOC Analysis
  - Ransomware Tracking & Dark-Web Monitoring
  - Phishing Triage & Malware Detection
  - AI Security (prompt injection, MCP, agent attack surface)
  - Detection Engineering & Edge-native Tooling
  - Security Product Building
currently_building:
  - 4 edge-native security platforms (90+ tools, 100+ feeds) on Cloudflare Workers
  - Ransomware leak-site & negotiation tracking across 3 sources
  - Darknet site directory (108 sites, 9 categories, live up/down status)
  - Autonomous case-study blog: discover → AI generate → anti-slop QA gate → publish
open_to: Security Engineering · AI Security · Threat Intelligence · Product Building
```

---

## what I work on

I track threats and build the tools that make tracking them faster.

- **Threat intelligence** — ransomware leak-site & negotiation tracking, cross-source IOC correlation, actor / CVE / KEV pivots, MITRE ATT&CK mapping
- **Ransomware & darknet tracking** — leak-site monitoring, negotiation intel, Tor site directory with live up/down status across 9 categories
- **Phishing & malware** — triage, detection, IOC extraction, hash reputation lookups
- **AI security** — prompt-injection red-teaming, MCP audit, agent attack-surface mapping, MITRE ATLAS
- **Product building** — edge-native security platforms, autonomous AI pipelines, MCP servers for AI agents
- **Detection engineering** — Sigma / YARA / KQL / SPL / Lucene / EQL rule authoring + a universal converter that round-trips between them

---

## featured platforms

> **Live:** [pranithjain.qzz.io](https://pranithjain.qzz.io) · **Source:** [Pranith-Jain.github.io](https://github.com/Pranith-Jain/Pranith-Jain.github.io)

Four edge-native security platforms on one Cloudflare Workers deploy — zero signup, zero keys, edge-cached and free.

### CRUCIBLE — `/dfir` · DFIR Toolkit

**90+ interactive tools** across triage, OSINT, detection engineering, AI-security, data security, cloud, API. Highlights:

- **IOC & Hash Checker** — streams 24 providers in parallel for IPs, domains, URLs, hashes
- **Detection Engine + Universal Rule Converter** — Sigma ↔ KQL ↔ SPL ↔ Lucene ↔ EQL ↔ YARA ↔ DLP via one canonical RuleIR
- **AI-Security tools** — prompt-injection red-team, MCP audit, agent attack-surface map, MITRE ATLAS
- **Data Security** — Luhn / IBAN / Verhoeff-verified sensitive-data detection, classification, privacy hub

### PANOPTICON — `/threatintel` · Threat Intel Platform

**100+ live feeds**, hourly-refreshed CTI surface:

- **Ransomware leak-site & negotiation tracking** — across Ransomlook + ransomware.live PRO + MyThreatIntel
- **Darknet directory** — 108 Tor sites across 9 categories with live up/down status
- **Cross-source IOC correlation** — consensus-scored across 18 feeds; live IOC firehose
- **Actor timeline + MITRE ATT&CK group/TTP pivot**
- **Auto-generated daily + weekly intel briefings** — D1-backed, published at 00:05 / 00:15 UTC
- **Autonomous case-study blog** — discover → AI generate → anti-slop QA gate → publish; hourly Telegram digest broadcast

### SCOUT — `/radar` · Recon Scanner

**30+ checks** — deep crawl, JS bundle analysis, API endpoint discovery, secret detection, and security scoring. Full reconnaissance in one scan.

### ARGUS — `/argus` · Threat Nexus

Nation-state threat intelligence dashboard with 3D globe visualization, actor dossiers, relationship graphs, and live threat feeds. 6 views: Globe · Cluster · Diamond · Landscape · Feed · Hunt.

---

**Engineering notes:** Built to fit the Cloudflare Workers free tier — provider results cache to the Cache API (not KV), single-flight cron locks, per-request nonce CSP, SSRF-guarded outbound fetches.

**Stack:**
![Cloudflare](https://img.shields.io/badge/Cloudflare_Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Hono](https://img.shields.io/badge/Hono-E36002?style=flat-square&logo=hono&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)

---

## tech stack

### security operations

![Sumo Logic](https://img.shields.io/badge/Sumo_Logic-000099?style=for-the-badge&logo=sumologic&logoColor=white)
![Elastic](https://img.shields.io/badge/Elastic-005571?style=for-the-badge&logo=elastic&logoColor=white)
![Wazuh](https://img.shields.io/badge/Wazuh-00A9E0?style=for-the-badge&logoColor=white)
![VirusTotal](https://img.shields.io/badge/VirusTotal-394EFF?style=for-the-badge&logo=virustotal&logoColor=white)
![Wireshark](https://img.shields.io/badge/Wireshark-1679A7?style=for-the-badge&logo=wireshark&logoColor=white)

### threat intelligence & OSINT

![Shodan](https://img.shields.io/badge/Shodan-FF0000?style=for-the-badge&logoColor=white)
![Maltego](https://img.shields.io/badge/Maltego-0078D7?style=for-the-badge&logoColor=white)
![IBM X-Force](https://img.shields.io/badge/IBM_X--Force-052FAD?style=for-the-badge&logo=ibm&logoColor=white)
![MITRE](https://img.shields.io/badge/MITRE_ATT&CK-EE3340?style=for-the-badge&logoColor=white)

### automation, AI, edge

![Claude](https://img.shields.io/badge/Claude_Code-D97757?style=for-the-badge&logo=claude&logoColor=white)
![n8n](https://img.shields.io/badge/n8n-EA4B71?style=for-the-badge&logo=n8n&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)

### cloud security

![GCP](https://img.shields.io/badge/Google_Cloud-4285F4?style=for-the-badge&logo=google-cloud&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)
![Azure](https://img.shields.io/badge/Azure-0078D4?style=for-the-badge&logo=microsoft-azure&logoColor=white)

### scripting

![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Bash](https://img.shields.io/badge/Bash-4EAA25?style=for-the-badge&logo=gnu-bash&logoColor=white)
![PowerShell](https://img.shields.io/badge/PowerShell-5391FE?style=for-the-badge&logo=powershell&logoColor=white)

---

## what you'll find here

### flagship

- [**Pranith-Jain.github.io**](https://github.com/Pranith-Jain/Pranith-Jain.github.io) — portfolio + **4 security platforms** (the deployed thing at [pranithjain.qzz.io](https://pranithjain.qzz.io))
- [**dfir-mcp-server**](https://github.com/Pranith-Jain/dfir-mcp-server) — MCP server exposing 20+ DFIR & threat-intel tools for AI agents, built on Cloudflare Workers
- [**dfir-threat-intel-agent**](https://github.com/Pranith-Jain/dfir-threat-intel-agent) — autonomous multi-step LLM-powered investigator agent (plan→act→observe loop, 30+ intel tools, structured report synthesis)
- [**DFIR-PLATFORM**](https://github.com/Pranith-Jain/DFIR-PLATFORM) — design trail and prototypes for the toolkit
- [**cti-platform**](https://github.com/Pranith-Jain/cti-platform) — live ransomware tracking, cross-source IOC correlation, threat-actor timelines, intel briefings

### CLIs & tooling

- [**dfir-cli**](https://github.com/Pranith-Jain/dfir-cli) — DFIR CLI: IOC extraction, encoding, file analysis, PE triage
- [**cti-cli**](https://github.com/Pranith-Jain/cti-cli) — command-line threat intelligence: AI copilot, IOC checker, 13+ feeds
- [**cti-stix-connector**](https://github.com/Pranith-Jain/cti-stix-connector) — containerised Python CLI that ingests JSON campaign + CSV IOC feeds and emits STIX 2.1 bundles
- [**cti-ai-skills**](https://github.com/Pranith-Jain/cti-ai-skills) — AI skills for CTI workflows

### other

- [**AI-Agent-Portfolio**](https://github.com/Pranith-Jain/AI-Agent-Portfolio) — MindStudio AI Agent experiments
- [**Secure-Patient-Data-Platform-on-Google-Cloud-Capstone-**](https://github.com/Pranith-Jain/Secure-Patient-Data-Platform-on-Google-Cloud-Capstone-) — Zero Trust HIPAA-aligned GCP capstone (Grade A, 93/100)

---

## certifications

| Certification                                        | Issuer             | Year     |
| ---------------------------------------------------- | ------------------ | -------- |
| Proofpoint Certified AI Agent Security Specialist    | Proofpoint         | 2026     |
| SOC Summit 2026                                      | SOC Summit         | 2026     |
| Antisyphon Training                                  | Antisyphon         | 2026     |
| Data Loss Prevention (DLP) Survival Guide            | Fortra             | 2026     |
| Social Media Intelligence (SOCMINT)                  | CyberSudo          | Mar 2026 |
| Certified AI Security Expert                         | Virtual Cyber Labs | Mar 2026 |
| Proofpoint AI Email Security Specialist              | Proofpoint         | 2025     |
| Effective AI for Practical SecOps Workflows          | ISC2               | 2025     |
| Mastering Cyber Threat Intelligence for SOC Analysts | MCSI               | 2025     |
| DSPM Fundamentals                                    | Fortra             | 2025     |
| Certified Cyber Criminologist                        | Virtual Cyber Labs | 2025     |
| Google Cloud Cybersecurity Certificate               | Google             | 2025     |
| Multi-Cloud Blue Team Analyst (MCBTA)                | CyberWarFare Labs  | 2025     |

---

## github stats

<div align="center">

<a href="https://github.com/Pranith-Jain">
  <img src="https://github-readme-stats.vercel.app/api?username=Pranith-Jain&show_icons=true&theme=tokyonight&hide_border=true" alt="GitHub Stats" />
</a>

<a href="https://github.com/Pranith-Jain">
  <img src="https://github-readme-stats.vercel.app/api/top-langs/?username=Pranith-Jain&theme=tokyonight&hide_border=true&layout=compact" alt="Top Languages" />
</a>

<a href="https://github.com/Pranith-Jain">
  <img src="https://streak-stats.demolab.com/?user=Pranith-Jain&theme=tokyonight&hide_border=true" alt="GitHub Streak" />
</a>

</div>

<!-- github-readme-stats (anuraghazra) + streak-stats.demolab.com — both live, no
     token, no committed SVGs. github-readme-stats may briefly 503 under GitHub
     API rate limits; it self-recovers within the rate-limit window. The old
     github-profile-summary-cards.vercel.app service was returning HTTP 500 for
     all endpoints and has been removed. -->

---

## open to

- Collaborating on **DFIR tooling**, **detection pipelines**, and **CTI platforms**
- Building **AI-powered security automation** with Claude Code and MCP
- Discussing **threat intelligence**, **ransomware tracking**, and **OSINT**
- Shipping **security products** end-to-end on edge infrastructure
- Contributing to **open-source security projects**

Security is a team sport. Let's raise the bar.

---

<div align="center">

_Building at the intersection of AI, threat intelligence, and edge-native security tooling_

</div>
