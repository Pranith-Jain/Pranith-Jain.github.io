---
slug: mofu-01-siem-vs-edr
title: SIEM vs EDR: What Catches What
funnel: mofu
platform: linkedin
format: carousel
hook: how-to
persona: Detection Engineer
hashtags: cybersecurity, SIEM, EDR, detection-engineering
cta: Save this. Reply with your stack — I'll send the gap analysis template.
notes: How-to hook. Comparison variant compares coverage across 5 attack stages. CTA is a feedback loop.
---

SIEM vs EDR.
Same SOC, two tools, totally different jobs. Here's the map.

---

KIND: list
What your SIEM catches.

- Lateral movement (logon events, SMB, WinRM, RDP, SSH)
- Privilege escalation (new group membership, sudo, runas)
- Data exfil (DNS tunneling, large outbound transfers, beaconing)
- Identity attacks (impossible travel, MFA fatigue, new-ASN logins)
- SIEM = your correlation engine. Logs are the substrate.

---

KIND: list
What your EDR catches.

- Malware execution (file writes, process injection, hollowing)
- Persistence (scheduled tasks, services, registry Run keys)
- Credential dumping (LSASS access, Mimikatz signatures, SAM reads)
- Living-off-the-land binaries (PowerShell, WMI, PsExec telemetry)
- EDR = your behavior engine. Endpoint telemetry is the substrate.

---

KIND: list
Where most stacks have gaps.

- Insider threat: needs DLP + UEBA, neither SIEM nor EDR does this alone
- Cloud: AWS GuardDuty / Azure Defender, not on-prem SIEM rules
- Email: needs a separate stack (Proofpoint, Mimecast, IRONSCALES)
- Network east-west: needs NDR (Vectra, ExtraHop, Corelight) for lateral spread
- Identity: needs ITDR (CrowdStrike Falcon, Microsoft Defender for Identity)

---

KIND: list
The 5 attack stages and which tool wins.

- Initial Access → EDR (phishing payload execution)
- Execution → EDR (process tree, LOLBins)
- Persistence → EDR (registry, scheduled tasks)
- Lateral Movement → SIEM (auth logs, SMB, RDP)
- Exfil → SIEM (DNS, proxy, firewall logs)
- Both. Always. Don't pick one.

---

KIND: list
How to build coverage without buying more.

- Map your detections to MITRE ATT&CK. Find the 30% with zero coverage.
- Add EDR telemetry into your SIEM (Sysmon + Crowdstream-style forwarding).
- Write 3 high-fidelity correlation rules per quarter. Not 30 garbage ones.
- Detection engineers > more logs.

---

CTA: Reply with your stack.
I drop a free gap-analysis template for the comments.
