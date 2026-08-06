# Fixing the `daily-threat-brief` repo `briefings/` sync

## Symptom

`https://github.com/Pranith-Jain/daily-threat-brief/tree/main/briefings` stopped
updating after 2026-08-02. The dated-folder files
(`YYYY-MM-DD/daily-threat-brief-YYYY-MM-DD.md`) kept updating, but the
`briefings/` folder (the rich PANOPTICON briefings from D1) went stale.

## Root cause

The `briefings-to-github.yml` workflow (in this repo) has **failed on every run
since it was added on 2026-08-01**. The failure is:

```
::error::CLOUDFLARE_API_TOKEN is not set
```

Two repository secrets are missing from `Pranith-Jain/Pranith-Jain.github.io`:

| Secret                 | Purpose                                                                      | Status                                        |
| ---------------------- | ---------------------------------------------------------------------------- | --------------------------------------------- |
| `CLOUDFLARE_API_TOKEN` | `wrangler d1 execute --remote` reads the `pranithjain-briefings` D1 database | ❌ never set                                  |
| `GH_PAT`               | `git push` to `Pranith-Jain/daily-threat-brief`                              | ❌ never set (set as temp stopgap 2026-08-06) |

The export script (`scripts/export-briefings-to-github.mjs`) reads briefings
from D1 via `wrangler d1 execute --remote`, which requires a Cloudflare API
token with D1 read access. Without it, the workflow exits before producing any
files, so `briefings/` never updates.

## Verification (2026-08-06)

- D1 `pranithjain-briefings` has fresh briefings for Aug 1–5 (created daily by
  the 00:30 UTC briefing cron). The data is healthy.
- Running `node scripts/export-briefings-to-github.mjs --days 30` locally
  (with wrangler OAuth) produces 27 daily + 3 weekly briefings, including
  `daily-2026-08-05.md` (73 KB, 359 findings, 212 CVEs, 1396 IOCs).
- The `briefings/` folder was manually backfilled to 2026-08-05 in commit
  `ebc2a23` on `Pranith-Jain/daily-threat-brief`.

## Fix — set the two secrets

### 1. `CLOUDFLARE_API_TOKEN` (long-lived)

Create a Cloudflare API token with D1 read access:

1. Go to <https://dash.cloudflare.com/profile/api-tokens> → **Create Token**.
2. Use **Custom token** with these settings:
   - **Permissions**: `Account` → `D1` → `Read`
   - **Account Resources**: `Include` → `PJ` (account `6a7461d701e2e1c989e05137b0255405`)
   - **TTL**: no expiry (or 1 year+)
3. Copy the token.
4. Add it as a repository secret on `Pranith-Jain/Pranith-Jain.github.io`:
   ```bash
   gh secret set CLOUDFLARE_API_TOKEN -R Pranith-Jain/Pranith-Jain.github.io
   # paste the token when prompted
   ```

### 2. `GH_PAT` (long-lived — replace the temporary one)

The `GH_PAT` was set 2026-08-06 from a short-lived `gh` OAuth token that expires
in ~8 hours. Replace it with a long-lived PAT:

1. Go to <https://github.com/settings/tokens?type=beta> → **Generate new token (fine-grained)**.
2. Settings:
   - **Resource owner**: `Pranith-Jain`
   - **Repository access**: `Only select repositories` → `Pranith-Jain/daily-threat-brief`
   - **Permissions**: `Contents` → `Read and write`
   - **Expiration**: 90 days (or 1 year)
3. Copy the token.
4. Replace the secret:
   ```bash
   gh secret set GH_PAT -R Pranith-Jain/Pranith-Jain.github.io
   # paste the token when prompted
   ```

### 3. Verify

Trigger the workflow manually and check it succeeds:

```bash
gh workflow run briefings-to-github.yml -R Pranith-Jain/Pranith-Jain.github.io
gh run watch -R Pranith-Jain/Pranith-Jain.github.io --workflow briefings-to-github.yml
```

Then confirm `briefings/daily-<today>.md` appears in
`Pranith-Jain/daily-threat-brief`.

## How the two briefing systems differ

|              | `briefings/` folder                                                                       | `YYYY-MM-DD/daily-threat-brief-*.md`                                              |
| ------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Producer** | `briefings-to-github.yml` (this repo)                                                     | `generate.yml` in the `daily-threat-brief` repo                                   |
| **Source**   | D1 `pranithjain-briefings` (PANOPTICON briefing engine)                                   | `webamon-org/Daily-Threat-Brief` + NVD/KEV/OSSF/IOC indexes                       |
| **Content**  | Full CTI briefing: 200+ findings, CVE/KEV/IOC tables, ransomware victims, MITRE, IOC dump | Lightweight summary: 10 CVEs, webamon campaign deltas, supply-chain, IOC families |
| **Size**     | 30–90 KB                                                                                  | ~3 KB                                                                             |
| **Route**    | `/threatintel/briefings/daily-YYYY-MM-DD` (D1-backed)                                     | (none — repo-only)                                                                |

The `briefings/` folder is the rich one the user wants. The dated-folder files
are a separate, lighter product from a different generator.

## `/daily-briefs` is a third, unrelated system

`https://pranithjain.qzz.io/daily-briefs` is the **agentic-ai-daily-reports**
vertical (cyber/deepfake/disaster/maritime briefs from
`agentic-ai-daily-reports.netlify.app`), built by `build-daily-briefs.mjs` and
served from `public/data/daily-briefs/`. It is healthy and unrelated to either
briefing system above.
