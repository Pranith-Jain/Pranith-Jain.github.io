# D1 Migration Apply & Verify

**Category:** Deploy / manual

## Loop Description

Add a new D1 migration and apply it, verifying the live schema matches what the code
expects. Applied migrations are immutable and remote applies are destructive — so this
loop adds a _new_ forward migration (never edits an old one) and confirms the resulting
schema before the code that depends on it ships.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT edit an already-applied migration to "fix" the schema — migrations are
  immutable; add a new forward migration via `/create-migration`.
- Do NOT run `--remote` (destructive) without explicit user confirmation; iterate against
  local first.
- Do NOT hand-edit the live schema out-of-band to make a check pass — the migration files
  are the source of truth.
- The D1 binding is `BRIEFINGS_DB` and the database is `pranithjain-briefings`; do not
  assume a `DB` binding.

## Kickoff Prompt

```
Start the "D1 Migration Apply & Verify" loop.

Goal: A new migration is applied and the live schema matches what the code reads/writes
Max iterations: 5
Between iterations run: apply migrations locally + query the resulting schema (sqlite_master / table info)
Exit when: every column/table the code touches exists with the expected type, locally green; remote applied only on user confirmation

Step 1: Add the new migration via /create-migration. Apply it locally
(`npx wrangler d1 migrations apply pranithjain-briefings --local` from the repo root) and
verify the schema against the code's reads/writes. Only apply `--remote` after the user
confirms (it is destructive).

Self-pace this loop. After each iteration, apply + inspect the schema, and only continue
if it does not match. Stop when it matches or max iterations is reached. Give a short
status update each pass.
```

## Steps (Agent Actions)

1. **Add a forward migration** — `/create-migration` (never edit an applied one).
2. **Apply local** — `npx wrangler d1 migrations apply pranithjain-briefings --local` from the repo root.
3. **Verify schema** — query the live tables/columns; confirm they match the code's reads/writes.
4. **Apply remote (gated)** — `… --remote` only after explicit user confirmation; destructive.
