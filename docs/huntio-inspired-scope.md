# Hunt.io-inspired features — scope & decision doc

Scoping two Hunt.io surfaces against our existing stack. **No code yet** — this is
the decide-later artifact. Reference screenshots: Hunt.io Phishing Dashboard +
`hunt.io/malware-families`.

## Guiding principle

Hunt.io's moat is **proprietary internet-wide scanning** (JARM/JA4/SSL
fingerprinting, 5k brands continuously monitored, 107k proprietary detections,
live C2 discovery). We **do not** replicate the scanner. We replicate the
_surface_ by reassembling feeds + logic we already own, and we are honest in the
UI about what is "aggregated from public feeds" vs "monitored."

Non-goals (require paid scanning infra — explicitly out of scope):

- Live JARM/JA4/SSL C2 fingerprinting / discovery.
- Continuous monitoring of thousands of brands.
- Phishing-kit binary extraction from live infrastructure.

---

## Feature 1 — Phishing Dashboard ★ recommended first (≈90% reuse)

A `/threatintel/phishing` overview matching Hunt.io's layout: stat cards + quick
links + a phishing-categories taxonomy table.

### Data — almost entirely existing

| Need                       | Source (existing)                                                                                        | Status                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Detections volume + window | `api/src/routes/phishing-urls.ts`, `live-iocs.ts` (OpenPhish, PhishTank, PhishStats, URLhaus, ThreatFox) | reuse                         |
| Brands **detected**        | `brandFromUrl()` (80-brand attribution) in `phishing-urls.ts`                                            | reuse (expand list)           |
| Brand-cluster detections   | `detection-rules-pack.ts` `phishing-brand-cluster`                                                       | reuse                         |
| Category taxonomy          | `sector-classifier.ts` (17 sectors)                                                                      | reuse + static category table |
| Live ingest counter        | live-IOC feed rate                                                                                       | reuse                         |
| CT / typosquat signal      | `certstream.ts`, `passive-dns.ts`                                                                        | reuse (for Parked approx.)    |

### New work

- One aggregation route `GET /api/v1/phishing-overview` → `{ generated_at, stats:{detections_90d, brands_detected, brands_monitored, actors}, categories:[{key,label,description,count}], top_brands:[{brand,count}] }`. Mostly composes existing routes; cache 300–600s.
- One page `src/pages/threatintel/PhishingDashboard.tsx` following `IntelDashboard.tsx` / `Metrics.tsx` patterns (stat cards + `DataState` + hand-rolled SVG bars).
- Static phishing-category taxonomy (mirror Hunt.io's: Application, Casino, Ecommerce, Email, Energy, Enterprise, Finance, Gaming, Government, …) mapped onto `sector-classifier`.

### Gaps (ship as v2 enhancements, not blockers)

- **Phishing Kits** — needs kit signatures; partial via public phishing-kit GitHub corpora (fingerprint by file paths/titles). Label "experimental."
- **Parked Search** — approximate via CT-log + WHOIS-age + NS-entropy heuristics, not a scanner. Label "heuristic."
- **Phishing Threat Actors** — no phishing→actor link today; defer.

### Effort: ~1–2 days (overview + brands + categories + live detections).

---

## Feature 2 — Malware Families catalog (catalog yes, scanning no)

A `/threatintel/malware-families` catalog: family list, profile cards, tags
(Backdoor/APT/Cybercrime), "top 10" + "latest updates", per-family IOCs.

### Data — free sources, net-new wiring

| Need                               | Source                                                       | Status                             |
| ---------------------------------- | ------------------------------------------------------------ | ---------------------------------- |
| Family profiles (desc, refs, YARA) | **Malpedia free API** (`malpedia.caad.fkie.fraunhofer.de`)   | NEW provider                       |
| Family tags / software catalog     | **MITRE ATT&CK software** (free)                             | NEW (or reuse existing MITRE data) |
| Per-family IOCs + known C2         | **ThreatFox** by malware tag (already pulled) + C2IntelFeeds | reuse                              |
| "Top 10 / latest" ranking          | ThreatFox IOC volume per family                              | derive                             |

### New work

- Provider(s) for Malpedia + MITRE software → normalized `MalwareFamily` record.
- Route `GET /api/v1/malware-families` (list + ranking) and `GET /api/v1/malware-families/:slug` (profile + IOCs). Cache 1–6h (families change slowly).
- Catalog page + detail page (reuse the writeups/actor-profile page pattern).

### Gaps

- ❌ Live JARM/JA4/SSL C2 discovery feed — out of scope (proprietary scanning).
- "Known C2 per family" is _historical from feeds_, not live-scanned — label clearly.

### Effort: ~2–3 days (net-new providers + 2 pages).

---

## Recommendation

1. **Phishing Dashboard first** — highest value-for-effort; it's reassembly of
   data we already own, and visually closest to Hunt.io.
2. **Malware Families second** — solid, fully free (Malpedia + MITRE + ThreatFox),
   but net-new provider wiring rather than reuse.

Both honor the free-plan footguns (one batched IOC read, no per-provider fan-out
cache ops) since they compose already-batched routes rather than adding fan-out.
