---
slug: bofu-02-build-vs-buy
title: Build vs Buy: A Detection Engineer's Honest Take
funnel: bofu
platform: linkedin
format: carousel
hook: contrarian
persona: CISO
hashtags: cybersecurity, build-vs-buy, detection-engineering, SOC
cta: Save this. Reply with your decision — I send the ROI calculator in the comments.
notes: Contrarian hook. Comparison variant (not framework) — 4 dimensions with Build / Buy / Hybrid columns.
---

Build vs Buy: the wrong question.
The right question: what do you have the people to maintain?

---

KIND: list
The 3 things you should always build.

- Your detection content (rules, correlation logic, hunting queries)
- Your runbooks and playbooks (IP, even if the tool is off-the-shelf)
- Your metrics and dashboards (MTTD, MTTR, coverage by ATT&CK)
- Why: these are the moat. The vendor doesn't know your environment.

---

KIND: list
The 3 things you should almost always buy.

- The data pipeline (EDR agent, log shipper, SIEM backend)
- The platform team (vendor support, uptime, integrations)
- The threat intel feed (curated IOCs + context beats raw feeds)
- Why: building these in-house is a 5-year, $20M+ project for the same result.

---

KIND: list
The 4 things to actually decide.

- Data layer: Splunk vs Elastic vs Sentinel vs DIY? Buy.
- Detection authoring: vendor rules vs in-house Sigma? Build the priority ones.
- SOAR / automation: Tines vs Torq vs n8n vs ServiceNow? Buy if you have 5+ analysts.
- Custom threat hunting: in-house data science + Jupyter? Build, but only with 1 FTE.

---

KIND: list
The hidden cost of "build."

- Maintenance: a custom rule is a 2-year commitment (you own it forever)
- Documentation: every rule needs a runbook. Most don't get one.
- Coverage gap: a missed rule = a missed breach. The vendor's 200 are not your 200.
- Talent: you need 1 senior engineer per 200 rules. Most shops don't have this.

---

KIND: list
The hidden cost of "buy."

- Shelf-ware: 70% of SIEM features go unused in year 1.
- Vendor lock: switching costs are real (parsers, dashboards, runbooks).
- License creep: per-GB or per-host pricing punishes growth.
- Alert fatigue: vendor's 1,000 default rules fire 50,000 times a month. You tune them or quit.

---

KIND: list
The honest framework.

- Buy the platform. Build the content. Automate the boring stuff.
- Spend 70% of detection-engineering time on rules and runbooks, not infrastructure.
- If you can't maintain what you build, you've just created technical debt.
- The best SOCs use vendor platforms + heavy in-house detection content.

---

CTA: Reply with your stack.
I drop a free build-vs-buy ROI calculator in the comments.
