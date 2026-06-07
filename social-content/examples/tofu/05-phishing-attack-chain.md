---
slug: tofu-05-phishing-attack-chain
title: The 5-Stage Phishing Attack Chain
funnel: tofu
platform: linkedin
format: carousel
hook: data-shock
persona: Security Practitioner
hashtags: cybersecurity, phishing, email-security, blue-team
cta: If this helped, save it for your next phishing investigation.
notes: Data-shock hook. The 5-stage phishing attack chain: recon → weaponize → deliver → exploit → hand-off. Cites Verizon DBIR 2024 (68% human element), Valimail (3.4B emails/day), IBM ($4.9M avg breach cost). Real TTPs (MITRE ATT&CK T1566, T1598, T1078). Targets SOC analysts + email security engineers. Next post: KQL detection queries for M365.
---

3.4 billion phishing emails are sent every day.
Here's the 5-stage attack chain behind them.

---

KIND: stat
STAT: 68% | of breaches involve a human element — phishing is the #1 initial access vector (Verizon DBIR 2024)

---

KIND: list
5 stages of a phishing attack

- Recon — OSINT scraping, LinkedIn profiles, target profiling, org chart mapping
- Weaponize — lure crafting, domain spoofing, payload delivery, brand impersonation
- Deliver — email sending, SMS, voice phishing, social media DMs, QR codes
- Exploit — credential harvest, malware delivery, OAuth consent, session hijack
- Hand-off — lateral movement, privilege escalation, data exfiltration, persistence

---

KIND: framework
4 detection rules that catch real phish

- First-time sender with executable/URL — alert on new sender + attachment/link combo
- Spoofed sender domain — SPF/DKIM/DMARC failures from external domains
- OAuth consent grants — unknown apps requesting mailbox/calendar access
- AiTM proxy login — login from new IP + new device + new location in <5 min

---

KIND: quote
The best phishing email you've ever seen is the one that got past your email gateway. The worst one is the one that got past your users.

---

CTA: If this helped,
save it for your next phishing investigation.
