# Brainstorm: Integrate etugen.io-style threat intel features

Status: BRAINSTORMING (not yet approved — design not presented)

## What the user asked
"Can we integrate this kind of detailed information" — referring to screenshots from etugen.io,
a threat-intel / attack-surface tool. The portfolio is a DFIR / threat-intel app
(Cloudflare Workers + React frontend; TWO wranglers — deploy from repo root).

## Features shown in the etugen.io screenshots (candidate features to integrate)
1. **Exposed Host view** — given an IP, show:
   - Country, ASN (+ org name e.g. "Oracle Corporation"), artifact count, total size,
     first seen / last seen dates
   - Table of exposed files: name, type (DIR/MD/LOG/JSON/PY/EXE/DLL/ZIP), size, HTTP status (200),
     last seen ("12m", "2d")
   - Tag badges on files/dirs: git-exposure, scanner, tunnel, history, exploit,
     active-directory, c2, mitm
2. **File content preview** — text/x-python preview pane with byte count, plus:
   - Hashes: MD5, SHA256, SHA512
   - Source URL + depth + fetch_count
   - Classification: rule_name + MITRE ATT&CK technique badge (e.g. T1059.006)
3. **WHOIS history / pivot search** — given a domain:
   - Search by: Auto, Domain, Email, Name/surname, Nameserver, Phone, Company/org, Country, Registrar
   - WHOIS record: registrar, # snapshots, created/expires dates
   - WHOIS HISTORY table: snapshots over time (registrant name/email/phone/address redacted),
     created/expires/duration ("2220d ago"), name servers — i.e. pivot through historical ownership

## Brainstorming progress
- Was exploring codebase structure (src/pages/, src/pages/dfir/, api/src/routes/) when context hit limit.
- From git status, the repo has: api/src/routes/{taxii,threat-pulse,abuse-rss,briefings-rss,
  ransomware-merged-rss,telegram-leak-bot,case-study-admin}.ts and src/pages/dfir/UrlPreview.tsx
  — so there's an existing DFIR section with a UrlPreview page. New libs added recently:
  ioc-scoring.ts, stix-import.ts, detection-pipeline.ts, validation-schemas.ts, openapi.ts.

## Open questions to resolve with user (NOT yet asked)
- Which of the 3 feature areas do they want? (Exposed Host, File preview+hashes+MITRE, WHOIS history pivot)
- Real data source vs. mock/demo? etugen.io is a paid product; do they have an API/data feed,
  or is this a portfolio showcase using public APIs (Shodan/Censys/WHOIS providers) or sample data?
- Is this meant to be a live tool or a case-study/demo presentation?

## Next steps
1. Finish exploring src/pages/ and src/pages/dfir/ and api/src/routes/ to see existing patterns.
2. Ask clarifying questions ONE at a time (data source first — it gates everything).
3. Propose 2-3 approaches, present design, get approval, write spec, then writing-plans.
