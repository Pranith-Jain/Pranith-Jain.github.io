# Security Review The Diff

**Category:** Security / manual

## Loop Description

Before merging, review the pending changes on the current branch for the security issues
this DFIR / threat-intel app is exposed to — CSP regressions, untrusted-input handling
(OCR/EXIF/QR uploads, IOC parsing), DOMPurify/openpgp usage, D1-backed API-key handling,
the public MCP server, secrets, and SSRF in outbound fetches — and fix findings until a
re-review is clean.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT narrow the review scope to dodge a finding — review the whole branch diff, not
  just the easy files.
- Do NOT downgrade a real finding to "won't fix" to clear the loop; either fix it or stop
  and escalate it explicitly with rationale.
- Do NOT add a secret, a wildcard CSP directive, or an unguarded outbound fetch as a
  shortcut — those are the exact issues this loop exists to catch.
- A clean exit means a _fresh_ review pass found nothing new — not that you stopped
  looking.

## Kickoff Prompt

```
Start the "Security Review The Diff" loop.

Goal: The branch diff is free of new security issues for this DFIR/threat-intel app
Max iterations: 5
Between iterations run: a fresh security review of the pending branch diff (e.g. /security-review or the security-reviewer agent)
Exit when: a fresh review pass surfaces zero new actionable findings

Step 1: Review the branch diff for CSP regressions, untrusted-input handling
(OCR/EXIF/QR/IOC), DOMPurify/openpgp misuse, D1 API-key handling, MCP-server exposure,
secrets, and SSRF in outbound fetches. Fix each finding at the source, then re-review.

Self-pace this loop. After each iteration, run a fresh review, read the findings, and only
continue if any remain. Stop when clean or max iterations is reached. Give a short status
update each pass.
```

## Steps (Agent Actions)

1. **Scope the diff** — `git diff origin/main` for the full set of pending changes.
2. **Review by category** — CSP, untrusted input (uploads/IOC parsing), DOMPurify/openpgp, D1 API keys, MCP server, secrets, SSRF.
3. **Fix at the source** — remediate each finding; never suppress or de-scope a real one.
4. **Re-review** — run a fresh pass; exit only when it surfaces nothing new.
