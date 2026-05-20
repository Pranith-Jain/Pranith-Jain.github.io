<!--
  GitHub PROFILE README draft — this is the source-of-truth for the README
  at github.com/Pranith-Jain/Pranith-Jain (a separate repo whose name must
  exactly equal the username). Pushed live via `gh api -X PUT contents/...`.
-->

<div align="center">

```
██████╗ ██████╗  █████╗ ███╗   ██╗██╗████████╗██╗  ██╗
██╔══██╗██╔══██╗██╔══██╗████╗  ██║██║╚══██╔══╝██║  ██║
██████╔╝██████╔╝███████║██╔██╗ ██║██║   ██║   ███████║
██╔═══╝ ██╔══██╗██╔══██║██║╚██╗██║██║   ██║   ██╔══██║
██║     ██║  ██║██║  ██║██║ ╚████║██║   ██║   ██║  ██║
╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝   ╚═╝   ╚═╝  ╚═╝
```

### Security Analyst & Detection Engineer · Threat Intel · Email Defense · Edge-native Tooling

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
name: Pranith Jain
role: Security Analyst & Detection Engineer
company: Qubit Capital
location: Bengaluru, India
focus:
  - Threat Intelligence & IOC Analysis
  - Detection Engineering & Edge-native Security Tooling
  - Email Security & BEC Investigations
  - Phishing Triage & Malware Detection
  - Security Automation & AI Workflows
  - DMARC Enforcement & Domain Abuse Monitoring
currently_building:
  - DFIR toolkit (60+ tools) + self-updating Threat Intel platform on Cloudflare Workers
  - Autonomous case-study blog: discover → AI generate → anti-slop QA gate → publish
  - Hourly cross-source IOC correlation + in-browser Detection Lab + universal rule converter
expanding_into:
  - AI Security (prompt injection, MCP, agent attack surface)
  - Non-Human Identity (NHI) governance
open_to: Security Engineering · Detection Engineering · AI Security · Threat Intelligence
```

---

## what I work on

I do threat intel and email defense at scale, and I build the tools that make it faster.

- **Threat intelligence** — ransomware leak-site & negotiation tracking, cross-source IOC correlation, actor / CVE / KEV pivots, MITRE ATT&CK mapping, dark-web & forum intel
- **Detection engineering** — Sigma / YARA / KQL / SPL / Lucene / EQL / DLP rule authoring + a universal converter that round-trips between them; in-browser detection lab evaluating hourly against a live IOC stream
- **Email security** — SPF, DKIM, DMARC, BIMI, MTA-STS enforcement; BEC investigation; phishing triage; domain-abuse takedown
- **Security automation** — n8n & MCP pipelines, AI-driven enrichment & triage with Claude Code, SOC playbooks
- **AI & cloud security** — prompt-injection testing, MCP audit, agent attack-surface mapping; IAM / Zero Trust posture; NHI governance

---

## featured project: DFIR Toolkit + Threat Intel Platform

> **Live:** [pranithjain.qzz.io](https://pranithjain.qzz.io) · [/dfir](https://pranithjain.qzz.io/dfir) · [/threatintel](https://pranithjain.qzz.io/threatintel)
> **Source:** [Pranith-Jain.github.io](https://github.com/Pranith-Jain/Pranith-Jain.github.io)

One Cloudflare Workers deploy. **60+ analyst tools** and a live, self-updating CTI surface — zero signup, zero keys required, edge-cached and free at the edge.

### `/dfir` — DFIR Toolkit

60+ interactive tools across triage, OSINT, email security, detection engineering, AI-security, data security, cloud, API. Highlights:

- **IOC & Hash Checker** — streams 24 providers in parallel for IPs, domains, URLs, hashes
- **Detection Engine + Universal Rule Converter** — Sigma ↔ KQL ↔ SPL ↔ Lucene ↔ EQL ↔ YARA ↔ DLP via one canonical RuleIR
- **Email Defense / BEC Score** — SPF / DKIM / DMARC / BIMI / MTA-STS / TLS-RPT scoring
- **AI-Security tools** — prompt-injection red-team, MCP audit, agent attack-surface map, MITRE ATLAS
- **Data Security** — Luhn / IBAN / Verhoeff-verified sensitive-data detection, classification, privacy hub

### `/threatintel` — Threat Intel Platform

20+ live CTI surfaces, hourly-refreshed:

- **Ransomware leak-site & negotiation tracking** — across Ransomlook + ransomware.live PRO + MyThreatIntel
- **Cross-source IOC correlation** — consensus-scored across 18 feeds; live IOC firehose
- **Actor timeline + MITRE ATT&CK group/TTP pivot**
- **Auto-generated daily + weekly intel briefings** — D1-backed, published at 00:05 / 00:15 UTC
- **Autonomous case-study blog** — discover → AI generate → anti-slop QA gate → publish; hourly Telegram digest broadcast

Engineered to fit the **Cloudflare Workers free tier**: provider results cache to the Cache API (not KV), single-flight cron locks, per-request nonce CSP, SSRF-guarded outbound fetches.

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

### email security

![DMARC](https://img.shields.io/badge/DMARC_Enforcement-EA4335?style=for-the-badge&logo=gmail&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare_DNS-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)
![Google Workspace](https://img.shields.io/badge/Google_Workspace-4285F4?style=for-the-badge&logo=google&logoColor=white)
![Proofpoint](https://img.shields.io/badge/Proofpoint-0096D6?style=for-the-badge&logoColor=white)

### automation, AI, edge

![Claude](https://img.shields.io/badge/Claude_Code-D97757?style=for-the-badge&logo=claude&logoColor=white)
![n8n](https://img.shields.io/badge/n8n-EA4B71?style=for-the-badge&logo=n8n&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)

### threat intelligence & OSINT

![Shodan](https://img.shields.io/badge/Shodan-FF0000?style=for-the-badge&logoColor=white)
![Maltego](https://img.shields.io/badge/Maltego-0078D7?style=for-the-badge&logoColor=white)
![IBM X-Force](https://img.shields.io/badge/IBM_X--Force-052FAD?style=for-the-badge&logo=ibm&logoColor=white)
![MITRE](https://img.shields.io/badge/MITRE_ATT&CK-EE3340?style=for-the-badge&logoColor=white)

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

- [**Pranith-Jain.github.io**](https://github.com/Pranith-Jain/Pranith-Jain.github.io) — portfolio + **DFIR toolkit + Threat Intel platform** (the deployed thing at [pranithjain.qzz.io](https://pranithjain.qzz.io))
- [**DFIR-PLATFORM**](https://github.com/Pranith-Jain/DFIR-PLATFORM) — design trail and prototypes for the toolkit
- [**cti-stix-connector**](https://github.com/Pranith-Jain/cti-stix-connector) — containerised Python CLI that ingests JSON campaign + CSV IOC feeds and emits STIX 2.1 bundles
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
  <img height="170" src="https://github-readme-stats.vercel.app/api?username=Pranith-Jain&show_icons=true&theme=tokyonight&hide_border=true&include_all_commits=true&count_private=true&rank_icon=github" alt="Pranith's GitHub Stats" />
</a>
<a href="https://github.com/Pranith-Jain">
  <img height="170" src="https://github-readme-stats.vercel.app/api/top-langs?username=Pranith-Jain&layout=compact&theme=tokyonight&hide_border=true&langs_count=8" alt="Top Languages" />
</a>

<a href="https://github.com/Pranith-Jain">
  <img src="https://streak-stats.demolab.com?user=Pranith-Jain&theme=tokyonight&hide_border=true" alt="GitHub Streak" />
</a>

<a href="https://github.com/Pranith-Jain">
  <img src="https://github-profile-trophy.vercel.app/?username=Pranith-Jain&theme=tokyonight&no-frame=true&no-bg=true&column=7&margin-w=10" alt="GitHub Trophies" />
</a>

</div>

---

## open to

- Collaborating on **DFIR tooling**, **detection pipelines**, and **CTI platforms**
- Building **AI-powered security automation** with Claude Code and MCP
- Discussing **threat intelligence**, BEC investigation techniques, and OSINT
- **Email security** consulting (DMARC enforcement, deliverability, abuse response)
- Contributing to **open-source security projects**

Security is a team sport. Let's raise the bar.

---

<div align="center">

_Building at the intersection of AI, threat intelligence, and edge-native security tooling_

</div>
