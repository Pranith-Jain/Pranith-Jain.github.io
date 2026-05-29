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

---

## Threat Intelligence

### POST `/api/v1/report/generate`

Generate AI-powered threat intelligence reports.

**Request Body:**

```json
{
  "query": "CVE-2024-1709"
}
```

**Example:**

```bash
curl -X POST "https://api.example.com/api/v1/report/generate" \
  -H "Content-Type: application/json" \
  -d '{"query": "APT28"}'
```

**Response:**

```json
{
  "ok": true,
  "title": "Threat Actor Report: APT28",
  "markdown": "## TL;DR\n\nAPT28 is a Russian state-sponsored...",
  "query": "APT28",
  "generated_at": "2026-05-29T12:00:00.000Z",
  "elapsed_ms": 2450
}
```

**Supported Query Types:**

- **CVE IDs** - Detailed vulnerability analysis with CVSS, EPSS, KEV status
- **Threat Actors** - Attribution, TTPs, campaigns, associated CVEs
- **Generic Entities** - Any security-related topic

**AI Models:**

1. Groq (Llama 4 Scout) - Primary
2. Workers AI (Llama 3.3 70B) - Fallback

---

## External Data Sources

### GET `/api/v1/leakix/search`

Search LeakIX for exposed services and leaks.

**Parameters:**

- `q` (required) - Search query (max 200 chars)

**Example:**

```bash
curl "https://api.example.com/api/v1/leakix/search?q=example.com"
```

**Response:**

```json
{
  "count": 5,
  "results": [
    {
      "ip": "192.168.1.1",
      "port": 443,
      "protocol": "https",
      "service": "nginx",
      "leak": {
        "id": "leak-123",
        "leak_type": "service",
        "leak_data": "example data",
        "created_at": "2024-01-01T00:00:00Z"
      }
    }
  ],
  "generated_at": "2026-05-29T12:00:00.000Z"
}
```

**Features:**

- Searches for exposed services, ports, and protocols
- Returns up to 50 results
- Caches responses for 1 hour

---

## Frontend Integration

The following frontend pages now have backend support:

| Page              | Endpoint                  | Status   |
| ----------------- | ------------------------- | -------- |
| Domain Reputation | `/api/v1/domain-rep`      | ✅ Ready |
| Domain Monitor    | `/api/v1/domain-monitor`  | ✅ Ready |
| Report Generator  | `/api/v1/report/generate` | ✅ Ready |
| LeakIX Search     | `/api/v1/leakix/search`   | ✅ Ready |

### Optional: Update Frontend to Use Backend

The Domain Reputation and Domain Monitor pages currently work client-side. To use the backend instead:

1. Update `src/pages/dfir/DomainReputation.tsx` to fetch from `/api/v1/domain-rep`
2. Update `src/pages/threatintel/DomainMonitor.tsx` to fetch from `/api/v1/domain-monitor`

Benefits of backend integration:

- Faster response times (server-side caching)
- More reliable (dedicated DNS resolution)
- Reduced client-side load

---

## Testing

Run the test suite:

```bash
cd api
npm test
```

Test files:

- `test/routes/domain-advanced.test.ts` - Domain rep/monitor tests
- `test/routes/report-generator.test.ts` - Report generation tests
- `test/routes/leakix.test.ts` - LeakIX search tests
