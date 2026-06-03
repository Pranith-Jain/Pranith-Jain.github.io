# Recon-tool bridge — operator setup

The app ships a **dormant** recon integration. The Worker code
(`api/src/lib/recon-bridge.ts`, `api/src/routes/recon.ts`, the
`/dfir/recon-bridge` page) is live, but `/api/v1/recon/scan` returns `503`
until you set `RECON_BRIDGE_URL`. Subfinder / Amass / theHarvester / SpiderFoot
are Go/Python CLIs that can't run on Workers, so they run on your box and the
Worker is just a typed, admin-gated client.

The frontend hides the tool until it's live: the Recon Bridge card is omitted
from the DFIR grid, inline search, and the ⌘K palette, and a direct visit to
`/dfir/recon-bridge` redirects to `/dfir`. This is driven by a public probe,
`GET /api/v1/features` (`{ "cape": false, "recon": false }` — booleans only),
which flips `recon` to `true` the moment `RECON_BRIDGE_URL` is set.

> ✅ **Can be free.** Unlike the CAPE sandbox, these CLIs run fine on a free
> small VM (e.g. an Oracle Cloud ARM always-free instance) — no nested virt.

> ⚠️ **Authorized targets only.** This runs _active_ recon from your IP. The
> Worker route is admin-gated and validates the target charset, but you are
> responsible for only scanning assets you're allowed to test.

## Bridge contract

The Worker calls exactly one endpoint:

```
POST {RECON_BRIDGE_URL}/recon
Authorization: Bearer {RECON_BRIDGE_TOKEN}
Content-Type: application/json

{ "tool": "subfinder" | "amass" | "theharvester" | "spiderfoot", "target": "example.com" }

→ 200 { "subdomains": string[], "hosts": string[], "emails": string[] }
```

Your wrapper maps each `tool` to its CLI and normalizes stdout into those three
arrays. Anything else (extra keys) is ignored by the Worker.

## 1. A minimal wrapper

A tiny HTTP shim that shells out to the installed CLIs. Sketch (Node/Express):

```js
// server.js — runs the recon CLIs and returns normalized JSON
import express from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

const TOKEN = process.env.RECON_TOKEN;
const app = express();
app.use(express.json());

app.post('/recon', async (req, res) => {
  if (req.get('authorization') !== `Bearer ${TOKEN}`) return res.sendStatus(401);
  const { tool, target } = req.body ?? {};
  // Hard allow-list, anchored so the value can't start with '-' and be parsed
  // as a CLI flag (argument injection). Never interpolate into a shell string.
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9._:@-]*[a-zA-Z0-9])?$/.test(target ?? ''))
    return res.status(400).json({ error: 'bad target' });
  try {
    if (tool === 'subfinder') {
      // `--` ends option parsing so `target` can never be read as a flag.
      const { stdout } = await run('subfinder', ['-silent', '-d', '--', target]);
      return res.json({ subdomains: stdout.split('\n').filter(Boolean) });
    }
    if (tool === 'amass') {
      const { stdout } = await run('amass', ['enum', '-passive', '-d', '--', target], { timeout: 110_000 });
      return res.json({ subdomains: stdout.split('\n').filter(Boolean) });
    }
    if (tool === 'theharvester') {
      const { stdout } = await run('theHarvester', ['-d', target, '-b', 'all', '-f', '/tmp/out']);
      // parse emails/hosts from theHarvester output…
      return res.json({ emails: [], hosts: [] });
    }
    if (tool === 'spiderfoot') {
      // drive sf.py / the SpiderFoot API and map results
      return res.json({ subdomains: [], hosts: [], emails: [] });
    }
    return res.status(400).json({ error: 'unknown tool' });
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }
});
app.listen(8080);
```

> Use `execFile` with an argument array (never string concatenation) so the
> target can't inject shell commands — and keep the regex allow-list as a second
> layer.

## 2. docker-compose (wrapper + CLIs + tunnel)

```yaml
# docker-compose.recon.yml
services:
  recon:
    build: . # image with subfinder, amass, theHarvester, spiderfoot + server.js
    environment:
      - RECON_TOKEN=${RECON_TOKEN}
    expose:
      - '8080'
  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARED_TUNNEL_TOKEN}
    depends_on:
      - recon
```

Route a hostname (e.g. `recon.example.com`) → `http://recon:8080` in the
Cloudflare Zero Trust dashboard. No inbound ports on the host.

## 3. Set the Worker secrets (deploy from repo root)

```bash
wrangler secret put RECON_BRIDGE_URL    # e.g. https://recon.example.com  (the client appends /recon)
wrangler secret put RECON_BRIDGE_TOKEN  # must equal RECON_TOKEN in the wrapper
```

Once set, `/dfir/recon-bridge` goes live. Unset `RECON_BRIDGE_URL` to make it
dormant again (route returns 503).

```

```
