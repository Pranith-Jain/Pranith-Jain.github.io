# Environment Variables

This document lists all environment variables used by the portfolio backend.

## Required Variables

| Variable       | Description                                                            | Where to Get             |
| -------------- | ---------------------------------------------------------------------- | ------------------------ |
| `GROQ_API_KEY` | Groq API key for AI-powered features (report generation, case studies) | https://console.groq.com |

## Optional Variables (Enhanced Features)

### Threat Intelligence Providers

| Variable           | Description                                              | Free Tier             | Where to Get                             |
| ------------------ | -------------------------------------------------------- | --------------------- | ---------------------------------------- |
| `CROWDSEC_API_KEY` | CrowdSec CTI API key for IP threat intelligence          | 1,000 lookups/month   | https://www.crowdsec.net/cti-api         |
| `IPINFO_TOKEN`     | IPinfo.io token for IP geolocation and privacy detection | 50,000 requests/month | https://ipinfo.io/signup                 |
| `ABUSEIPDB_KEY`    | AbuseIPDB API key for IP abuse reports                   | 1,000/day             | https://www.abuseipdb.com/account/api    |
| `SHODAN_API_KEY`   | Shodan API key for host information                      | Limited free          | https://account.shodan.io                |
| `VIRUSTOTAL_KEY`   | VirusTotal API key for malware analysis                  | 4 requests/minute     | https://www.virustotal.com/gui/my-apikey |
| `MALPEDIA_API_KEY` | Malpedia API key for malware/actor data                  | Free for researchers  | https://malpedia.caad.fkie.fraunhofer.de |
| `LEAKIX_API_KEY`   | LeakIX API key for leak detection                        | Limited free          | https://leakix.net                       |

### Communication Channels

| Variable              | Description                             | Where to Get                                         |
| --------------------- | --------------------------------------- | ---------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`  | Telegram bot token for notifications    | https://core.telegram.org/bots#how-do-i-create-a-bot |
| `TELEGRAM_CHANNEL_ID` | Telegram channel ID for posting updates | Use @userinfobot                                     |

### Cloudflare Services

| Variable       | Description                   | Notes                            |
| -------------- | ----------------------------- | -------------------------------- |
| `AI`           | Workers AI binding            | Auto-configured in wrangler.toml |
| `BRIEFINGS_DB` | D1 database binding           | Auto-configured in wrangler.toml |
| `KV_CACHE`     | KV namespace for caching      | Auto-configured in wrangler.toml |
| `CASE_STUDIES` | KV namespace for blog content | Auto-configured in wrangler.toml |

### Feature Flags

| Variable                 | Description                                   | Default |
| ------------------------ | --------------------------------------------- | ------- |
| `BLOG_APPROVAL_REQUIRED` | Enable draft approval workflow for blog posts | `false` |

## Setting Environment Variables

### Local Development

Create a `.dev.vars` file in the `api/` directory:

```bash
# api/.dev.vars
GROQ_API_KEY=gsk_xxxxxxxxxxxxx
CROWDSEC_API_KEY=xxxxxxxxxxxxx
IPINFO_TOKEN=xxxxxxxxxxxxx
TELEGRAM_BOT_TOKEN=123456:ABC-DEF
TELEGRAM_CHANNEL_ID=-100123456789
```

### Production (Cloudflare Dashboard)

1. Go to Cloudflare Dashboard → Workers & Pages
2. Select your worker (`pranithjain`)
3. Go to Settings → Variables
4. Add each variable as an **Encrypted** secret

### Production (Wrangler CLI)

```bash
# Set a single variable
npx wrangler secret put GROQ_API_KEY

# Set multiple variables
echo "your_key" | npx wrangler secret put CROWDSEC_API_KEY
```

## Feature Impact

### Without `GROQ_API_KEY`

- ❌ Report Generator (`/api/v1/report/generate`) - falls back to Workers AI
- ❌ Case Study Generation - disabled
- ❌ Social Content Generation - disabled

### Without `CROWDSEC_API_KEY`

- ⚠️ IP reputation checks use other providers only
- ⚠️ CrowdSec threat data unavailable

### Without `IPINFO_TOKEN`

- ⚠️ IP geolocation falls back to ipwho.is
- ⚠️ Privacy detection unavailable

### Without `TELEGRAM_BOT_TOKEN`

- ⚠️ Telegram notifications disabled
- ⚠️ Telegram archive posting disabled

## Free Tier Usage Estimates

| Feature                | Service     | Free Limit             | Est. Usage       |
| ---------------------- | ----------- | ---------------------- | ---------------- |
| Report Generation      | Groq        | 14,400 req/day         | ~100 reports/day |
| Report Generation      | Workers AI  | 10k neurons/day        | ~100 reports/day |
| IOC Lifecycle          | D1          | 5M reads + 100k writes | Low              |
| CT Monitor             | D1 + crt.sh | 5M reads + unlimited   | Low              |
| Threat Intel Providers | Various     | See table above        | ~100 checks/day  |
| Analytics Engine       | Cloudflare  | Free                   | Unlimited        |
