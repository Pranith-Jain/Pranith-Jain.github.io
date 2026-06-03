import type { Context } from 'hono';
import type { Env } from '../env';
import { stealerParserJsonSchema, rawLogTextSchema } from '../lib/validation-schemas';
import { validationError } from '../lib/api-error';
import { pinnedFetchFollow, SsrfError } from '../lib/ssrf-guard';

/**
 * Infostealer Log Parser — extract credentials and IOCs from stealer logs.
 *
 * Parses logs from common infostealers:
 *   - RedLine
 *   - Raccoon
 *   - Vidar
 *   - Lumma
 *   - Stealc
 *   - Mystic
 *
 * Extracts:
 *   - Stolen credentials (username:password)
 *   - Compromised domains
 *   - Session cookies
 *   - Crypto wallet addresses
 *   - System fingerprints (HWID, IP, OS)
 *   - Installed software
 *
 * POST /api/v1/stealer/parse
 *   body: { text: "raw log content" } or { url: "https://..." }
 *
 * Security: Only processes text, never stores credentials.
 */

const MAX_TEXT_LENGTH = 500_000; // 500KB max

// Regex patterns for extraction
const CRED_PATTERNS = [
  // Common format: URL → username:password
  /(?:https?:\/\/)?([^\s:/]+(?:\.[^\s:/]+)+)\s*(?:→|->|:|\|)\s*([^\s:]+):([^\s]+)/gm,
  // Login format: login:password @ domain
  /([^\s:@]+):([^\s:@]+)\s*@\s*([^\s:@]+\.[^\s:@]+)/gm,
];

const CRYPTO_WALLETS = {
  bitcoin: /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g,
  ethereum: /\b0x[a-fA-F0-9]{40}\b/g,
  monero: /\b4[0-9AB][1-9A-HJ-NP-Za-km-z]{93}\b/g,
  litecoin: /\b[LM][a-km-zA-HJ-NP-Z1-9]{26,33}\b/g,
  dashcoin: /\bX[a-km-zA-HJ-NP-Z1-9]{33}\b/g,
  ripple: /\br[a-km-zA-HJ-NP-Z1-9]{24,34}\b/g,
  tron: /\bT[a-zA-Z0-9]{33}\b/g,
};

const IP_PATTERN = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const DOMAIN_PATTERN = /\b(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\b/g;
const EMAIL_PATTERN = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;

interface StealerParseResult {
  parse_id: string;
  input_length: number;
  detected_stealer: string | null;
  credentials: Array<{
    domain: string;
    username: string;
    password_length: number; // Never expose actual password
    source: string;
  }>;
  emails: string[];
  domains: string[];
  ips: string[];
  crypto_wallets: Array<{
    currency: string;
    address: string;
  }>;
  cookies: Array<{
    domain: string;
    name: string;
    value_length: number;
  }>;
  system_info: {
    hostname?: string;
    username?: string;
    os?: string;
    hwid?: string;
    ip?: string;
    country?: string;
  };
  installed_software: string[];
  stats: {
    total_credentials: number;
    unique_domains: number;
    unique_emails: number;
    crypto_wallets: number;
  };
  meta: {
    parsed_at: string;
    warnings: string[];
  };
}

/** Detect which stealer generated the log based on patterns */
function detectStealer(text: string): string | null {
  const lower = text.toLowerCase();

  if (lower.includes('redline') || (lower.includes('system_info') && lower.includes('scantime'))) return 'RedLine';
  if (lower.includes('raccoon') || lower.includes('rec0n')) return 'Raccoon';
  if (lower.includes('vidar') || lower.includes('vidarclient')) return 'Vidar';
  if (lower.includes('lumma') || lower.includes('lummastealer')) return 'Lumma';
  if (lower.includes('stealc') || lower.includes('stealcpanel')) return 'Stealc';
  if (lower.includes('mystic') || lower.includes('mysticstealer')) return 'Mystic';
  if (lower.includes('azorult') || lower.includes('azorultpanel')) return 'AzorUlt';
  if (lower.includes('mars') || lower.includes('marsstealer')) return 'Mars';
  if (lower.includes('meta') && lower.includes('stealer')) return 'MetaStealer';

  return null;
}

/** Parse RedLine-style logs */
function parseRedLineFormat(text: string): Partial<StealerParseResult> {
  const credentials: StealerParseResult['credentials'] = [];
  const systemInfo: StealerParseResult['system_info'] = {};

  // RedLine format: URL\r\nLogin: value\r\nPassword: value
  const blocks = text.split(/(?=URL\s*:)/i);

  for (const block of blocks) {
    const urlMatch = block.match(/URL\s*:\s*(.+)/i);
    const loginMatch = block.match(/Login\s*:\s*(.+)/i);
    const passMatch = block.match(/Password\s*:\s*(.+)/i);

    if (urlMatch?.[1] && loginMatch?.[1]) {
      const domain =
        urlMatch[1]
          .trim()
          .replace(/^https?:\/\//, '')
          .split('/')[0] ?? 'unknown';
      credentials.push({
        domain,
        username: loginMatch[1].trim(),
        password_length: passMatch?.[1]?.trim().length ?? 0,
        source: 'RedLine',
      });
    }
  }

  // System info patterns
  const hwidMatch = text.match(/HWID\s*:\s*(.+)/i);
  const ipMatch = text.match(/IP\s*:\s*(.+)/i);
  const osMatch = text.match(/OS\s*:\s*(.+)/i);
  const userMatch = text.match(/User\s*:\s*(.+)/i);
  const hostMatch = text.match(/Computer\s*:\s*(.+)/i);

  if (hwidMatch?.[1]) systemInfo.hwid = hwidMatch[1].trim();
  if (ipMatch?.[1]) systemInfo.ip = ipMatch[1].trim();
  if (osMatch?.[1]) systemInfo.os = osMatch[1].trim();
  if (userMatch?.[1]) systemInfo.username = userMatch[1].trim();
  if (hostMatch?.[1]) systemInfo.hostname = hostMatch[1].trim();

  return { credentials, system_info: systemInfo };
}

export async function stealerParserHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    let text: string | undefined;

    const contentType = c.req.header('content-type') ?? '';

    if (contentType.includes('application/json')) {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'invalid JSON' }, 400);
      }
      const parsed = stealerParserJsonSchema.safeParse(body);
      if (!parsed.success) {
        const fields: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const path = issue.path.join('.') || 'body';
          if (!fields[path]) fields[path] = issue.message;
        }
        return validationError(c, fields);
      }
      text = parsed.data.text;

      if (!text && parsed.data.url) {
        try {
          // SSRF-safe: validates + pins the host and re-validates every redirect
          // hop, blocking private/loopback/link-local/cloud-metadata targets.
          const res = await pinnedFetchFollow(parsed.data.url, {
            signal: AbortSignal.timeout(15000),
            headers: { 'User-Agent': 'threat-intel-parser/1.0' },
          });
          if (res.ok) text = await res.text();
          else await res.body?.cancel().catch(() => {});
        } catch (e) {
          if (e instanceof SsrfError) {
            return c.json({ error: 'blocked', message: e.detail }, 400);
          }
          return c.json({ error: 'Failed to fetch URL' }, 400);
        }
      }
    } else if (contentType.includes('text/plain')) {
      const raw = await c.req.text();
      const parsed = rawLogTextSchema.safeParse(raw);
      if (!parsed.success) {
        const fields: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const path = issue.path.join('.') || 'body';
          if (!fields[path]) fields[path] = issue.message;
        }
        return validationError(c, fields);
      }
      text = parsed.data;
    }

    if (!text) {
      return c.json({ error: 'No text provided' }, 400);
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return c.json({ error: `Text too long (max ${MAX_TEXT_LENGTH} chars)` }, 400);
    }

    const warnings: string[] = [];

    // Detect stealer type
    const stealer = detectStealer(text);

    // Parse credentials based on format
    const parsed = stealer === 'RedLine' ? parseRedLineFormat(text) : { credentials: [], system_info: {} };

    // Generic credential extraction
    const genericCreds: StealerParseResult['credentials'] = [];
    for (const pattern of CRED_PATTERNS) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const domain = match[1] ?? match[3];
        const username = match[2] ?? match[1];
        const password = match[3] ?? match[2];

        if (domain && username && password) {
          genericCreds.push({
            domain: domain.replace(/^https?:\/\//, ''),
            username,
            password_length: password.length,
            source: 'generic',
          });
        }
      }
    }

    // Merge credentials (dedup by domain+username)
    const allCreds = [...(parsed.credentials ?? []), ...genericCreds];
    const uniqueCreds = allCreds.filter(
      (cred, i, arr) => arr.findIndex((c) => c.domain === cred.domain && c.username === cred.username) === i
    );

    // Extract emails
    const emails = [
      ...new Set(
        (text.match(EMAIL_PATTERN) ?? []).filter((e) => {
          const domain = e.split('@')[1];
          return domain && !['example.com', 'test.com', 'localhost'].includes(domain);
        })
      ),
    ];

    // Extract domains
    const domains = [
      ...new Set(
        (text.match(DOMAIN_PATTERN) ?? []).filter((d) => {
          return d.length > 4 && !d.endsWith('.exe') && !d.endsWith('.dll') && !d.endsWith('.tmp');
        })
      ),
    ].slice(0, 100);

    // Extract IPs
    const ips = [
      ...new Set(
        (text.match(IP_PATTERN) ?? []).filter((ip) => {
          return !ip.startsWith('127.') && !ip.startsWith('0.') && !ip.startsWith('255.');
        })
      ),
    ].slice(0, 50);

    // Extract crypto wallets
    const crypto_wallets: StealerParseResult['crypto_wallets'] = [];
    for (const [currency, pattern] of Object.entries(CRYPTO_WALLETS)) {
      const matches = text.match(pattern) ?? [];
      for (const address of matches.slice(0, 10)) {
        crypto_wallets.push({ currency, address });
      }
    }

    // Extract installed software (common patterns)
    const softwarePatterns = [
      /(?:Chrome|Firefox|Edge|Opera|Brave|Vivaldi)\s*(?:Browser)?/gi,
      /(?:Telegram|Discord|Signal|WhatsApp|Skype)/gi,
      /(?:MetaMask|Exodus|Electrum|Atomic|Trust Wallet)/gi,
      /(?:FileZilla|WinSCP|PuTTY|TeamViewer|AnyDesk)/gi,
      /(?:Steam|Epic Games|Battle\.net)/gi,
    ];
    const installed_software: string[] = [];
    for (const pattern of softwarePatterns) {
      const matches = text.match(pattern) ?? [];
      installed_software.push(...matches.map((m) => m.trim()));
    }

    const result: StealerParseResult = {
      parse_id: crypto.randomUUID(),
      input_length: text.length,
      detected_stealer: stealer,
      credentials: uniqueCreds.slice(0, 100),
      emails: emails.slice(0, 50),
      domains: domains.slice(0, 100),
      ips: ips.slice(0, 50),
      crypto_wallets: crypto_wallets.slice(0, 20),
      cookies: [], // Would need more complex parsing
      system_info: parsed.system_info ?? {},
      installed_software: [...new Set(installed_software)].slice(0, 20),
      stats: {
        total_credentials: uniqueCreds.length,
        unique_domains: new Set(uniqueCreds.map((c) => c.domain)).size,
        unique_emails: emails.length,
        crypto_wallets: crypto_wallets.length,
      },
      meta: {
        parsed_at: new Date().toISOString(),
        warnings,
      },
    };

    return c.json(result, 200, { 'Cache-Control': 'no-store' });
  } catch (err) {
    return c.json({ error: 'Parsing failed', details: err instanceof Error ? err.message : String(err) }, 500);
  }
}
