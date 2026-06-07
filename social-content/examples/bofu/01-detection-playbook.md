---
slug: bofu-01-detection-playbook
title: The Detection Playbook I Wish I Had at Year 0
funnel: bofu
platform: linkedin
format: carousel
hook: story
persona: Detection Engineer
hashtags: cybersecurity, detection-engineering, SOC, DFIR
cta: If this helped, save it for your next IR.
notes: Story hook. Framework variant = the 6 phases of the playbook, each with a specific action.
---

I built my first SOC from zero in 2018.
Here's the playbook I'd start with on day one.

---

KIND: framework
Phase 1: Map the terrain
You can't detect what you don't know exists.

- Inventory: every host, every account, every service account
- MITRE ATT&CK navigator: shade the techniques that matter to your stack
- Identify the 3 critical assets (crown jewels) — accounts that own them
- Output: a one-page map of what you're defending

---

KIND: framework
Phase 2: Get the logs in
Logs are the substrate. EDR is a shortcut.

- Sysmon on every endpoint (SwiftOnSecurity config as a baseline)
- Forward: DC logs, firewall, DNS, proxy, EDR — at least
- If you can't log it, you can't alert on it. Period.
- Don't boil the ocean. Start with the 5 sources above.

---

KIND: framework
Phase 3: Build the 10 rules
Forget 200 rules. Ten high-fidelity > 200 garbage.

- Impossible travel (login from 2 countries in 1 hour)
- New service account + first logon within 24h of creation
- LSASS access from non-EDR process (Mimikatz signature)
- Bulk file read from a single host (>1000 files in 10 min)
- Outbound DNS volume spike (tunneling indicator)
- MFA fatigue: >3 denials in 5 min, same user
- Scheduled task created by non-admin user
- New ASRep roasting or Kerberoasting activity
- PowerShell -enc from non-admin user
- Office app spawning wscript, cscript, or powershell
- These 10 catch ~70% of real-world incidents.

---

KIND: framework
Phase 4: Test, don't trust
A detection you've never tested is a guess.

- Atomic Red Team for every rule — invoke, verify it fires
- Purple-team exercises quarterly with red team or use SimuLand
- False-positive review monthly. Tune or kill any rule >50% FP rate.
- "It should fire" is not a detection. "It fires on Atomic #15" is.

---

KIND: framework
Phase 5: Make IR boring
Incident response is a muscle, not a talent.

- Write 3 runbooks: ransomware, BEC, credential abuse
- Tabletop quarterly. Use a real breach from the news. Time yourselves.
- On-call rotation: even 1 person, even part-time. No "we'll figure it out."
- The team that practices slow plays fast during incidents.

---

KIND: framework
Phase 6: Tell the story
Detections without narrative = alert fatigue.

- Weekly metric: MTTD, MTTR, alert volume, FP rate
- Monthly: top 5 detections, top 5 false positives, top 3 hunts run
- Quarterly: what you caught, what you missed, what you'll build next
- Leadership reads the dashboard. ICs read the runbooks.

---

CTA: If this helped,
save it for your next IR.
