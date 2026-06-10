# Audit Security Posture

**Category:** Auditing / manual

## Loop Description

A standing, whole-app security audit (broader than the per-diff review): sweep the
deployed CTI/DFIR surface for this app's exposure classes and loop until each is checked
and any finding is resolved or explicitly accepted. Covers CSP, untrusted-input handling
(OCR/EXIF/QR uploads, IOC parsing), DOMPurify/openpgp usage, D1-backed API-key handling,
the public MCP server, secrets, and SSRF in outbound fetches.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT mark a class "checked" without actually inspecting it — coverage of the checklist
  is the point, not a clean-looking summary.
- Do NOT accept a finding as "won't fix" without an explicit, recorded rationale.
- Do NOT broaden a CSP directive to a wildcard or add an unguarded outbound fetch to make
  something work — those are the exact exposures being audited.
- The public MCP server (`/api/mcp`) is anonymous-reachable — audit what it exposes as if
  an untrusted caller is on the other end.

## Kickoff Prompt

```
Start the "Audit Security Posture" loop.

Goal: Every exposure class is audited and each finding is resolved or explicitly accepted
Max iterations: 8
Between iterations run: audit the next exposure class (CSP, uploads/IOC parsing, sanitization, API keys, MCP, secrets, SSRF)
Exit when: every class is checked and all findings are fixed or recorded as accepted with rationale

Step 1: Pick the next exposure class. Inspect the relevant code and config, fix any
finding at the source, and record the verdict. Re-run a security review pass on what
changed.

Self-pace this loop. After each iteration, audit the next class and re-review changes, and
only continue while classes remain or findings are open. Stop when complete or max
iterations is reached. Give a short status update each pass.
```

## Steps (Agent Actions)

1. **CSP + frontend** — header-only nonce CSP intact; no wildcard `script-src`.
2. **Untrusted input** — uploads (OCR/EXIF/QR) and IOC parsing are bounded + sanitized (DOMPurify/openpgp used correctly).
3. **Keys + secrets** — D1-backed API-key handling, no committed secrets, gated reads.
4. **MCP + SSRF** — audit `/api/mcp` exposure as an anonymous caller; confirm outbound fetches are SSRF-guarded.
