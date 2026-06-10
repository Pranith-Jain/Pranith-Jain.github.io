# New API Endpoints

This document describes the new backend API endpoints added in this update.

## Domain Intelligence

### GET `/api/v1/domain-rep`

Check domain or IP reputation against 26+ DNS blacklist sources.

**Parameters:**

- `domain` (optional) - Domain to check
- `ip` (optional) - IP address to check

**Example:**

```bash
curl "https://api.example.com/api/v1/domain-rep?domain=example.com"
curl "https://api.example.com/api/v1/domain-rep?ip=8.8.8.8"
```

**Response:**

```json
{
  "target": "example.com",
  "type": "domain",
  "score": 100,
  "domain": [
    { "source": "dbl.spamhaus.org", "listed": false },
    { "source": "multi.surbl.org", "listed": false }
  ],
  "ips": [
    {
      "ip": "93.184.216.34",
      "checks": [
        { "source": "zen.spamhaus.org", "listed": false },
        { "source": "bl.spamcop.net", "listed": false }
      ]
    }
  ],
  "generated_at": "2026-05-29T12:00:00.000Z"
}
```

**Features:**

- Checks 20+ IP blacklists (Spamhaus, SpamCop, Barracuda, SORBS, etc.)
- Checks 6 domain blacklists (DBL, SURBL, URIBL, etc.)
- Resolves domains and checks all associated IPs
- Returns reputation score (0-100, where 0 is clean)
- Caches results for 5 minutes

**Frontend Integration:**

- Updated `src/pages/dfir/DomainReputation.tsx` to use backend API
- Faster response times with server-side caching
- More reliable DNS resolution

---

### GET `/api/v1/domain-monitor`

Detect typosquat domains and potential phishing variants.

**Parameters:**

- `domain` (required) - Domain to monitor

**Example:**

```bash
curl "https://api.example.com/api/v1/domain-monitor?domain=example.com"
```

**Response:**

```json
{
  "domain": "example.com",
  "total_variants": 85,
  "checked": 20,
  "active": 1,
  "inactive": 19,
  "results": {
    "active": [{ "domain": "exmple.com", "type": "typo", "ips": ["93.184.216.34"] }],
    "inactive": [
      { "domain": "exampl.com", "type": "typo" },
      { "domain": "example.net", "type": "tld-swap" }
    ],
    "unchecked": [{ "domain": "example-login.com", "type": "affix" }]
  },
  "generated_at": "2026-05-29T12:00:00.000Z"
}
```

**Detection Types:**

- **typo** - Character omission, duplication, or swap
- **homoglyph** - Visually similar characters (Cyrillic, numbers)
- **affix** - Added prefixes/suffixes (login-, secure-, mail.)
- **tld-swap** - Different TLD (.com → .net, .org, etc.)

**Frontend Integration:**

- New page: `src/pages/threatintel/DomainMonitor.tsx`
- Integrated with Domain Reputation page for quick navigation

---

## Removed Endpoints

The following endpoints were removed as they duplicate existing functionality:

| Endpoint                       | Reason                   | Alternative                       |
| ------------------------------ | ------------------------ | --------------------------------- |
| `POST /api/v1/report/generate` | Duplicate of Copilot     | Use `/api/v1/copilot/investigate` |
| `GET /api/v1/leakix/search`    | Similar to Breach checks | Use `/api/v1/breach/*` endpoints  |

---

## Frontend Pages Updated

| Page                   | Changes                                                |
| ---------------------- | ------------------------------------------------------ |
| `DomainReputation.tsx` | Now uses backend API instead of client-side DNS checks |
| `DomainMonitor.tsx`    | New page with typosquat detection UI                   |

---

## Testing

Run the test suite:

```bash
cd api
npm test
```

Test files:

- `test/routes/domain-advanced.test.ts` - Domain rep/monitor tests (6 tests)

---

## Report Ingestion (SP2)

### POST `/api/v1/report/ingest` (multipart/form-data)

Upload a threat report (PDF / DOCX / image / HTML / text) → extract its text →
run it through the existing `buildStixBundle` pipeline → return the same
`{ bundle, view }` as `intel-bundle/build`.

**Auth:** admin-gated (covered by the `/api/v1/report` `ADMIN_GATED_PREFIXES`
entry) — untrusted uploads trigger Workers AI vision OCR + a provider fan-out, so
the route must not be anonymous. The frontend page sends `adminAuthHeaders()`.

**Fields:** `file` (required), `tlp` (`WHITE`|`AMBER`, default `AMBER`),
`sourceName` (optional; defaults to the filename).

**Extraction routing (free-plan 10 ms CPU cap aware):**

- `text` / `html` → in-Worker strip (CPU-cheap).
- `image` (PNG/JPG) → Workers AI vision OCR (I/O-bound; consumes neuron budget).
- `pdf` / `docx` → optional self-hosted `file2txt` bridge. If
  `FILE2TXT_BRIDGE_URL` is unset, these return **503** with a setup hint (the
  bridge is dormant-by-default and never breaks the deploy). In-Worker PDF/DOCX
  parsing is infeasible on the free 10 ms CPU cap.

**Errors:** 400 (missing/invalid multipart) · 413 (>10 MB own cap, multipart is
exempt from the global 256 KB `looseValidation` cap) · 415 (unsupported type) ·
422 (no usable text) · 502 (enrichment/build failed) · 503 (PDF/DOCX, bridge
unset).

**Frontend:** `/dfir/report-ingest` (`src/pages/dfir/ReportIngest.tsx`) — drag-drop
→ renders the `IntelView` summary + STIX bundle, with `.stix.json` export.
