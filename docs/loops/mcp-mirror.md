# MCP Mirror

**Category:** Release / manual

## Loop Description

After changing the DFIR MCP server (`worker/mcp-server.ts`, served at `/api/mcp`), mirror
the change to the standalone published repo `github.com/Pranith-Jain/dfir-mcp-server` via
a branch + PR. Loop until the standalone repo carries the mirrored diff.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT push directly to the standalone repo's `main` — it is blocked. Use a branch +
  PR.
- Do NOT run `npm install` on the clone to "make it work" — that is blocked too.
- Do NOT mark the loop done on a partial mirror — the standalone PR must reflect the same
  behavior change as the in-repo edit.
- If the mirror diff cannot apply cleanly, STOP and reconcile rather than force-pushing.

## Kickoff Prompt

```
Start the "MCP Mirror" loop.

Goal: The MCP change in worker/mcp-server.ts is mirrored to the standalone dfir-mcp-server repo via a PR
Max iterations: 5
Between iterations run: gh pr view on the dfir-mcp-server branch (check the diff)
Exit when: a PR is open on dfir-mcp-server carrying the mirrored change

Step 1: Take the diff applied to `worker/mcp-server.ts` (/api/mcp), port it to the
standalone repo on a fresh branch, and open a PR. Reconcile any drift between the two
copies.

Self-pace this loop. After each iteration, check the standalone PR diff, and only
continue if it does not yet reflect the change. Stop when the PR carries the mirror or
max iterations is reached. Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Capture the in-repo diff** — what changed in `worker/mcp-server.ts`.
2. **Branch the standalone repo** — fresh branch on `dfir-mcp-server` (no direct `main` push).
3. **Port the change** — apply the equivalent edit; reconcile any structural drift.
4. **Open PR** — `gh pr create`; verify the diff matches the in-repo change.
