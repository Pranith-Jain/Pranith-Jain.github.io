# CAPEv2 sandbox bridge — operator setup

The app ships a **dormant** CAPE integration. The Worker code
(`api/src/lib/cape-bridge.ts`, `api/src/routes/sandbox-cape.ts`, the
`/dfir/cape-sandbox` page) is live, but every `/api/v1/cape/*` route returns
`503` until you set the `CAPE_BRIDGE_URL` secret. Nothing here runs on
Cloudflare — you stand up CAPE yourself and point the Worker at it.

> ⚠️ **Not free.** CAPE does _dynamic_ detonation, which needs a host with
> **nested virtualization (KVM)** and a **Windows guest VM**. Free VM tiers
> (Oracle ARM, micro instances) cannot do this. Budget a small bare-metal /
> nested-virt-capable VM. If you only want free, static analysis, skip CAPE —
> you already have Triage + Hybrid Analysis wired in.

## Architecture

```
React (/dfir/cape-sandbox, admin-gated)
        │  multipart upload
        ▼
Cloudflare Worker  /api/v1/cape/{submit,task/:id,report/:id}
        │  HTTPS + Authorization: Token <CAPE_BRIDGE_TOKEN>
        ▼
Cloudflare Tunnel (cloudflared)  ── no inbound ports on the host
        ▼
CAPEv2  /apiv2/  (your KVM host)  ──→ Windows guest detonation
```

The Worker only **proxies bytes** — it never executes a sample. Submission is
gated on the master `ADMIN_TOKEN`.

## 1. Provision a KVM host

A Linux host with hardware virtualization. Confirm KVM is usable:

```bash
egrep -c '(vmx|svm)' /proc/cpuinfo   # > 0
kvm-ok                               # "KVM acceleration can be used"
```

## 2. Install CAPEv2 + a Windows guest

Follow the upstream installer — it provisions CAPE, its web/REST stack, and a
guest VM. See <https://github.com/kevoreilly/CAPEv2> and
<https://capev2.readthedocs.io/>. Verify the API responds locally:

```bash
curl -s http://127.0.0.1:8000/apiv2/cuckoo/status/ | head
```

## 3. Enable API auth

In CAPE's `conf/api.conf`, require a token so the tunnel endpoint isn't open:

```ini
[api]
token = <generate-a-long-random-token>
```

This token becomes the Worker's `CAPE_BRIDGE_TOKEN` (sent as
`Authorization: Token <token>`).

## 4. Expose `/apiv2/` through a Cloudflare Tunnel

No inbound firewall holes — `cloudflared` dials out to Cloudflare. A minimal
compose for the tunnel sidecar (CAPE itself runs on the host for KVM access):

```yaml
# docker-compose.cape-tunnel.yml
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel run
    restart: unless-stopped
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARED_TUNNEL_TOKEN} # from the Cloudflare Zero Trust dashboard
    network_mode: host # reach CAPE on 127.0.0.1:8000
```

In the Zero Trust dashboard, route a hostname (e.g. `cape.example.com`) to
`http://127.0.0.1:8000`. Optionally add a **Cloudflare Access** service-token
policy in front of it for defense in depth.

## 5. Set the Worker secrets (deploy from repo root)

```bash
# repo root — production Worker (see docs/DEPLOYMENT.md / deploy-checklist)
wrangler secret put CAPE_BRIDGE_URL     # e.g. https://cape.example.com  (the bridge appends /apiv2)
wrangler secret put CAPE_BRIDGE_TOKEN   # the conf/api.conf token from step 3
```

`CAPE_BRIDGE_URL` may be the bare base (`https://cape.example.com`) or already
include `/apiv2` — the client normalizes either. Once set, the routes go live
and `/dfir/cape-sandbox` starts accepting uploads.

## Routes the Worker exposes (all admin-gated)

| Method | Path                      | CAPE call                                                  |
| ------ | ------------------------- | ---------------------------------------------------------- |
| POST   | `/api/v1/cape/submit`     | `tasks/create/file/` (multipart, ≤ 32 MiB) → `{ task_id }` |
| GET    | `/api/v1/cape/task/:id`   | `tasks/view/{id}/` → `{ id, status }`                      |
| GET    | `/api/v1/cape/report/:id` | `tasks/report/{id}/` → normalized report + extracted IOCs  |

## Verify end-to-end

```bash
curl -s -X POST https://<your-site>/api/v1/cape/submit \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F file=@sample.bin
# → {"task_id": 123}
```

## Teardown / disable

Unset the secret to make the feature dormant again (routes go back to `503`):

```bash
wrangler secret delete CAPE_BRIDGE_URL
```
