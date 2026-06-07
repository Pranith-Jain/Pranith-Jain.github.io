---
slug: tofu-04-phishing-resistant-mfa-gap
title: Your MFA Is Already Broken
funnel: tofu
platform: linkedin
format: carousel
hook: data-shock
persona: Security Practitioner
hashtags: cybersecurity, MFA, FIDO2, passkeys, blue-team
cta: Save this. Next post: the FIDO2 rollout playbook — 4 weeks, one team, zero SMS.
notes: Data-shock hook. Contrarian angle: the gap between "we have MFA" and "we have phishing-resistant MFA" is where 2024-2025 breaches live. Stat + 5-bypass list + 4-step framework + real-world quote. Specific tools (Evilginx2, Modlishka, Lumma, StealC, YubiKey, Windows Hello). Microsoft 99.9% stat + push fatigue dwell time + AiTM relay TTPs from MITRE ATT&CK T1556 + T1078.
---

Your MFA is already broken.
5 bypass techniques attackers use every week.

---

KIND: stat
STAT: 99.9% | of automated account compromise blocked by phishing-resistant MFA — the 0.1% that slips through is the 80% of breaches you read about

---

KIND: list
5 MFA bypasses in the wild

- AiTM proxies (Evilginx2, Modlishka) — relay the live session to attacker in real-time
- Push fatigue / prompt bombing — 50-100 prompts until the user accepts one (Uber, Cisco, MGM)
- SIM swap — $50-$1,000 buys a port; SMS code now belongs to the attacker
- Session cookie theft — Lumma, RedLine, StealC grab tokens from a phished browser
- OAuth consent phishing — "Allow" grants an attacker app persistent access

---

KIND: framework
4 weeks to phishing-resistant

- Week 1: inventory every app and rank by data sensitivity (P0 = identity, money, infra)
- Week 2: enable FIDO2 / passkeys for P0 apps; force hardware key for admins
- Week 3: block SMS, voice, and TOTP as fallback for P0; keep as P2/P3 only
- Week 4: deploy number-matching + show-geo for push, alert on >3 denials in 5 min

---

KIND: quote
The gap between "we have MFA" and "we have phishing-resistant MFA" is where the last 12 months of enterprise breaches live. — every incident review that doesn't get published

---

CTA: Want the rollout playbook?
Save this. Next post: the FIDO2 rollout playbook — 4 weeks, one team, zero SMS.
