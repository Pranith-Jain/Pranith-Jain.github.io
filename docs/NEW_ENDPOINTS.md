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
