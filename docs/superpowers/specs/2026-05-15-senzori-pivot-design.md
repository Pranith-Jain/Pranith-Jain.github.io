# Senzori — Portfolio → Product Pivot

**Date:** 2026-05-15
**Author:** brainstormed with Claude
**Status:** Draft, pending review

## Goal

Reposition `pranithjain.qzz.io` from a personal portfolio with side toolkit into a product-shaped open-source threat-intelligence toolkit named **Senzori — by Pranith Jain**. Remove portfolio-style pages (Skills, Experience, Projects), keep an About page that establishes the maker. Add a clear OSINT vs DFIR split with both interactive tools and curated external-resource catalogs.

## Non-goals

- New domain (`senzori.tld`) — keep `pranithjain.qzz.io`
- Logo / graphic mark — wordmark only
- Light theme
- Localization
- Renaming the Cloudflare Worker (`pranithjain`) — would break the deployed binding

## Decisions locked during brainstorm

| #   | Decision                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Home = hybrid: hero + 4 live counters + recent case studies + 3-tile tool grid                                       |
| 2   | Top nav: `Home · DFIR · OSINT · Threat Intel · Blog · About`                                                         |
| 3   | Remove Skills, Experience, Projects pages and the corresponding section components                                   |
| 4   | OSINT = interactive tools hub (12 tools moved from `/dfir/*`) **and** a curated resources sub-page                   |
| 5   | DFIR = existing interactive tools hub **and** a sibling curated resources sub-page                                   |
| 6   | Curated catalogs seeded once from `awesome-osint` and `awesome-incident-response`, then maintained as typed TS files |
| 7   | 4 misclassified TI pages (ScamWatch, OnionWatch, TelegramWatch, DarkWeb) move from `/dfir/*` to `/threatintel/*`     |
| 8   | Product branding: `Senzori — by Pranith Jain`. Domain unchanged.                                                     |
| 9   | About page = short bio + contact + social. No Companies / Memberships / Certifications                               |

## Information architecture

```
/                       Home (Senzori hybrid landing)
/dfir                   DFIR interactive tools hub
/dfir/<tool>            individual DFIR tools (~50)
/dfir/resources         curated DFIR catalog (awesome-incident-response seed)
/osint                  OSINT interactive tools hub
/osint/<tool>           12 interactive OSINT tools (moved from /dfir/*)
/osint/resources        curated OSINT catalog (awesome-osint seed, ~15 categories)
/threatintel            TI dashboard + feeds
/threatintel/<page>     existing TI pages + 4 relocated /dfir pages
/blog                   case-study feed (auto-generated, from Plan 1)
/blog/<slug>            individual posts
/blog/rss.xml           RSS
/admin                  admin UI (token-gated, from Plan 1+2)
/about                  bio + contact + social
```

Removed: `/skills`, `/experience`, `/projects` — replaced with 301 redirects to `/`.

## Tool relocations

### `/dfir/*` → `/osint/*` (12 tools)

| Tool                 | File                 | Rationale                  |
| -------------------- | -------------------- | -------------------------- |
| ASN Lookup           | `AsnLookup.tsx`      | Network recon              |
| Certificate Search   | `CertSearch.tsx`     | crt.sh / DNS recon         |
| Domain Lookup        | `Domain.tsx`         | WHOIS / passive DNS        |
| EXIF Parser          | `ExifParse.tsx`      | Image metadata             |
| IP Geolocation       | `IpGeo.tsx`          | IP intel                   |
| OSINT Framework      | `OsintFramework.tsx` | Reference matrix           |
| Reverse Image        | `ReverseImage.tsx`   | Image search               |
| SOCMINT              | `Socmint.tsx`        | Social media intel         |
| Username Pivot       | `UsernamePivot.tsx`  | People search              |
| Wayback              | `Wayback.tsx`        | Web archives               |
| Web Scan             | `WebScan.tsx`        | Recon                      |
| Punycode / Homograph | `Punycode.tsx`       | Lookalike-domain detection |

### `/dfir/*` → `/threatintel/*` (4 tools)

| Tool           | File                | Rationale                         |
| -------------- | ------------------- | --------------------------------- |
| Scam Watch     | `ScamWatch.tsx`     | Passive monitoring (TI, not DFIR) |
| Onion Watch    | `OnionWatch.tsx`    | Dark-web feed (TI)                |
| Telegram Watch | `TelegramWatch.tsx` | Channel monitoring (TI)           |
| Dark Web       | `DarkWeb.tsx`       | Leak-site aggregator (TI)         |

If any of these duplicate an existing `/threatintel/*` page, merge into the existing page rather than creating a sibling.

### Stays in `/dfir/*` (~50 tools)

IOC checker, IOC extractor, MITRE / ATT&CK matrices, ATLAS, kill chain, diamond model, CVE lookup, CVE list, CVE resources catalog, threat actors, briefings, phishing analyzer, EML extractor, decoder, encoder, JWT inspector, STIX viewer, STIX graph, YARA manager, log parser, malware scan, threat map, threat map chart, exposure scanner, takeover, breach checker, URL preview, agent map, awesome lists, privacy hub, privacy probe, crypto trace, DLP scan, GRC, NHI, MCP audit, OWASP, full spectrum, dashboard, prompt injection, PowerShell deobf, rule playground, rules, secops catalog, tabletop, tech-AI news, threat feeds, wiki, wiki article, email defense, lolbins, data classification.

## Home page layout

```
┌────────────────────────────────────────────────────────────────┐
│  Top nav  ·  Home · DFIR · OSINT · Threat Intel · Blog · About │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  SENZORI                                                       │
│  Open-source threat-intelligence toolkit.                      │
│  60+ tools. Live IOC feeds. Free at the edge.                  │
│                                                                │
│  [ Open Toolkit ]  [ Read Case Studies ]                       │
│                                                                │
├────────────┬────────────┬────────────┬─────────────────────────┤
│  4 live counters refreshed hourly from `/api/v1/home/stats`    │
│  CVEs in KEV · IOCs aggregated today · Leak sites · Actors     │
├────────────────────────────────────────────────────────────────┤
│  Recent case studies (top 3 from posts:index)                  │
├────────────────────────────────────────────────────────────────┤
│  3-tile toolkit grid: DFIR · OSINT · Threat Intel              │
└────────────────────────────────────────────────────────────────┘
```

### Live counter sources

| Counter               | Source                                                                             | Caching       |
| --------------------- | ---------------------------------------------------------------------------------- | ------------- |
| CVEs in KEV           | CISA KEV feed (already cached at `kv:case-studies/kev` and existing CVE list page) | Edge cache 1h |
| IOCs aggregated today | sum of recent IOC counts from existing 22 IOC providers                            | Edge cache 1h |
| Leak sites watched    | static count from existing dark-web feed config                                    | Hard-coded    |
| Threat actors tracked | count from MITRE ATT&CK groups data shipped in `src/data/`                         | Hard-coded    |

A single new endpoint `/api/v1/home/stats` aggregates all four. Response shape:

```ts
{
  cvesInKev: number;
  iocsToday: number;
  leakSitesWatched: number;
  actorsTracked: number;
  updatedAt: string; // ISO 8601
}
```

Cached at the edge with `Cache-Control: public, max-age=3600`.

## OSINT page

`/osint` shows 12 interactive tools in a grid (the relocated ones). Same visual pattern as `/dfir`'s tool hub.

`/osint/resources` is a curated catalog page seeded from [awesome-osint](https://github.com/jivoi/awesome-osint). Static data file at `src/data/catalogs/osint.ts`. ~15 categories, ~10–30 entries each = 150–400 total.

Categories:

- Username & people search
- Email investigation
- Phone number lookup
- Image search & EXIF
- Geolocation & maps
- Social media platforms
- Domain & DNS / WHOIS
- IP, network, ASN
- Web archives & cached pages
- Dark web search
- Cryptocurrency tracing
- Vehicle / VIN
- IoT / Shodan-like
- Government & public records
- Threat intel feeds

UI: collapsible category sections, text search box at top, no live data fetches (everything statically rendered from the TS file). Each entry: name + 1-line description + outbound link + optional tags (e.g., `cli`, `paid`, `account-required`).

## DFIR page

`/dfir` stays as today (interactive tools hub).

`/dfir/resources` is the new curated catalog seeded from [awesome-incident-response](https://github.com/meirwah/awesome-incident-response). Static data file at `src/data/catalogs/dfir.ts`. Categories drawn from the source README.

UI mirrors `/osint/resources` for consistency.

## Catalog data shape

`src/data/catalogs/types.ts`:

```ts
export interface CatalogEntry {
  name: string;
  url: string; // absolute https
  description: string;
  tags?: string[]; // e.g. 'cli', 'paid', 'account-required'
}

export interface CatalogCategory {
  category: string; // kebab-case id
  title: string; // display title
  entries: CatalogEntry[];
}

export type Catalog = CatalogCategory[];
```

`src/data/catalogs/osint.ts` and `dfir.ts` export the typed catalog arrays.

## Bootstrap script

`scripts/bootstrap-catalogs.mjs` is a one-off node script (NOT a runtime cron) that:

1. Fetches the raw `awesome-osint` and `awesome-incident-response` READMEs from GitHub
2. Parses their Markdown headings + bulleted lists into `CatalogCategory[]`
3. Writes the typed TS files (with stable ordering for clean diffs)

Run manually: `node scripts/bootstrap-catalogs.mjs`. After bootstrap, the TS files are edited like any other content file.

## About page

```
┌────────────────────────────────────────────────────────────────┐
│  About Senzori                                                 │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Two short paragraphs:                                         │
│  1) What Senzori is and what problems it solves.               │
│  2) Who Pranith Jain is and why he's building this.            │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│  Contact                                                       │
│  Email · GitHub · X · LinkedIn · RSS                           │
└────────────────────────────────────────────────────────────────┘
```

`src/components/sections/About.tsx` is trimmed to bio paragraphs. `src/components/sections/Contact.tsx` is reused as-is.

Sections deleted: Companies, Memberships, Certifications, Skills, Experience, Projects, Solutions (verify unused), Featured (verify unused).

## Branding & SEO

| Surface                | Before                            | After                                                                                             |
| ---------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `<title>` (Home)       | `Pranith Jain — Security Analyst` | `Senzori — Open Threat Intelligence Toolkit`                                                      |
| Meta description       | Portfolio copy                    | `Open-source threat-intel toolkit. 60+ tools, live IOC feeds, free at the edge. By Pranith Jain.` |
| Top-left wordmark      | "Pranith Jain"                    | `Senzori` (small "by Pranith Jain" subtitle on home only)                                         |
| `package.json` `name`  | `pranith-jain-portfolio`          | `senzori`                                                                                         |
| Wrangler worker name   | `pranithjain`                     | unchanged                                                                                         |
| Domain                 | `pranithjain.qzz.io`              | unchanged                                                                                         |
| Favicon / OG PNG       | existing                          | regenerated with Senzori wordmark via `scripts/generate-og-png.mjs`                               |
| JSON-LD WebSite schema | (none / portfolio)                | `{ "@type": "WebSite", "name": "Senzori", "url": "https://pranithjain.qzz.io", ... }`             |

## Footer

```
Senzori  ·  Open-source threat-intel toolkit

Toolkit          Resources           Connect
DFIR             DFIR Resources      GitHub
OSINT            OSINT Resources     Email
Threat Intel     Blog                RSS
                 About

© 2026 Pranith Jain · MIT licensed
```

## Redirects

301 redirects added at the top of the Worker's `fetch` handler in `worker/index.ts`:

```
/skills                → /
/experience            → /
/projects              → /
/dfir/asn-lookup       → /osint/asn-lookup
/dfir/cert-search      → /osint/cert-search
/dfir/domain           → /osint/domain
/dfir/exif             → /osint/exif
/dfir/ip-geo           → /osint/ip-geo
/dfir/osint-framework  → /osint/osint-framework
/dfir/reverse-image    → /osint/reverse-image
/dfir/socmint          → /osint/socmint
/dfir/username-pivot   → /osint/username-pivot
/dfir/wayback          → /osint/wayback
/dfir/web-scan         → /osint/web-scan
/dfir/punycode         → /osint/punycode
/dfir/scam-watch       → /threatintel/scam-watch
/dfir/onion-watch      → /threatintel/onion-watch
/dfir/telegram-watch   → /threatintel/telegram-watch
/dfir/dark-web         → /threatintel/dark-web
```

Old URLs from search indexes / external links → new URLs, no 404s.

## Sitemap & robots

- `public/sitemap.xml` regenerated to include `/`, `/dfir`, `/dfir/resources`, `/osint`, `/osint/resources`, `/threatintel`, `/blog`, `/about`, all individual blog posts, and all interactive tool routes.
- `/skills`, `/experience`, `/projects` dropped from sitemap.
- `public/robots.txt` updated with `Disallow: /admin`.

## File operations summary

### New files (~6)

```
src/pages/
├── Home.tsx                              (replace existing — Senzori hybrid)
├── osint/
│   ├── Osint.tsx                         (tools hub)
│   └── Resources.tsx                     (curated catalog)
└── dfir/
    └── Resources.tsx                     (curated catalog)

src/data/catalogs/
├── osint.ts                              (seeded)
├── dfir.ts                               (seeded)
└── types.ts

scripts/bootstrap-catalogs.mjs

api/src/routes/home-stats.ts
api/test/routes/home-stats.test.ts
api/test/redirects.test.ts
src/test/catalogs.test.tsx
```

### Files moved (16 total — `git mv`, internal imports updated, routes updated)

- 12 `src/pages/dfir/<Tool>.tsx` → `src/pages/osint/<Tool>.tsx`
- 4 `src/pages/dfir/<Tool>.tsx` → `src/pages/threatintel/<Tool>.tsx`

### Files deleted

```
src/pages/Skills.tsx
src/pages/Experience.tsx
src/pages/Projects.tsx
src/components/sections/Skills.tsx
src/components/sections/Experience.tsx
src/components/sections/Companies.tsx
src/components/sections/Memberships.tsx
src/components/sections/Certifications.tsx
src/components/sections/Projects.tsx
src/components/sections/Solutions.tsx        (verify unused first)
src/components/sections/Featured.tsx         (verify unused first)
```

### Files modified

```
src/App.tsx                                  routes
src/components/sections/About.tsx            slim down
src/components/sections/Hero.tsx             repurpose for Senzori
worker/index.ts                              add redirect table
public/sitemap.xml                           regen
package.json                                 rename
scripts/generate-og-png.mjs                  Senzori wordmark
index.html                                   title + meta description
```

## Testing strategy

| Layer               | Test                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route registration  | `src/test/routes.test.tsx` — snapshot of registered routes vs expected list                                                                       |
| Redirects           | `api/test/redirects.test.ts` — for each old URL, hit and assert 301 to expected new URL                                                           |
| Home stats endpoint | `api/test/routes/home-stats.test.ts` — mock provider responses, assert aggregated counts and Cache-Control header                                 |
| Catalog data        | `src/test/catalogs.test.tsx` — load both catalogs, assert no duplicate entries, all URLs are absolute https, all categories have title + ≥1 entry |
| OSINT hub           | render test — 12 tool tiles present                                                                                                               |
| OSINT Resources     | render test — 15 categories rendered, search filters down to matches                                                                              |
| DFIR Resources      | render test — categories rendered                                                                                                                 |
| Home                | render test — counters render with mocked stats, top 3 case studies appear                                                                        |
| About               | render test — bio + contact links present, asserts no Companies/Memberships/Certifications elements                                               |

Existing tests stay (Blog, BlogPost, admin, case-study pipeline, etc.).

## Failure modes

| Scenario                                            | Handling                                                                                 |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `/api/v1/home/stats` fetch fails on Home            | Counters fall back to "—"; rest of page renders. No spinner blocking content.            |
| Catalog TS file has malformed entry (missing field) | Build-time TS error catches it. Tests assert shape.                                      |
| Bootstrap script fetch fails                        | Script exits with error; no partial overwrite of existing TS file.                       |
| Redirect target matches another redirect            | Redirect table checked once; no chained redirects. Test asserts targets are not in keys. |
| Tool relocation breaks an internal import           | Build-time TS error. CI catches.                                                         |

## Migration plan (commit-by-commit)

12–15 tasks total. Order:

1. Catalog types + bootstrap script
2. Run bootstrap, commit `osint.ts` + `dfir.ts`
3. Catalog data tests
4. `/osint/resources` + `/dfir/resources` pages
5. Tool relocations (12 to OSINT)
6. Tool relocations (4 to TI)
7. Redirect table in worker + tests
8. Delete portfolio pages + section components
9. Trim About page
10. `/api/v1/home/stats` endpoint + tests
11. New Home page (Senzori hybrid)
12. Branding shift (title, meta, OG, footer, package.json)
13. Sitemap regen + robots.txt
14. Smoke test + deploy

Each task gets one commit.

## Out of scope (deferred)

- New domain (`senzori.tld`)
- Logo / graphic mark
- Light theme
- Localization

These are explicitly deferred. If you change your mind on any of them, they become their own design + plan cycle.
