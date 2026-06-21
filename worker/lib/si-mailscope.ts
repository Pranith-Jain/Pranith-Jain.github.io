/* eslint-disable no-useless-escape, @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
/**
 * MAILSCOPE — Email header parser.
 *
 * Edge-native parser replicated from
 * https://h3ad-sec.github.io/MAILSCOPE/ — parses raw email headers,
 * extracts the hop chain, computes SPF / DKIM / DMARC verdicts
 * (when Authentication-Results is present), flags spoofing /
 * impersonation patterns, and returns a structured verdict.
 *
 * No external API calls — pure parser + heuristic verdicts. Pairs
 * with the platform's DmarcAnalyzer.tsx (which handles DNS lookups
 * for live domain checks) for full coverage.
 *
 * Exposed as:
 *   - MCP tool `si_parse_email_headers`  (Worker)
 *   - REST  `POST /api/v1/si/mailscope`  (api)
 *
 * Returns:
 *   {
 *     summary: { from, to, subject, date, messageId, returnPath },
 *     hops: [
 *       { idx, delay, from, ip, protocol, tls, auth, rdns, tld, isInternal,
 *         flags: [...] }
 *     ],
 *     auth: {
 *       spf:  { result: 'pass'|'fail'|'softfail'|'none'|'neutral'|'permerror'|'temperror', domain, ip, comment },
 *       dkim: { result: 'pass'|'fail'|'none'|'neutral'|'permerror'|'temperror', domain, selector, comment },
 *       dmarc:{ result: 'pass'|'fail'|'none'|'neutral'|'permerror'|'temperror', domain, policy, pct, comment },
 *       comp: { result, comment },  // compauth
 *     },
 *     flags: [
 *       { severity: 'high'|'medium'|'low'|'info', code: 'spoofed_from', message, evidence: {header, value} }
 *     ],
 *     riskScore: 0..100,
 *   }
 */

export interface MailScopeOptions {
  /** Cap header size in chars (defensive: avoid 10MB strings). Default: 1MB. */
  maxChars?: number;
}

export interface MailScopeResult {
  summary: {
    from?: string;
    to?: string;
    subject?: string;
    date?: string;
    messageId?: string;
    returnPath?: string;
    replyTo?: string;
    receivedCount: number;
  };
  hops: HopInfo[];
  auth: AuthResults;
  flags: Flag[];
  riskScore: number;
}

export interface HopInfo {
  /** 1-based hop number — 1 is the most recent (top of Received: chain). */
  idx: number;
  /** ms of delay between this hop and the previous (null for the first). */
  delay: number | null;
  /** Raw "from" hostname / IP claimed by the hop. */
  from: string;
  /** Extracted IPv4 (or null if IPv6 / not present). */
  ip: string | null;
  /** "smtp" / "esmtp" / "http" / unknown. */
  protocol: string;
  /** TLS version string from "with HTTP/1.1 over TLS" or "(using TLSv1.3)". */
  tls: string | null;
  /** Authentication-Results fragment attached to this hop, if any. */
  auth: string | null;
  /** Reverse-DNS resolved name if present in header. */
  rDNS: string | null;
  /** TLD of rDNS, e.g. ".com", ".ru". */
  tld: string | null;
  /** RFC 1918 / loopback / link-local? */
  isInternal: boolean;
  /** Raw header value for this hop. */
  raw: string;
}

export interface AuthResult {
  result: 'pass' | 'fail' | 'softfail' | 'none' | 'neutral' | 'permerror' | 'temperror' | 'unknown';
  domain?: string;
  ip?: string;
  selector?: string;
  policy?: string;
  pct?: number;
  comment?: string;
}

export interface AuthResults {
  spf: AuthResult;
  dkim: AuthResult;
  dmarc: AuthResult;
  comp: AuthResult;
  /** Raw Authentication-Results header value (header body, no leading name). */
  raw: string | null;
}

export interface Flag {
  severity: 'high' | 'medium' | 'low' | 'info';
  code: string;
  message: string;
  evidence?: { header: string; value: string };
}

// ---------------------------------------------------------------------------
// Header parsing — RFC 5322 unfolded.
// ---------------------------------------------------------------------------

interface RawHeader {
  name: string;
  value: string;
  raw: string;
}

function unfoldHeaders(raw: string): RawHeader[] {
  // Normalise CRLF → LF, then split on header boundaries.
  const text = raw.replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const out: RawHeader[] = [];
  let cur: RawHeader | null = null;
  for (const line of lines) {
    if (line === '' || line === '\r') {
      if (cur) {
        out.push(cur);
        cur = null;
      }
      continue;
    }
    if (/^[ \t]/.test(line) && cur) {
      // Continuation — fold into the previous header value.
      cur.value += ' ' + line.trim();
      cur.raw += '\n' + line;
      continue;
    }
    if (cur) out.push(cur);
    const m = line.match(/^([!-9;-~]+):\s*(.*)$/);
    if (!m || !m[1] || m[2] === undefined) {
      // Malformed — treat as a continuation of a synthetic header.
      if (cur) {
        cur.value += ' ' + line;
        cur.raw += '\n' + line;
      }
      continue;
    }
    cur = { name: m[1], value: m[2], raw: line };
  }
  if (cur) out.push(cur);
  return out;
}

function header(headers: RawHeader[], name: string): string | undefined {
  const lc = name.toLowerCase();
  for (const h of headers) {
    if (h.name.toLowerCase() === lc) return h.value;
  }
  return undefined;
}

function headerAll(headers: RawHeader[], name: string): string[] {
  const lc = name.toLowerCase();
  return headers.filter((h) => h.name.toLowerCase() === lc).map((h) => h.value);
}

// ---------------------------------------------------------------------------
// Address parsing — minimal: extract <addr@host> or bare addr@host, plus
// the display name. Strips RFC 2047 encoded-word =?charset?Q?...?= later.
// ---------------------------------------------------------------------------

interface Addr {
  name?: string;
  address: string;
  raw: string;
}

function parseAddressList(s: string | undefined): Addr[] {
  if (!s) return [];
  // Split on commas not inside quotes.
  const out: Addr[] = [];
  let depth = 0;
  let buf = '';
  let inQ = false;
  for (const ch of s) {
    if (ch === '"') {
      inQ = !inQ;
      buf += ch;
      continue;
    }
    if (!inQ && ch === '(') {
      depth++;
      buf += ch;
      continue;
    }
    if (!inQ && ch === ')') {
      depth--;
      buf += ch;
      continue;
    }
    if (!inQ && depth === 0 && ch === ',') {
      const a = parseOneAddress(buf.trim());
      if (a) out.push(a);
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) {
    const a = parseOneAddress(buf.trim());
    if (a) out.push(a);
  }
  return out;
}

function parseOneAddress(s: string): Addr | null {
  if (!s) return null;
  // <addr@host> form
  const angle = s.match(/^(.*?)<([^>]+)>\s*$/);
  if (angle && angle[1] !== undefined && angle[2] !== undefined) {
    const addr = angle[2].trim();
    const name = angle[1].trim().replace(/^"|"$/g, '') || undefined;
    if (addr.includes('@')) return { name, address: addr, raw: s };
    return null;
  }
  // bare addr@host
  if (s.includes('@') && !/[\s,<>]/.test(s)) return { address: s, raw: s };
  return null;
}

// ---------------------------------------------------------------------------
// Received: hop parsing.
// ---------------------------------------------------------------------------

function parseReceived(value: string, raw: string, idx: number, prevDate: Date | null): HopInfo {
  // Common fields in Received headers:
  //   from HELO (HELO=example.com [1.2.3.4])
  //         by mx.example.com (Postfix) with ESMTPS id ABCDEF
  //         for <user@example.com>; Mon, 12 Aug 2024 10:11:12 +0000 (UTC)
  const fromMatch = value.match(/\bfrom\s+(.+?)(?:\s+\(|\s+by\s+|\s+with\s+|\s+for\s+|;|$)/i);
  const byMatch = value.match(/\bby\s+([^\s(]+(?:\s+[^\s(]+)*?)(?:\s+\(|\s+with\s+|\s+for\s+|;|$)/i);
  const withMatch = value.match(/\bwith\s+((?:E?SMTP[AS]?|HTTP|LMT[A]?|UTF8[A]?|SMTP|local)(?:\+?[A-Z]+)?)/i);
  const idMatch = value.match(/\bid\s+(\S+)/);
  const forMatch = value.match(/\bfor\s+<([^>]+)>/i);
  const dateMatch = value.match(/;\s*(.+)$/);
  // IP extraction
  const ipMatch = value.match(/\[((?:\d{1,3}\.){3}\d{1,3}|[0-9a-fA-F:]+)\]/);

  const dateRaw = dateMatch?.[1]?.trim();
  const date = dateRaw ? new Date(dateRaw) : null;
  const validDate = date && !Number.isNaN(date.getTime()) ? date : null;
  const delay = validDate && prevDate ? prevDate.getTime() - validDate.getTime() : null;

  // TLS info — look for "using TLSvX.Y" or "over TLS"
  let tls: string | null = null;
  const tlsMatch = value.match(/using\s+(TLSv?\d+(?:\.\d+)?)/i) || value.match(/over\s+(TLS\S*)/i);
  if (tlsMatch && tlsMatch[1]) tls = tlsMatch[1];

  // Auth results on this hop
  let auth: string | null = null;
  const authMatch = value.match(/Authentication-Results:\s*([^;]+)/i);
  if (authMatch && authMatch[1]) auth = authMatch[1].trim();

  // rDNS / TLD
  const rDNS = fromMatch && fromMatch[1] ? (fromMatch[1].trim().split(/\s+/)[0] ?? null) : null;
  let tld: string | null = null;
  if (rDNS && rDNS.includes('.')) {
    const lastDot = rDNS.lastIndexOf('.');
    tld = rDNS.slice(lastDot);
  }
  const ip = ipMatch && ipMatch[1] ? ipMatch[1] : null;
  const isInternal = ip ? isInternalIp(ip) : false;

  return {
    idx,
    delay: delay && delay >= 0 ? delay : null,
    from: rDNS ?? (ip ? `[${ip}]` : '?'),
    ip,
    protocol: withMatch?.[1] ?? 'unknown',
    tls,
    auth,
    rDNS,
    tld,
    isInternal,
    raw,
  };
}

function isInternalIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1') return true;
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Authentication-Results header parsing (RFC 7601).
// ---------------------------------------------------------------------------

function parseAuthHeader(value: string): AuthResults {
  const empty: AuthResult = { result: 'unknown' };
  const out: AuthResults = {
    spf: { ...empty },
    dkim: { ...empty },
    dmarc: { ...empty },
    comp: { ...empty },
    raw: value,
  };
  // Method tokens: spf=..., dkim=..., dmarc=..., compauth=...
  for (const part of splitAuthMethods(value)) {
    const methodMatch = part.match(/^([a-z]+)=/i);
    if (!methodMatch) continue;
    const method = methodMatch[1]!.toLowerCase();
    const body = part.slice(methodMatch[0].length);
    const resultMatch = body.match(/^(\S+)/);
    const result = (resultMatch?.[1]?.toLowerCase() ?? 'unknown') as AuthResult['result'];
    const props = parseAuthProps(body);
    const rec: AuthResult = { result, ...props };
    if (method === 'spf') out.spf = rec;
    else if (method === 'dkim') out.dkim = rec;
    else if (method === 'dmarc') out.dmarc = rec;
    else if (method === 'compauth' || method === 'auth') out.comp = rec;
  }
  return out;
}

function splitAuthMethods(value: string): string[] {
  // Methods are separated by `;` but each method's `reason` can be a
  // quoted string with `;`. Use a quick state machine.
  const out: string[] = [];
  let buf = '';
  let inQ = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '"') {
      inQ = !inQ;
      buf += ch;
      continue;
    }
    if (!inQ && ch === ';') {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function parseAuthProps(body: string): Partial<AuthResult> {
  const props: Partial<AuthResult> = {};
  const smtp = body.match(/\bsmtp\.mailfrom=([^\s;]+)/i);
  if (smtp?.[1]) props.domain = smtp[1].replace(/[<>]/g, '').split('@').pop();
  const smtpMailfrom = body.match(/\bsmtp\.mailfrom=([^\s;]+)/i);
  if (smtpMailfrom?.[1]) {
    const v = smtpMailfrom[1].replace(/[<>]/g, '');
    if (v.includes('@')) props.domain = v.split('@').pop();
  }
  const dkimDomain = body.match(/\bheader\.d=([^\s;]+)/i);
  if (dkimDomain?.[1]) props.domain = dkimDomain[1].toLowerCase();
  const dkimSelector = body.match(/\bheader\.i=@([^\s;.]+)/i);
  if (dkimSelector?.[1]) props.selector = dkimSelector[1].toLowerCase();
  const policy = body.match(/\bp(?:olicy)?(?:\.(?:sp|disposition))?\s*=\s*([^\s;]+)/i);
  if (policy?.[1]) props.policy = policy[1].toLowerCase();
  const pct = body.match(/\bpct=(\d+)/i);
  if (pct) props.pct = Number(pct[1]);
  const ip = body.match(/\bsmtp\.remote-ip=([^\s;]+)/i);
  if (ip) props.ip = ip[1];
  const comment = body.match(/\bcomment=([^\s;]+)/i);
  if (comment?.[1]) props.comment = comment[1].replace(/^["']|["']$/g, '');
  return props;
}

// ---------------------------------------------------------------------------
// Risk flag heuristics.
// ---------------------------------------------------------------------------

const SUSPICIOUS_TLDS = ['.ru', '.cn', '.tk', '.ml', '.ga', '.cf', '.click', '.download', '.top'];
const FREE_MAIL = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com', 'protonmail.com', 'icloud.com'];

function buildFlags(headers: RawHeader[], auth: AuthResults, hops: HopInfo[]): Flag[] {
  const flags: Flag[] = [];
  const fromHdr = header(headers, 'From');
  const replyTo = header(headers, 'Reply-To');
  const returnPath = header(headers, 'Return-Path');
  const fromList = parseAddressList(fromHdr);
  const replyList = parseAddressList(replyTo);
  const rpList = parseAddressList(returnPath);

  if (fromList[0] && replyList[0] && fromList[0].address !== replyList[0].address) {
    flags.push({
      severity: 'medium',
      code: 'reply_to_mismatch',
      message: `Reply-To address (${replyList[0].address}) does not match From address (${fromList[0].address})`,
      evidence: { header: 'Reply-To', value: replyList[0].address },
    });
  }
  if (fromList[0] && rpList[0] && fromList[0].address !== rpList[0].address) {
    flags.push({
      severity: 'medium',
      code: 'return_path_mismatch',
      message: `Return-Path (${rpList[0].address}) does not match From (${fromList[0].address})`,
      evidence: { header: 'Return-Path', value: rpList[0].address },
    });
  }

  // Display-name says one domain, address is another — classic spoof.
  if (fromHdr) {
    const m = fromHdr.match(/^"?([^"<]*?)"?\s*<([^>]+)>/);
    if (m) {
      const display = m[1]!.trim();
      const address = m[2]!.trim();
      const addrDomain = address.split('@').pop()?.toLowerCase();
      const displayMatch = display.match(/@([\w.\-]+)/);
      if (displayMatch && addrDomain && displayMatch[1]!.toLowerCase() !== addrDomain) {
        flags.push({
          severity: 'high',
          code: 'spoofed_display_name',
          message: `Display name advertises @${displayMatch[1]} but address is @${addrDomain}`,
          evidence: { header: 'From', value: fromHdr },
        });
      }
    }
  }

  if (auth.spf.result && auth.spf.result !== 'pass' && auth.spf.result !== 'none' && auth.spf.result !== 'unknown') {
    flags.push({
      severity: auth.spf.result === 'fail' || auth.spf.result === 'softfail' ? 'high' : 'medium',
      code: 'spf_failed',
      message: `SPF result is ${auth.spf.result}${auth.spf.domain ? ` for ${auth.spf.domain}` : ''}`,
      evidence: { header: 'Authentication-Results', value: 'spf=' + auth.spf.result },
    });
  }
  if (
    auth.dkim.result &&
    auth.dkim.result !== 'pass' &&
    auth.dkim.result !== 'none' &&
    auth.dkim.result !== 'unknown'
  ) {
    flags.push({
      severity: auth.dkim.result === 'fail' ? 'high' : 'medium',
      code: 'dkim_failed',
      message: `DKIM result is ${auth.dkim.result}${auth.dkim.domain ? ` for ${auth.dkim.domain}` : ''}`,
      evidence: { header: 'Authentication-Results', value: 'dkim=' + auth.dkim.result },
    });
  }
  if (
    auth.dmarc.result &&
    auth.dmarc.result !== 'pass' &&
    auth.dmarc.result !== 'none' &&
    auth.dmarc.result !== 'unknown'
  ) {
    flags.push({
      severity: auth.dmarc.result === 'fail' ? 'high' : 'medium',
      code: 'dmarc_failed',
      message: `DMARC result is ${auth.dmarc.result}${auth.dmarc.policy ? ` (policy=${auth.dmarc.policy})` : ''}`,
      evidence: { header: 'Authentication-Results', value: 'dmarc=' + auth.dmarc.result },
    });
  }

  // TLD flags on the first external hop
  for (const hop of hops) {
    if (hop.tld && SUSPICIOUS_TLDS.includes(hop.tld.toLowerCase())) {
      flags.push({
        severity: 'medium',
        code: 'suspicious_tld',
        message: `Hop #${hop.idx} originates from suspicious TLD ${hop.tld}`,
        evidence: { header: 'Received', value: hop.from },
      });
    }
  }

  // Free-mail From with corporate-looking display name
  if (fromList[0]) {
    const domain = fromList[0].address.split('@').pop()?.toLowerCase();
    if (domain && FREE_MAIL.includes(domain) && fromHdr && /[A-Z][a-z]+\s+[A-Z][a-z]+/.test(fromHdr)) {
      flags.push({
        severity: 'low',
        code: 'freemail_display_name',
        message: `From uses free-mail provider (${domain}) with a personal-style display name`,
        evidence: { header: 'From', value: fromHdr },
      });
    }
  }

  // Hop chain anomalies
  if (hops.length >= 2) {
    const first = hops[hops.length - 1];
    const last = hops[0];
    if (first?.ip && last?.ip && first.ip === last.ip) {
      flags.push({
        severity: 'low',
        code: 'hop_ip_repeats',
        message: `Same IP (${first.ip}) appears at both ends of the Received chain`,
      });
    }
  }

  return flags;
}

function scoreFromFlags(flags: Flag[]): number {
  let s = 0;
  for (const f of flags) {
    if (f.severity === 'high') s += 35;
    else if (f.severity === 'medium') s += 18;
    else if (f.severity === 'low') s += 6;
    else s += 1;
  }
  return Math.min(100, s);
}

// ---------------------------------------------------------------------------
// Public entry point.
// ---------------------------------------------------------------------------

export function siParseEmailHeaders(input: string, opts: MailScopeOptions = {}): MailScopeResult {
  const maxChars = opts.maxChars ?? 1_000_000;
  if (!input) {
    return {
      summary: { receivedCount: 0 },
      hops: [],
      auth: {
        spf: { result: 'unknown' },
        dkim: { result: 'unknown' },
        dmarc: { result: 'unknown' },
        comp: { result: 'unknown' },
        raw: null,
      },
      flags: [],
      riskScore: 0,
    };
  }
  if (input.length > maxChars) {
    throw new Error(
      `Input exceeds maxChars=${maxChars} (got ${input.length}). Pass a smaller chunk or raise the limit.`
    );
  }
  // Allow callers to pass either just the headers (most common) or
  // a full RFC 822 message — we strip the body in the latter case.
  const bodySplit = input.replace(/\r\n/g, '\n').split(/\n\n/);
  const headerBlock = bodySplit[0] ?? input;
  const headers = unfoldHeaders(headerBlock);

  const from = header(headers, 'From');
  const to = header(headers, 'To');
  const subject = header(headers, 'Subject');
  const date = header(headers, 'Date');
  const messageId = header(headers, 'Message-ID');
  const returnPath = header(headers, 'Return-Path');
  const replyTo = header(headers, 'Reply-To');

  // Parse hop chain in REVERSE order — RFC 5321 says topmost is the
  // most recent (final) hop. We re-number to 1=most-recent for display.
  const receivedRaw = headerAll(headers, 'Received');
  const hops: HopInfo[] = [];
  let prevDate: Date | null = null;
  for (let i = 0; i < receivedRaw.length; i++) {
    // i=0 → first Received in the header is the most recent (last hop).
    const idx = i + 1;
    const hop = parseReceived(receivedRaw[i]!, receivedRaw[i]!, idx, prevDate);
    if (hop.idx === 1) {
      // For the most-recent hop, delay is from when the sending MTA
      // emitted the message to the receiving MTA's "Date" header (if any).
      // We can't compute that here, so leave null.
    }
    const dateFromHop = (() => {
      const m = receivedRaw[i]!.match(/;\s*(.+)$/);
      if (!m?.[1]) return null;
      const d = new Date(m[1].trim());
      return Number.isNaN(d.getTime()) ? null : d;
    })();
    prevDate = dateFromHop;
    hops.push(hop);
  }

  // Authentication-Results — most-recent (last in header) wins.
  const authRawAll = headerAll(headers, 'Authentication-Results');
  const authRaw = authRawAll[authRawAll.length - 1] ?? null;
  const auth: AuthResults = authRaw
    ? parseAuthHeader(authRaw)
    : {
        spf: { result: 'unknown' as const },
        dkim: { result: 'unknown' as const },
        dmarc: { result: 'unknown' as const },
        comp: { result: 'unknown' as const },
        raw: null,
      };

  const flags = buildFlags(headers, auth, hops);
  const riskScore = scoreFromFlags(flags);

  return {
    summary: {
      from,
      to,
      subject,
      date,
      messageId,
      returnPath,
      replyTo,
      receivedCount: receivedRaw.length,
    },
    hops,
    auth,
    flags,
    riskScore,
  };
}
