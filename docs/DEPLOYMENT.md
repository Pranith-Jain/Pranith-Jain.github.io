# Deployment Guide

## Prerequisites

- Node.js 18+ installed
- Cloudflare account with Workers enabled
- Wrangler CLI authenticated (`npx wrangler login`)

## Quick Deploy

```bash
# 1. Install dependencies
npm install

# 2. Run D1 migrations
npx wrangler d1 migrations apply pranithjain-briefings

# 3. Build the frontend
npm run build

# 4. Deploy to Cloudflare
npm run deploy
```

## Detailed Steps

### 1. Environment Setup

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

See [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) for details on each variable.

### 2. Database Migrations

Apply pending D1 migrations:

```bash
# List pending migrations
npx wrangler d1 migrations list pranithjain-briefings

# Apply all pending migrations
npx wrangler d1 migrations apply pranithjain-briefings

# Verify migrations are applied
npx wrangler d1 migrations list pranithjain-briefings --remote
```

### 3. Build Frontend

```bash
# Build client-side assets
npm run build:client

# Build server-side rendering bundle
npm run build:server

# Generate prerendered pages
npm run build:prerender

# Or all at once
npm run build
```

### 4. Deploy

```bash
# Deploy everything (worker + assets)
npm run deploy
```

## Development

### Local Development

```bash
# Start frontend dev server (port 5173)
npm run dev

# Start API dev server (port 8787)
npm run dev:api

# Run both concurrently
npm run dev & npm run dev:api
```

### Running Tests

```bash
# Run API tests
cd api && npm test

# Run frontend tests
npm test

# Type checking
cd api && npm run typecheck
```

## Cloudflare Dashboard Setup

### Enable Analytics Engine

1. Go to Cloudflare Dashboard → Analytics Engine
2. Enable the "PJ" dataset
3. This enables usage tracking for IOCs, providers, and features

### Set Environment Variables (Secrets)

1. Go to Workers & Pages → pranithjain → Settings → Variables
2. Add each secret:
   - `GROQ_API_KEY` (required for AI features)
   - `CROWDSEC_API_KEY` (optional, enhances IP intel)
   - `IPINFO_TOKEN` (optional, enhances IP geo)
   - `TELEGRAM_BOT_TOKEN` (optional, enables notifications)

### Configure Custom Domain

1. Go to Workers & Pages → pranithjain → Settings → Domains & Routes
2. Add your custom domain (e.g., `pranithjain.qzz.io`)

## Monitoring

### View Logs

```bash
# Real-time logs
npx wrangler tail

# With filters
npx wrangler tail --format=pretty --status=error
```

### Check Analytics

1. Go to Cloudflare Dashboard → Analytics Engine
2. View the "PJ" dataset for:
   - API endpoint usage
   - Provider hit rates
   - IOC lookup patterns

### D1 Database

```bash
# Query the database
npx wrangler d1 execute pranithjain-briefings --command "SELECT COUNT(*) FROM briefings"

# Open interactive shell
npx wrangler d1 execute pranithjain-briefings --remote
```

## Troubleshooting

### Migration Errors

```bash
# Check migration status
npx wrangler d1 migrations list pranithjain-briefings --remote

# If stuck, manually mark migration as applied
npx wrangler d1 execute pranithjain-briefings --command "
  INSERT INTO d1_migrations (name, applied_at)
  VALUES ('0007_ioc_lifecycle.sql', datetime('now'))
"
```

### Build Errors

```bash
# Clear build cache
rm -rf dist .ssr-build node_modules

# Reinstall dependencies
npm install

# Rebuild
npm run build
```

### Deploy Errors

```bash
# Check wrangler version
npx wrangler --version

# Update wrangler
npm install wrangler@latest

# Retry deploy
npm run deploy
```

## Rollback

### Quick Rollback

```bash
# Deploy previous version
git checkout HEAD~1
npm run build
npm run deploy
```

### View Deployment History

1. Go to Cloudflare Dashboard → Workers & Pages → pranithjain
2. View "Deployments" tab
3. Click "Rollback" on a previous deployment

## Performance Optimization

### Edge Caching

The API uses Cloudflare's edge cache for:

- Feed data: 15-60 minutes
- CVE data: 1-4 hours
- Threat intel: 4-24 hours

### Rate Limiting

Built-in rate limiting protects against abuse:

- 100 requests per minute per IP for read endpoints
- 10 requests per minute per IP for write endpoints

### Database Optimization

- D1 queries are optimized with proper indexes
- IOC lifecycle uses exponential moving averages for decay
- CT monitor uses incremental updates

## Security

### CORS Configuration

Allowed origins are configured in `api/src/index.ts`:

```typescript
origin: ['https://pranithjain.qzz.io'];
```

### Admin Authentication

Admin endpoints require `X-Admin-Token` header:

```bash
curl -H "X-Admin-Token: your_token" https://api.example.com/api/v1/admin/health
```

### API Key Rotation

```bash
# Generate new API key
npx wrangler secret put GROQ_API_KEY

# Revoke old key from provider dashboard
```
