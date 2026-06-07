---
slug: tofu-02-80-percent-stat
title: 80% of Breaches Use Valid Credentials
funnel: tofu
platform: linkedin
format: carousel
hook: data-shock
persona: Junior SOC Analyst
hashtags: cybersecurity, breach, credentials, DFIR, SOC
cta: Save this. Follow for detection rules that actually catch credential abuse.
notes: Data-shock hook. Stat hero on slide 2 to drive the number home. List of 3 detection signals. CTA references the next post.
---

80% of breaches use valid credentials.
Attackers aren't breaking in. They're logging in.

---

KIND: stat
STAT: 80%|of breaches involve valid credentials.
Stop chasing zero-days.

---

KIND: list
The 3 detection signals that catch most credential abuse.

- First-time login from a new ASN or geography for that user
- Privilege escalation within 24 hours of a brand-new login
- Bulk data access from a previously dormant account
- These three catch ~80% of credential abuse in most environments

---

KIND: list
Your SIEM probably misses this. Here's why.

- Most SIEM rules look for malware hashes and known IOCs
- A "valid login" looks like a normal login to a rule-based engine
- Anomaly detection requires UEBA, which most shops don't have
- The attackers know this. They move slowly to stay below the threshold

---

KIND: list
What to build this week.

- Impossible-travel rule: login from two countries in 1 hour
- New-device + new-location + sensitive action within 30 min
- Service account: human behavior on a machine account
- Alert on >3 MFA denials in 5 min for the same user (MFA fatigue)

---

CTA: Save this.
Detection rules for credential abuse drop next week.
