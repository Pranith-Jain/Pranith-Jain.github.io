# Decision: Separating the portfolio from the DFIR / threat-intel tools

**Date:** 2026-09-30
**Status:** Proposed
**Owner:** Pranith
**Driver:** Four distinct pressures, none of them "sell the tools":

1. A recruiter landing on the GitHub repo sees a 171k-line security platform under a repo
   named `Pranith-Jain.github.io`, so the _portfolio_ work is invisible.
2. A visitor landing on `pranithjain.qzz.io` cannot tell the personal portfolio from the
   products — the home page is a live dashboard.
3. One build, one 329 MB `.git`, 23 workflows, 131 MB of `public/data` makes iteration
   slow and every change risky.
4. The tools deserve to stand alone as **open-source projects** with real docs and real
   attribution — not as a product listing. They are portfolio evidence, not inventory.

**Explicit non-goal:** this is not a commercialization decision. No pricing, no license
change, no feature gating, no lead capture. MIT stays MIT. The tools keep being free and
keyless. The goal is _legibility_, in both directions — a recruiter should find the person,
and a security engineer should find the tool.

---

## CONTEXT

The repo is currently three products on one deploy with a portfolio stapled to the front
of it. The measured shape:

| Concern                                 |   Files |       Lines | % of `src/pages` |
| --------------------------------------- | ------: | ----------: | ---------------: |
| `src/pages/dfir/` (CRUCIBLE)            |     200 |      78,440 |           38.5 % |
| `src/pages/threatintel/` (PANOPTICON)   |     220 |      92,658 |           45.5 % |
| Portfolio pages (top level, 11 files)   |      11 |       2,300 |            1.1 % |
| Tool pages at top level (legacy layout) |      24 |      11,500 |            5.6 % |
| **Total `src/pages/`**                  | **499** | **203,523** |                  |

Routes: 347 in `ROUTES` (`src/App.tsx:446-806`), 265 in `REDIRECTS` (`src/App.tsx:809-1129`).
`/threatintel*` = 176, `/dfir*` = 150, everything else = 21. Prerender list: 285 entries
(`scripts/prerender.mjs:44`). Sitemap: 294 URLs (`public/sitemap.xml`).

Repo weight:

| Thing          | Value                                                    |
| -------------- | -------------------------------------------------------- |
| `.git`         | 329 MB (260 MB packs, 164,716 objects, 3,344 commits)    |
| First commit   | 2025-02-04                                               |
| `public/data/` | 131 MB, 48 subtrees, 7,403 tracked files                 |
| Workflows      | 23 total, 18 of them `*-sync.yml`                        |
| SPA pages      | 483 `.tsx` under `src/pages/`                            |
| Worker         | one (`wrangler.jsonc:3`, `pranithjain`, no `env` blocks) |
| Domain         | one (`pranithjain.qzz.io`, `wrangler.jsonc:93`)          |
| Build          | one (`vite.config.ts`, single entry, `dist/`)            |

### The separation already exists — in three places, just not the one that hurts

1. **Runtime.** `src/App.tsx:1141-1150` computes `appMode` from
   `pathname.startsWith('/dfir' | '/argus' | '/threatintel' | '/radar')` and renders
   `AppShell` (no portfolio Header/Footer) versus `PortfolioShell`
   (`src/App.tsx:1223-1286`). The comment at `src/App.tsx:1136-1140` says it outright:
   _"/dfir/_ and /threatintel/* are stand-alone web apps hosted next to the portfolio."*
   The comment is a lie at build time — there is one bundle, one `dist/`, one prerender
   pass (`scripts/prerender.mjs:48-56` lists portfolio routes, then L60+ tool routes in the
   same array), one Worker, one domain.
2. **Branding.** PANOPTICON and CRUCIBLE are already distinct nav trees in
   `src/data/content.ts:629-655`, separately branded, separately OG-tagging
   (`public/og-dfir.*`, `public/og-threatintel.*`).
3. **GitHub.** A separate `profile` remote already exists (`Pranith-Jain/Pranith-Jain`,
   README-only, 5 branches), and `README.md:167-198` already lists every tool repo as its
   own row in "Open-source releases" — `cti-platform`, `DFIR-PLATFORM`, `dfir-mcp-server`,
   `dfir-cli`, `cti-cli`, `dfir-ai-skills`, `cti-ai-skills`, `cti-stix-connector`.

So this is a **naming and presentation problem wearing an architecture costume**. The one
genuinely wrong thing: the repo is named `Pranith-Jain.github.io`, so GitHub presents a
security platform _as_ the portfolio, and `README.md:9-23` leads with "Three surfaces, one
deploy" — putting the portfolio third.

### The coupling that a repo split would have to cut

The 11 portfolio pages are **not** a clean 11-file module. Their import closure is **235
files / 69,068 lines**, because:

- `src/pages/Home.tsx` imports `LiveSignalStrip` (L6), `LatestBriefingCard` (L8),
  `GlobalPulseCard` (L9), `QuoteOfTheDay` (L12), `ToolOfTheDay` (L13),
  `PageToCheckOut` (L14), `RecentWriting` (L18) — **7 of the home page is platform UI.**
  It calls `/api/v1/ioc-correlation`, `/api/v1/ransomware-recent`, `/api/v1/detections`.
- `src/data/content.ts:615-666` holds `navLinks` with portfolio (`/about`, `/skills`),
  PANOPTICON (`/threatintel/*`) and CRUCIBLE (`/dfir/*`) children interleaved in one array.
- `src/data/case-studies.ts` + `case-study-bodies.ts` feed both `/projects` and
  `RecentWriting` on the home page.
- `src/pages/Blog.tsx` / `BlogPost.tsx` fetch `/api/v1/blog/posts` — Worker route, D1-backed.
- `src/components/ToolStructuredData.tsx:39,82` puts schema.org on _both_ surfaces with
  the same `sameAs` identity.

Tool-only code: **599 files / 242,881 lines**. That is the 84% that would stay behind.

---

## CONSTRAINTS

- **Free-plan subrequest cap: 50 per invocation** (KV + Cache-API both count). The IOC
  fan-out already uses one batched `primeBatch` + one `flushBatch`. Any split that forks
  the Worker duplicates bindings and the fan-out budget.
- **`BRIEFINGS_DB`** is a D1 binding on this Worker. `api/wrangler.toml` is test-only and
  explicitly not deployed (`api/wrangler.toml:1-3`).
- **6 hardcoded repo-URL literals** must survive any rename:
  | Location                                     | What it does                                    |
  | -------------------------------------------- | ----------------------------------------------- |
  | `src/data/content.ts:347,355,363`            | 3 project cards link to this repo               |
  | `src/components/AppShell.tsx:314`            | tool chrome links back to the portfolio repo    |
  | `api/src/routes/reddit-feed.ts:59`           | `raw.githubusercontent.com` fallback fetch      |
  | `scripts/export-briefings-to-github.mjs:190` | generated index line pointing at this repo      |
  | `README.md:184`                              | DFIR-PLATFORM "shipped code lives in this repo" |
  | `package.json:2`                             | `"name": "pranith-jain-portfolio"`              |
- **2 workflows push to orphan branches of this repo** via `${GITHUB_REPOSITORY}`:
  `.github/workflows/reddit-feed.yml:53` (`reddit-feed-data`),
  `.github/workflows/telegram-rss-cache.yml:45` (`telegram-rss-cache`). A repo rename
  moves these branches; a repo split orphans them. `api/src/routes/reddit-feed.ts:59`
  is the hardcoded twin of the first one — they must be changed together or the reddit
  feed 404s.
- **SEO.** 294 sitemap URLs, 285 prerendered routes, 265 redirects. Any URL change needs a
  redirect entry _before_ the old URL dies. `/blog` carries the SEO value; `/dfir` carries
  the tool value. They are not equally cheap to move.
- **`main` moves fast** (auto-FF-merge mid-session, per CLAUDE.md). Every phase below must
  land on a branch and let it merge. No rebase/force-push/`branch -f main`.
- **Migrations are immutable.** Any phase that touches `BRIEFINGS_DB` needs `/create-migration`.

---

## OPTIONS

### Option A: Identity split, one repo (RECOMMENDED — do this first)

Rename the repo and restructure the README. No code moves, no deploy changes, no URL
changes, no data moves.

- Repo `Pranith-Jain.github.io` → **`dfir-threat-intel-platform`** (GitHub redirects the
  old name permanently, so the 6 literals can be updated lazily; the 2 push-workflows keep
  working because they use `${GITHUB_REPOSITORY}`).
- `package.json:2` → `"name": "dfir-threat-intel-platform"`, description rewritten to lead
  with the platform, add `homepage`, `repository`, and GitHub `topics`
  (`dfir`, `threat-intelligence`, `cloudflare-workers`, `mcp`, `detection-engineering`,
  `osint`, `ioc`, `security`).
- README restructure: portfolio becomes a 6-line card _first_ (who, what, link), then the
  platform gets the deep section it already deserves. The current "Three surfaces, one
  deploy" (`README.md:9-23`) inverts to match.
- Profile README (`profile` remote): explicit two-column split — **Person** (role, focus,
  contact, portfolio) vs **Tools** (repo list, each with one line). Right now the tools are
  interleaved with `currently_building` prose.
- Add a repo social-preview image (currently the GitHub card is the default).

**Cost:** ~1 hour, 7 files, zero deploy risk, fully reversible (rename back).

**What it does not do:** a visitor to the _site_ still lands on a dashboard. The GitHub
story is fixed; the site story is not.

---

### Option B: Surface split at the edge, same repo (do second)

One repo, one Worker, one build, one `public/data/`. Split the _presentation surface_ so
the two products stop sharing a front door.

Shape: `tools.pranithjain.qzz.io` (or `/tools` behind a Worker route) serves `AppShell`;
the apex serves `PortfolioShell`. Concretely:

- Host-based split: add a Worker hostname check, set a `SURFACE` binding
  (`portfolio` | `tools`) from the request Host, and branch on it. A second custom domain
  costs nothing on the free plan — it is a `routes` entry, not a second Worker.
- Rewrite `Home.tsx` so the portfolio home is _actually a portfolio_ (hero, about,
  experience, featured work, contact) and the 7 platform widgets
  (`LiveSignalStrip`, `LatestBriefingCard`, `GlobalPulseCard`, `QuoteOfTheDay`,
  `ToolOfTheDay`, `PageToCheckOut`, `RecentWriting`) move to a `ToolsHome` that the tools
  host serves. This is the single highest-value change in this whole document — it is what
  makes the site match the intent already written in `src/App.tsx:1136-1140`.
- Split `navLinks` (`src/data/content.ts:615-666`) into `portfolioNavLinks` and
  `toolsNavLinks`. Right now PANOPTICON/CRUCIBLE children are interleaved with
  `/about` and `/skills` in one array.
- Per-surface `SITE_URL`, sitemap shards, OG defaults, `manifest.json`, `robots.txt`.
  Today all of those assume one origin (`wrangler.jsonc:93`, `index.html:42,60-78`,
  `public/sitemap.xml`, `public/manifest.json`, `public/humans.txt`).
- Keep the paths as they are. `/dfir` and `/threatintel` stay reachable on both hosts via
  redirect, so no SEO or 265-entry-redirect work is triggered.

**Cost:** ~1 day, touches `Home.tsx`, `content.ts`, `App.tsx`, `worker/index.ts`,
`wrangler.jsonc`, `index.html`, sitemap/manifest/robots generation.

**Why this is the right layer:** the 18 sync workflows, the 131 MB `public/data/`, the
50-subrequest fan-out, and `BRIEFINGS_DB` all stay exactly where they are. The separation
becomes real to a visitor without paying any of the code-split tax.

---

### Option C: Targeted repo splits (only after A and B, only where forced)

Split _specific_ components into their own repos, in ascending order of shared surface.
Each one is independently justifiable; the set is not required.

| #   | Candidate                                     | Why it can leave                                                   | Shares with the platform                  | Effort |
| --- | --------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------- | -----: |
| 1   | `dfir-mcp-server`                             | Already mirrored standalone per CLAUDE.md — needs a branch+PR flow | Worker only via HTTP/MCP                  |  0.5 d |
| 2   | `winreg`, `nhi-scan`, `cairn`/`nova`/`denali` | Pure ported engines: `worker/lib/*` + vitest, zero UI, zero React  | nothing — deterministic + static          |  1-2 d |
| 3   | `ai-escape` registry                          | Curated data + build script, no live dependency                    | D1 report queue                           |  0.5 d |
| 4   | `blog`                                        | Needs a 294-URL redirect map; carries the SEO value                | `/api/v1/blog/posts`, D1, case-study data | 1-2 wk |
| 5   | `portfolio` site                              | Needs `Home.tsx` decoupled (Option B first), 2.2 MB `daily-briefs` | Worker routes, `BRIEFINGS_DB`             | 2-3 wk |

**Do NOT split:**

- **The Worker / API.** The 50-subrequest fan-out, `BRIEFINGS_DB`, and the shared
  Cache-API key hierarchy are _why_ one deploy works. Two Workers means two sets of
  secrets, two cron schedules, two `telegram-mtproto` sidecars, and 2× the deploy
  surface for zero user-visible gain.
- **`public/data/`.** 131 MB, 48 subtrees, generated by 116 build scripts. It is a build
  artifact with a regeneration path, not source. Splitting it means the tool repos each
  carry a copy and go stale independently.

**Blocker:** `.git` is 329 MB with 3,344 commits since 2025-02-04. `git filter-repo` over
7,403 tracked data files is slow and, worse, **destroys shared history** in the split
repos. If a split is ever forced, build the new repo with **fresh history** (single
"initial import" commit) and cross-link the old repo in the README, rather than filtering.

---

## RECOMMENDATION

**Option A now. Option B next. Option C only where a specific pressure forces it.**

A + B together get 100% of the four stated drivers:

| Driver                                         | A (identity) | B (surface) | C (repo split) |
| ---------------------------------------------- | -----------: | ----------: | -------------: |
| Recruiter finds the person on GitHub           |           ✅ |             |                |
| Visitor tells portfolio from tools on the site |              |          ✅ |                |
| Build / iteration weight                       |           🟡 |          ✅ |             ✅ |
| Tools legible as standalone OSS projects       |           🟡 |             |             ✅ |

C only moves the needle on the last two, and it costs the most and is the hardest to
reverse. A is an hour. B is a day and it is where the real legibility lives. Do A and B,
live with the result for a month, and only then ask whether any single C candidate has
accumulated enough independent activity to deserve its own repo — because a repo that gets
one commit a month is worse than a section in the platform README.

**Explicitly rejecting** the "split everything now" path: the measured ratio is 84% tools
to 1% portfolio, and the portfolio's own import closure is 235 files because its home page
is a dashboard. Cutting that 1% out of a repo whose `.git` is 329 MB and whose 23 workflows
all push to one Worker would cost weeks, orphan 2 push-workflows, and buy nothing a
hostname and a README rewrite cannot buy for a day.

---

## WHAT WE'RE GIVING UP

- **One repo, one story.** After A+B the GitHub repo is still one repo. A reader who wants
  the _portfolio source_ will not find a `pranithjain.github.io` repo. Mitigation: the
  portfolio card in the README + the profile README link to the live site, which is where
  the portfolio is actually consumed.
- **One shared history.** 3,344 commits stay together. The tools' commit history is not
  independently quotable.
- **The `/tools` host will not be a real independent app.** It shares the Worker, so it
  shares the subrequest budget and the cron. Under load the two surfaces contend. Accepted:
  the free-plan cap is per-invocation, and the two surfaces have disjoint traffic shapes.
- **`Home.tsx` gets less impressive.** Dropping `LiveSignalStrip` + `LatestBriefingCard` +
  `GlobalPulseCard` from the portfolio home makes it a _worse_ demo site. Deliberate: those
  widgets are the reason a recruiter cannot tell what you are. They move to the tools home,
  which is where they belong.

---

## FIRST ACTION AFTER THIS DECISION

### Phase 1 — Identity (Option A). Branch `chore/repo-identity-split`.

1. `git checkout main && git pull` — re-check the branch first; `main` auto-merges.
2. Rename the repo on GitHub: `Pranith-Jain.github.io` → `dfir-threat-intel-platform`.
   GitHub sets a permanent redirect, so the 6 literals can be fixed in the same PR.
3. Update the literals:
   - `src/data/content.ts:347,355,363` (project cards) — **and** add a
     `PLATFORM_REPO_URL` const at the top of `content.ts` so there is exactly one place to
     change next time.
   - `src/components/AppShell.tsx:314`
   - `api/src/routes/reddit-feed.ts:59` — the `raw.githubusercontent.com` twin of
     `.github/workflows/reddit-feed.yml:53`. Change both or the reddit feed 404s.
   - `scripts/export-briefings-to-github.mjs:190`
   - `README.md:184`
4. `package.json:2-4` — name, description, `homepage`, `repository`, `keywords`.
5. Add GitHub `topics` via `gh repo edit --add-topic`.
6. README restructure: portfolio card first, then the platform. Split the current
   `README.md:9-23` "Three surfaces" into a 6-line person card + a platform section.
7. Profile README (`profile` remote, separate branch + PR): two-column **Person** / **Tools**
   split. Move the 9 tool repos out of the `currently_building` YAML block into their own
   table.
8. Verify: `npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p api/tsconfig.json && npx tsc --noEmit -p api/tsconfig.worker.json` (all three — per the "esbuild deploys past `tsc`" footgun).
9. `npx vitest run` — `api/test/lib/profile-stats.test.ts` has `login: 'Pranith-Jain'`
   fixtures (L101, L112); confirm they are unaffected.
10. Confirm the 2 push-workflows still resolve after the rename:
    `git ls-remote --heads origin reddit-feed-data telegram-rss-cache`.
11. Deploy from **repo root** (`npm run deploy`, per the "two wranglers" footgun).
12. Post-merge: `node scripts/build-mcp-manifest.mjs && node scripts/build-llms-full.mjs`
    if any manifest text moved.

### Phase 2 — Surface (Option B). Branch `feat/surface-split`.

1. Rewrite `Home.tsx`: portfolio home = hero + about + experience + featured work +
   contact. Move `LiveSignalStrip`, `LatestBriefingCard`, `GlobalPulseCard`,
   `FeedHealthBadge`, `QuoteOfTheDay`, `ToolOfTheDay`, `PageToCheckOut`, `RecentWriting`
   into a new `src/pages/tools/ToolsHome.tsx`. The 7 widgets fetch
   `/api/v1/ioc-correlation`, `/api/v1/ransomware-recent`, `/api/v1/detections` — all stay.
2. Split `navLinks` (`src/data/content.ts:615-666`) into `portfolioNavLinks` +
   `toolsNavLinks`; export both. `Header`/`Footer` pick by `SURFACE`.
3. Add a `SURFACE` resolution in `worker/index.ts` from `request.headers.get('Host')` +
   a new `TOOLS_HOST` var in `wrangler.jsonc` and `.env.example`. Add the `routes` entry
   for the second custom domain (one entry, still one Worker — this is free).
4. Branch `src/App.tsx:1141-1150` `appMode` to prefer the `SURFACE` binding, keeping the
   path check as the fallback for `/dfir`, `/threatintel`, `/argus`, `/radar`.
5. Per-surface SEO: `SITE_URL` becomes per-surface; `scripts/build-sitemap.mjs` emits two
   shards; `index.html:42,60-78` OG/canonical use the surface origin;
   `public/manifest.json:2` name/categories; `public/robots.txt`; `public/humans.txt`.
6. `scripts/prerender.mjs` — the portfolio routes (L48-56) prerender against the portfolio
   origin, the tool routes (L60+) against the tools origin. Both still write to
   `dist/__prerendered/`.
7. Add redirect entries so `/dfir` and `/threatintel` on the portfolio host 302 to the
   tools host (and back for `/`, `/about`, `/skills`, `/experience`, `/projects` on the
   tools host) — into `REDIRECTS` (`src/App.tsx:809-1129`), not raw Worker code, so they
   stay reversible.
8. Verify: all three `tsc` projects, `npx vitest run`,
   `npx vitest run --config api/vitest.config.ts api/test/routes/` with the sandbox
   disabled (CI skips `test/routes/`).
9. `npx wrangler deploy --dry-run` — bundle under 10 MB / 3 MB gzip.
10. Deploy from repo root, then smoke-test both hosts against `.github/workflows/deploy.yml:90`.

### Phase 3 — Targeted splits (Option C). Only per-candidate, only when forced.

Start with #1 and #2 (`dfir-mcp-server`, then `winreg`/`nhi-scan`/`cairn`/`nova`/`denali`) —
they have no React, no Worker bindings, and no shared data. Fresh history, cross-link the
platform repo in the README. **Never `git filter-repo` the 329 MB `.git`.**

---

## KILL CRITERIA

Stop and re-decide if any of these become true:

- **Phase 1:** the rename breaks the 2 push-workflows (`reddit-feed-data`,
  `telegram-rss-cache`) or `api/src/routes/reddit-feed.ts:59` starts 404ing. Fix the
  literal _and_ the workflow together, or revert the rename — do not leave a half-migrated
  reference set.
- **Phase 2:** the second hostname needs its own Worker (not a `routes` entry), or needs
  its own secrets. That means the edge split is not free and Option B's cost model is
  wrong — fall back to a `/tools` path split on the single host.
- **Phase 2:** the portfolio home page loses measurable traffic/SEO. The portfolio
  pages' job is to be found; if `LiveSignalStrip` et al. were earning anything, keep them
  below the fold rather than removing them.
- **Phase 1 or 2:** the platform README stops being a useful standalone OSS front door —
  i.e. someone links the repo cold and can't tell what it is. Fix the README, don't
  reverse the rename.
- **Phase 3 (any candidate):** the split repo gets fewer than ~1 commit/month after a
  month of trying. Un-split it, or keep it as a folder in the platform repo. A stale
  standalone repo is worse than a well-organized section.
- **Any phase:** the Worker bundle exceeds 10 MB / 3 MB gzip, or the second surface
  starts competing with the first for the 50-subrequest budget under real load.
