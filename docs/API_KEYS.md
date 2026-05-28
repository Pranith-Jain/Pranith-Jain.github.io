# API Key Authentication

The DFIR Toolkit & Threat Intelligence API uses API keys for programmatic access.

## Authentication Modes

| Source                          | Auth Required                |
| ------------------------------- | ---------------------------- |
| Frontend (`pranithjain.qzz.io`) | No — same-origin passthrough |
| External API calls              | Yes                          |
| MCP server (`/api/mcp`)         | Yes                          |

## Generate an API Key

### Option 1: Admin Dashboard (Recommended)

1. Navigate to `/admin` and sign in with your admin token
2. Click the **API Keys** tab
3. Enter a label (e.g., `ci-pipeline`, `my-laptop`, `cursor-mcp`)
4. Select a role: **Read-only** or **Admin**
5. Click **Create**
6. **Copy the key immediately** — it's only shown once

### Option 2: CLI

```bash
curl -X POST https://pranithjain.qzz.io/api/v1/admin/keys \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label": "my-app", "role": "readonly"}'
```

Response:

```json
{
  "key": "abcdef1234567890abcdef1234567890abcdef12",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "prefix": "abcdef12",
  "label": "my-app",
  "role": "readonly"
}
```

## Use an API Key

### HTTP Headers

Pass the key via `Authorization: Bearer` (preferred) or `X-API-Key`:

```bash
# Bearer token
curl https://pranithjain.qzz.io/api/v1/ioc/check?indicator=1.1.1.1 \
  -H "Authorization: Bearer abcdef1234567890abcdef1234567890abcdef12"

# X-API-Key header
curl https://pranithjain.qzz.io/api/v1/ioc/check?indicator=1.1.1.1 \
  -H "X-API-Key: abcdef1234567890abcdef1234567890abcdef12"
```

### MCP Client Config

**Claude Desktop** (`~/.config/claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "dfir-threatintel": {
      "url": "https://pranithjain.qzz.io/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "dfir-threatintel": {
      "url": "https://pranithjain.qzz.io/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

## Manage API Keys

### List keys

```bash
curl https://pranithjain.qzz.io/api/v1/admin/keys \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN"
```

### Revoke a key

```bash
curl -X DELETE https://pranithjain.qzz.io/api/v1/admin/keys/KEY_ID \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN"
```

Or use the admin dashboard at `/admin` → API Keys → Revoke.

## Roles

| Role       | Permissions                             |
| ---------- | --------------------------------------- |
| `readonly` | Read access to all public API endpoints |
| `admin`    | Full access including admin endpoints   |

## Error Responses

| Status | Meaning                                |
| ------ | -------------------------------------- |
| `401`  | Missing or invalid API key             |
| `403`  | Valid key but insufficient permissions |
| `429`  | Rate limit exceeded                    |

## Security Notes

- Keys are 40-character hex strings (160 bits of entropy)
- Only the first 8 characters (prefix) are stored for identification
- Keys are SHA-256 hashed before storage
- The raw key is shown once on creation — store it securely
- Revoked keys are immediately invalidated
- Last-used timestamps are tracked for auditing
