/**
 * Open Directory Intelligence Scanner
 *
 * Scans HTTP(S) servers for exposed open directories (Apache/nginx autoindex,
 * Python SimpleHTTPServer, etc.) and catalogs the files found inside them.
 *
 * Common CTI use case: attackers staging malware, configs, and exfiltrated
 * data on compromised servers with directory listing enabled. This scanner
 * identifies those open directories and extracts file metadata for analysis.
 *
 * Inspired by etugen.io's "trashpile" open-directory intel feature.
 *
 * Routes:
 *   POST /api/v1/open-dir/scan     — Scan a URL for open directory listing
 *   GET  /api/v1/open-dir/search   — Search previously scanned directories
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { pinnedFetchFollow, SsrfError } from '../lib/ssrf-guard';
import { badRequest, internalError } from '../lib/api-error';
import { z } from 'zod';

// ── Types ────────────────────────────────────────────────────────

interface DirEntry {
  name: string;
  /** 'file' | 'directory' | 'unknown' */
  type: 'file' | 'directory' | 'unknown';
  /** File size in bytes (null if unknown). */
  size: number | null;
  /** Last modified date if available. */
  lastModified: string | null;
  /** File extension (lowercase, without dot). */
  extension: string | null;
  /** Risk classification based on file type. */
  risk: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** Human-readable risk description. */
  riskReason?: string;
}

interface ScanResult {
  url: string;
  isOpen: boolean;
  /** Whether the page appears to be an auto-generated directory listing. */
  isDirectoryListing: boolean;
  server: string | null;
  entries: DirEntry[];
  totalFiles: number;
  totalDirectories: number;
  totalSize: number;
  /** High-risk file indicators found. */
  indicators: string[];
  scanTimeMs: number;
  scannedAt: string;
}

// ── File Risk Classification ─────────────────────────────────────

const HIGH_RISK_EXTENSIONS: Record<string, { risk: DirEntry['risk']; reason: string }> = {
  // Executables & scripts
  exe: { risk: 'critical', reason: 'Windows executable' },
  dll: { risk: 'critical', reason: 'Windows DLL' },
  msi: { risk: 'critical', reason: 'Windows installer' },
  bat: { risk: 'critical', reason: 'Windows batch script' },
  cmd: { risk: 'critical', reason: 'Windows command script' },
  ps1: { risk: 'critical', reason: 'PowerShell script' },
  vbs: { risk: 'critical', reason: 'VBScript' },
  js: { risk: 'high', reason: 'JavaScript file' },
  jar: { risk: 'critical', reason: 'Java archive' },
  sh: { risk: 'high', reason: 'Shell script' },
  py: { risk: 'high', reason: 'Python script' },
  rb: { risk: 'high', reason: 'Ruby script' },
  pl: { risk: 'high', reason: 'Perl script' },
  elf: { risk: 'critical', reason: 'Linux executable' },
  apk: { risk: 'critical', reason: 'Android package' },
  dmg: { risk: 'high', reason: 'macOS disk image' },
  deb: { risk: 'high', reason: 'Debian package' },
  rpm: { risk: 'high', reason: 'RPM package' },

  // Archives (may contain malware)
  zip: { risk: 'medium', reason: 'ZIP archive' },
  rar: { risk: 'medium', reason: 'RAR archive' },
  '7z': { risk: 'medium', reason: '7-Zip archive' },
  tar: { risk: 'medium', reason: 'TAR archive' },
  gz: { risk: 'medium', reason: 'Gzip archive' },

  // Config & credentials
  env: { risk: 'critical', reason: 'Environment variables file' },
  key: { risk: 'critical', reason: 'Private key file' },
  pem: { risk: 'critical', reason: 'PEM certificate/key' },
  p12: { risk: 'critical', reason: 'PKCS#12 certificate' },
  pfx: { risk: 'critical', reason: 'PKCS#12 certificate' },
  crt: { risk: 'high', reason: 'Certificate file' },
  cer: { risk: 'high', reason: 'Certificate file' },
  keystore: { risk: 'critical', reason: 'Java keystore' },
  jks: { risk: 'critical', reason: 'Java keystore' },
  json: { risk: 'medium', reason: 'JSON data file' },
  yaml: { risk: 'medium', reason: 'YAML config file' },
  yml: { risk: 'medium', reason: 'YAML config file' },
  xml: { risk: 'medium', reason: 'XML data file' },
  conf: { risk: 'high', reason: 'Configuration file' },
  cfg: { risk: 'high', reason: 'Configuration file' },
  ini: { risk: 'high', reason: 'Configuration file' },
  config: { risk: 'high', reason: 'Configuration file' },

  // Data & databases
  sql: { risk: 'high', reason: 'SQL dump' },
  db: { risk: 'high', reason: 'Database file' },
  sqlite: { risk: 'high', reason: 'SQLite database' },
  sqlite3: { risk: 'high', reason: 'SQLite database' },
  mdb: { risk: 'high', reason: 'Access database' },
  csv: { risk: 'medium', reason: 'CSV data file' },
  xlsx: { risk: 'medium', reason: 'Excel spreadsheet' },

  // Logs & dumps
  log: { risk: 'medium', reason: 'Log file' },
  dump: { risk: 'high', reason: 'Memory/core dump' },
  pcap: { risk: 'high', reason: 'Packet capture' },
  pcapng: { risk: 'high', reason: 'Packet capture' },

  // Documents (may contain macros)
  doc: { risk: 'medium', reason: 'Word document (may contain macros)' },
  docm: { risk: 'high', reason: 'Word document with macros' },
  xls: { risk: 'medium', reason: 'Excel spreadsheet' },
  xlsm: { risk: 'high', reason: 'Excel spreadsheet with macros' },
  pptm: { risk: 'high', reason: 'PowerPoint with macros' },
  pdf: { risk: 'medium', reason: 'PDF document' },

  // Web shells & malware indicators
  php: { risk: 'high', reason: 'PHP script' },
  asp: { risk: 'high', reason: 'ASP script' },
  aspx: { risk: 'high', reason: 'ASP.NET script' },
  jsp: { risk: 'high', reason: 'JSP script' },
  cgi: { risk: 'high', reason: 'CGI script' },
};

/** Suspicious file names that indicate malware staging or data exfiltration. */
const SUSPICIOUS_NAMES: Array<{ pattern: RegExp; risk: DirEntry['risk']; reason: string }> = [
  { pattern: /^(dump|leak|combo|list|creds?|password|passwd)/i, risk: 'critical', reason: 'Credential/leak file' },
  { pattern: /\.(bak|backup|old|orig|copy)$/i, risk: 'high', reason: 'Backup file' },
  { pattern: /config\.(php|asp|xml|json|yaml)/i, risk: 'critical', reason: 'Application config file' },
  { pattern: /\.htpasswd$/i, risk: 'critical', reason: 'Apache htpasswd file' },
  { pattern: /\.htaccess$/i, risk: 'high', reason: 'Apache access control' },
  { pattern: /web\.config$/i, risk: 'critical', reason: 'IIS web config' },
  { pattern: /wp-config\.php$/i, risk: 'critical', reason: 'WordPress config (DB credentials)' },
  { pattern: /\.git(\/|\.zip)/i, risk: 'critical', reason: 'Git repository exposed' },
  { pattern: /\.env(\.|$)/i, risk: 'critical', reason: 'Environment file' },
  { pattern: /id_rsa|id_ed25519|id_ecdsa/i, risk: 'critical', reason: 'SSH private key' },
  { pattern: /shadow|passwd$/i, risk: 'critical', reason: 'System credential file' },
  { pattern: /\.(rar|zip|7z).*(dump|leak|combo|backup)/i, risk: 'critical', reason: 'Archive with sensitive name' },
];

// ── Directory Listing Parser ─────────────────────────────────────

/**
 * Parse an HTML page for directory listing entries.
 * Supports Apache autoindex, nginx autoindex, Python SimpleHTTPServer,
 * and generic <a href="..."> link extraction.
 */
function parseDirectoryListing(html: string, _baseUrl: string): DirEntry[] {
  const entries: DirEntry[] = [];
  const seenNames = new Set<string>();

  // Apache autoindex pattern: <a href="name">name</a> ... date ... size
  // Also handles nginx autoindex and Python SimpleHTTPServer
  const linkPattern = /<a\s+href="([^"]+)"/gi;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1];
    if (
      !href ||
      href === '../' ||
      href === '/' ||
      href.startsWith('?') ||
      href.startsWith('#') ||
      href.startsWith('mailto:') ||
      href.startsWith('javascript:')
    )
      continue;

    // Decode URL-encoded names
    let name: string;
    try {
      name = decodeURIComponent(href);
    } catch {
      name = href;
    }

    // Skip duplicates
    const normalizedName = name.replace(/\/$/, '');
    if (seenNames.has(normalizedName)) continue;
    seenNames.add(normalizedName);

    const isDir = href.endsWith('/');
    const ext = isDir ? null : (normalizedName.split('.').pop()?.toLowerCase() ?? null);

    // Try to extract size from nearby text
    let size: number | null = null;
    const sizeMatch = new RegExp(
      `${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^]*?(\\d+(?:\\.\\d+)?)\\s*(bytes?|KB|MB|GB|TB)`,
      'i'
    ).exec(html);
    if (sizeMatch) {
      const num = parseFloat(sizeMatch[1]!);
      const unit = sizeMatch[2]?.toLowerCase();
      if (unit === 'kb') size = Math.round(num * 1024);
      else if (unit === 'mb') size = Math.round(num * 1024 * 1024);
      else if (unit === 'gb') size = Math.round(num * 1024 * 1024 * 1024);
      else size = Math.round(num);
    }

    // Classify risk
    let risk: DirEntry['risk'] = 'info';
    let riskReason: string | undefined;

    if (ext && HIGH_RISK_EXTENSIONS[ext]) {
      risk = HIGH_RISK_EXTENSIONS[ext].risk;
      riskReason = HIGH_RISK_EXTENSIONS[ext].reason;
    }

    for (const s of SUSPICIOUS_NAMES) {
      if (s.pattern.test(normalizedName)) {
        if (riskPriority(s.risk) > riskPriority(risk)) {
          risk = s.risk;
          riskReason = s.reason;
        }
      }
    }

    entries.push({
      name: normalizedName,
      type: isDir ? 'directory' : 'file',
      size,
      lastModified: null,
      extension: ext,
      risk,
      riskReason,
    });
  }

  // Sort: directories first, then by risk (highest first), then alphabetically
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    const riskDiff = riskPriority(b.risk) - riskPriority(a.risk);
    if (riskDiff !== 0) return riskDiff;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

function riskPriority(risk: DirEntry['risk']): number {
  switch (risk) {
    case 'critical':
      return 5;
    case 'high':
      return 4;
    case 'medium':
      return 3;
    case 'low':
      return 2;
    case 'info':
      return 1;
    default:
      return 0;
  }
}

function isDirectoryListingPage(html: string): boolean {
  const indicators = [
    /Index of \//i,
    /<title>Index of/i,
    /Directory listing for/i,
    /Parent Directory/i,
    /\[DIR\]/i,
    /autoindex/i,
    /nginx.*autoindex/i,
    /Apache.*mod_autoindex/i,
  ];
  return indicators.some((re) => re.test(html));
}

// ── Scan Handler ─────────────────────────────────────────────────

const scanSchema = z.object({
  url: z
    .string()
    .url()
    .max(2048)
    .refine((s) => /^https?:\/\//i.test(s), 'URL must start with http:// or https://'),
  /** Max files to return (default 200). */
  limit: z.number().int().min(1).max(1000).optional().default(200),
});

export async function openDirectoryScanHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = scanSchema.safeParse(body);
  if (!parsed.success) return badRequest(c, parsed.error.issues.map((i) => i.message).join('; '));

  const { url, limit } = parsed.data;
  const start = Date.now();

  try {
    // pinnedFetchFollow re-validates + re-pins EVERY redirect hop, so a public
    // first URL that 302s to a private/loopback/link-local/cloud-metadata
    // target is blocked (the old pinnedFetch + redirect:'follow' did not).
    const res = await pinnedFetchFollow(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DFIR-OpenDir/1.0; +https://pranithjain.qzz.io)',
        Accept: 'text/html,application/xhtml+xml,*/*',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      // Consume response body to free the connection.
      await res.body?.cancel().catch(() => {});
      return c.json({
        url,
        isOpen: false,
        isDirectoryListing: false,
        error: `HTTP ${res.status}`,
        scanTimeMs: Date.now() - start,
        scannedAt: new Date().toISOString(),
      });
    }

    const contentType = res.headers.get('content-type') ?? '';
    const server = res.headers.get('server');

    // Only parse HTML responses
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      await res.body?.cancel().catch(() => {});
      return c.json({
        url,
        isOpen: false,
        isDirectoryListing: false,
        server,
        entries: [],
        totalFiles: 0,
        totalDirectories: 0,
        totalSize: 0,
        indicators: ['Response is not HTML — not a directory listing'],
        scanTimeMs: Date.now() - start,
        scannedAt: new Date().toISOString(),
      });
    }

    const html = await res.text();
    const isListing = isDirectoryListingPage(html);
    const entries = parseDirectoryListing(html, url).slice(0, limit);

    const totalFiles = entries.filter((e) => e.type === 'file').length;
    const totalDirectories = entries.filter((e) => e.type === 'directory').length;
    const totalSize = entries.reduce((sum, e) => sum + (e.size ?? 0), 0);

    // Collect indicators
    const indicators: string[] = [];
    const criticalFiles = entries.filter((e) => e.risk === 'critical');
    const highFiles = entries.filter((e) => e.risk === 'high');

    if (criticalFiles.length > 0) {
      indicators.push(`${criticalFiles.length} critical-risk files found`);
      for (const f of criticalFiles.slice(0, 5)) {
        indicators.push(`  • ${f.name} — ${f.riskReason}`);
      }
    }
    if (highFiles.length > 0) {
      indicators.push(`${highFiles.length} high-risk files found`);
    }
    if (server) {
      indicators.push(`Server: ${server}`);
    }

    const result: ScanResult = {
      url,
      isOpen: true,
      isDirectoryListing: isListing,
      server,
      entries,
      totalFiles,
      totalDirectories,
      totalSize,
      indicators,
      scanTimeMs: Date.now() - start,
      scannedAt: new Date().toISOString(),
    };

    return c.json(result, 200, { 'Cache-Control': 'public, max-age=300' });
  } catch (e) {
    if (e instanceof SsrfError) {
      return c.json({ error: 'blocked', message: e.detail, blockedIp: e.blockedIp }, e.status as 400 | 403 | 502 | 503);
    }
    return internalError(c, e);
  }
}
