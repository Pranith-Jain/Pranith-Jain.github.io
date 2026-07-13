import { useMemo, useState } from 'react';
import type { Severity as Sev } from '../../components/severity';
import { BackLink } from '../../components/BackLink';
import { AlertTriangle, ShieldAlert, ShieldX, ShieldCheck, Info } from 'lucide-react';

/**
 * HTTP Security Headers Analyzer — 100% client-side.
 *
 * Paste a raw HTTP response (status line + headers, or just headers;
 * `curl -I` / DevTools "copy response headers" both work). CSP, HSTS,
 * frame protection, CORS, Set-Cookie flags and info-leak headers are
 * graded into a letter score with per-issue remediation. Nothing leaves
 * the browser.
 */

interface Finding {
  sev: Sev;
  title: string;
  detail: string;
  fix: string;
}

const SEV_ORDER: Record<Sev, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const SEV_WEIGHT: Record<Sev, number> = { critical: 40, high: 20, medium: 10, low: 4, info: 0 };

const SEV_STYLE: Record<Sev, { text: string; chip: string; Icon: typeof ShieldAlert }> = {
  critical: {
    text: 'text-rose-700 dark:text-rose-300',
    chip: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    Icon: ShieldX,
  },
  high: {
    text: 'text-rose-600 dark:text-rose-400',
    chip: 'border-rose-500/30 bg-rose-500/5 text-rose-600 dark:text-rose-400',
    Icon: ShieldAlert,
  },
  medium: {
    text: 'text-amber-700 dark:text-amber-400',
    chip: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    Icon: AlertTriangle,
  },
  low: {
    text: 'text-sky-700 dark:text-sky-400',
    chip: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400',
    Icon: Info,
  },
  info: {
    text: 'text-muted',
    chip: 'border-slate-400/30 bg-slate-400/10 text-muted',
    Icon: Info,
  },
};

function parseHeaders(raw: string): { headers: Map<string, string>; cookies: string[] } {
  const headers = new Map<string, string>();
  const cookies: string[] = [];
  for (const line of raw.split('\n')) {
    const l = line.trim();
    if (!l || /^HTTP\/\d/i.test(l) || /^(GET|POST|PUT|DELETE|HEAD|PATCH)\s/i.test(l)) continue;
    const ci = l.indexOf(':');
    if (ci === -1) continue;
    const name = l.slice(0, ci).trim().toLowerCase();
    const val = l.slice(ci + 1).trim();
    if (name === 'set-cookie') cookies.push(val);
    else headers.set(name, headers.has(name) ? `${headers.get(name)}, ${val}` : val);
  }
  return { headers, cookies };
}

function analyze(raw: string): { findings: Finding[]; grade: string; count: number } | null {
  if (!raw.trim()) return null;
  const { headers, cookies } = parseHeaders(raw);
  const count = headers.size + cookies.length;
  if (count === 0)
    return {
      findings: [
        {
          sev: 'info',
          title: 'No headers parsed',
          detail: 'Paste raw response headers (curl -I output or DevTools "copy response headers").',
          fix: 'Include lines like `Name: value`.',
        },
      ],
      grade: '—',
      count: 0,
    };
  const f: Finding[] = [];
  const h = (n: string) => headers.get(n);

  // HSTS
  const hsts = h('strict-transport-security');
  if (!hsts)
    f.push({
      sev: 'high',
      title: 'Missing Strict-Transport-Security',
      detail: 'No HSTS — a MITM can strip TLS on the first/next visit (sslstrip).',
      fix: 'Add `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.',
    });
  else {
    const ma = Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0);
    if (ma < 15768000)
      f.push({
        sev: 'medium',
        title: `HSTS max-age too short (${ma}s)`,
        detail: 'Under ~6 months weakens the protection window.',
        fix: 'Use max-age=31536000 (1 year).',
      });
    if (!/includesubdomains/i.test(hsts))
      f.push({
        sev: 'low',
        title: 'HSTS without includeSubDomains',
        detail: 'Subdomains are not protected.',
        fix: 'Add `; includeSubDomains`.',
      });
  }

  // CSP
  const csp = h('content-security-policy');
  const cspRO = h('content-security-policy-report-only');
  if (!csp && !cspRO)
    f.push({
      sev: 'high',
      title: 'Missing Content-Security-Policy',
      detail: 'No CSP — no defense-in-depth against XSS/data injection.',
      fix: 'Add a strict CSP (nonce/hash-based, no unsafe-inline).',
    });
  else if (!csp && cspRO)
    f.push({
      sev: 'medium',
      title: 'CSP is Report-Only',
      detail: 'A report-only policy is not enforced — it logs but does not block.',
      fix: 'Move to an enforcing Content-Security-Policy once validated.',
    });
  if (csp) {
    if (/'unsafe-inline'/.test(csp) && /(script-src|default-src)/.test(csp))
      f.push({
        sev: 'high',
        title: "CSP allows 'unsafe-inline' scripts",
        detail: "'unsafe-inline' in script-src/default-src negates most of CSP's XSS protection.",
        fix: 'Use nonces or hashes instead of unsafe-inline.',
      });
    if (/'unsafe-eval'/.test(csp))
      f.push({
        sev: 'medium',
        title: "CSP allows 'unsafe-eval'",
        detail: 'Permits eval()/new Function — broadens the XSS sink surface.',
        fix: 'Remove unsafe-eval; refactor code that needs eval.',
      });
    if (/(script-src|default-src)[^;]*\*(?!\.)/.test(csp))
      f.push({
        sev: 'high',
        title: 'CSP script source is wildcard "*"',
        detail: 'Any origin can serve scripts — effectively no script restriction.',
        fix: 'Allow-list explicit script origins.',
      });
    if (!/default-src|script-src/.test(csp))
      f.push({
        sev: 'medium',
        title: 'CSP has no default-src/script-src',
        detail: 'Without these, script execution is not constrained.',
        fix: 'Set at least a restrictive script-src (and default-src).',
      });
    if (!/frame-ancestors/.test(csp) && !h('x-frame-options'))
      f.push({
        sev: 'medium',
        title: 'No frame-ancestors and no X-Frame-Options',
        detail: 'Clickjacking is possible — the page can be framed by anyone.',
        fix: "Add `frame-ancestors 'none'` (or 'self') and/or X-Frame-Options.",
      });
  }

  // Clickjacking via XFO
  const xfo = h('x-frame-options');
  if (!xfo && !(csp && /frame-ancestors/.test(csp)))
    f.push({
      sev: 'high',
      title: 'Missing X-Frame-Options (clickjacking)',
      detail: 'No anti-framing header and no CSP frame-ancestors.',
      fix: 'Add `X-Frame-Options: DENY` or CSP frame-ancestors.',
    });
  else if (xfo && !/^(deny|sameorigin)$/i.test(xfo.trim()))
    f.push({
      sev: 'low',
      title: `Unusual X-Frame-Options value "${xfo}"`,
      detail: 'Only DENY and SAMEORIGIN are reliably honoured (ALLOW-FROM is obsolete).',
      fix: 'Use DENY or SAMEORIGIN; prefer CSP frame-ancestors.',
    });

  // MIME sniffing
  const xcto = h('x-content-type-options');
  if (!xcto || xcto.toLowerCase() !== 'nosniff')
    f.push({
      sev: 'medium',
      title: 'Missing X-Content-Type-Options: nosniff',
      detail: 'Browsers may MIME-sniff responses → content-type confusion / XSS.',
      fix: 'Add `X-Content-Type-Options: nosniff`.',
    });

  if (!h('referrer-policy'))
    f.push({
      sev: 'low',
      title: 'Missing Referrer-Policy',
      detail: 'Default policy can leak full URLs (incl. tokens in paths) cross-origin.',
      fix: 'Add `Referrer-Policy: strict-origin-when-cross-origin` (or no-referrer).',
    });
  if (!h('permissions-policy'))
    f.push({
      sev: 'low',
      title: 'Missing Permissions-Policy',
      detail: 'No restriction on powerful features (camera, geolocation, etc.).',
      fix: 'Add a Permissions-Policy disabling unused features.',
    });

  // CORS
  const acao = h('access-control-allow-origin');
  const acac = (h('access-control-allow-credentials') ?? '').toLowerCase() === 'true';
  if (acao === '*' && acac)
    f.push({
      sev: 'critical',
      title: 'CORS: ACAO "*" with Allow-Credentials true',
      detail:
        'An invalid + dangerous combination — strongly signals a reflected-origin misconfig that exposes authenticated data cross-origin.',
      fix: 'Never combine wildcard origin with credentials; allow-list exact origins.',
    });
  else if (acao === '*')
    f.push({
      sev: 'medium',
      title: 'CORS: Access-Control-Allow-Origin "*"',
      detail: 'Any origin can read responses — fine for truly public data, dangerous for anything authenticated.',
      fix: 'Restrict ACAO to specific trusted origins for non-public APIs.',
    });
  else if (acao === 'null')
    f.push({
      sev: 'high',
      title: 'CORS: Access-Control-Allow-Origin "null"',
      detail: 'The "null" origin is reachable from sandboxed iframes/data URLs — commonly exploitable.',
      fix: 'Never allow the null origin; allow-list explicit origins.',
    });
  else if (acao && acac && !h('vary')?.toLowerCase().includes('origin'))
    f.push({
      sev: 'medium',
      title: 'CORS: specific origin + credentials, no Vary: Origin',
      detail:
        'If the origin is reflected from the request, it is effectively a wildcard with credentials; missing `Vary: Origin` also poisons caches.',
      fix: 'Confirm the origin is allow-listed (not reflected) and add `Vary: Origin`.',
    });

  // Cookies
  for (const c of cookies) {
    const nm = c.split('=')[0]?.trim() ?? 'cookie';
    const sessionish = /sess|sid|auth|token|jwt|csrf/i.test(nm);
    if (!/;\s*secure/i.test(c))
      f.push({
        sev: sessionish ? 'high' : 'medium',
        title: `Cookie "${nm}" missing Secure`,
        detail: 'Sent over plaintext HTTP if the scheme is ever downgraded.',
        fix: 'Add the `Secure` attribute.',
      });
    if (sessionish && !/;\s*httponly/i.test(c))
      f.push({
        sev: 'medium',
        title: `Session cookie "${nm}" missing HttpOnly`,
        detail: 'Readable by JavaScript → stealable via XSS.',
        fix: 'Add `HttpOnly`.',
      });
    const ss = /;\s*samesite=(\w+)/i.exec(c)?.[1]?.toLowerCase();
    if (!ss)
      f.push({
        sev: 'low',
        title: `Cookie "${nm}" has no SameSite`,
        detail: 'Default varies by browser; explicit is safer (CSRF surface).',
        fix: 'Set `SameSite=Lax` (or Strict).',
      });
    else if (ss === 'none' && !/;\s*secure/i.test(c))
      f.push({
        sev: 'medium',
        title: `Cookie "${nm}" SameSite=None without Secure`,
        detail: 'SameSite=None requires Secure or browsers reject it.',
        fix: 'Add `Secure` alongside SameSite=None.',
      });
  }

  // Information disclosure
  const srv = h('server');
  if (srv && /\d/.test(srv))
    f.push({
      sev: 'low',
      title: `Server header leaks version ("${srv}")`,
      detail: 'Exposing server/version aids targeted exploitation.',
      fix: 'Strip the version (or the Server header).',
    });
  for (const leak of ['x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version', 'x-generator', 'x-runtime'])
    if (h(leak))
      f.push({
        sev: 'low',
        title: `Information-leak header: ${leak}`,
        detail: `\`${leak}: ${h(leak)}\` discloses the tech stack.`,
        fix: `Remove the ${leak} header.`,
      });

  // Sensitive response cacheable
  const cc = (h('cache-control') ?? '').toLowerCase();
  if (cookies.length > 0 && !/no-store|private/.test(cc))
    f.push({
      sev: 'medium',
      title: 'Auth response may be cacheable',
      detail: 'A Set-Cookie response without `Cache-Control: no-store`/`private` can be cached by shared proxies/CDNs.',
      fix: 'Send `Cache-Control: no-store` on authenticated responses.',
    });

  f.sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev]);
  const penalty = f.reduce((n, x) => n + SEV_WEIGHT[x.sev], 0);
  const score = Math.max(0, 100 - penalty);
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 55 ? 'C' : score >= 35 ? 'D' : 'F';
  return { findings: f, grade, count };
}

const SAMPLE = [
  'HTTP/2 200',
  'server: nginx/1.21.0',
  'content-type: text/html',
  'access-control-allow-origin: *',
  'access-control-allow-credentials: true',
  'x-powered-by: Express',
  'set-cookie: sessionId=abc123; Path=/',
  'cache-control: public, max-age=600',
].join('\n');

export default function SecHeadersAnalyzer(): JSX.Element {
  const [input, setInput] = useState('');
  const result = useMemo(() => analyze(input), [input]);
  const counts = useMemo(() => {
    const c: Record<Sev, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    result?.findings.forEach((x) => (c[x.sev] += 1));
    return c;
  }, [result]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        back
      </BackLink>
      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2">HTTP Security Headers Analyzer</h1>
        <p className="text-muted mb-6 max-w-2xl">
          Paste a raw HTTP response (status line + headers, or just headers —{' '}
          <span className="font-mono text-tool">curl -I</span> or DevTools "copy response headers"). CSP, HSTS, framing,
          CORS, Set-Cookie flags and info-leak headers are graded with per-issue fixes. Nothing leaves your browser.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={() => setInput(SAMPLE)}
            className="text-meta font-mono px-2.5 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
          >
            load example
          </button>
          {input && (
            <button
              type="button"
              onClick={() => setInput('')}
              className="text-meta font-mono px-2.5 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400"
            >
              clear
            </button>
          )}
        </div>
      </div>
      <label htmlFor="hdr-input" className="sr-only">
        HTTP response headers
      </label>
      <textarea
        id="hdr-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={
          "HTTP/2 200\nstrict-transport-security: max-age=63072000\ncontent-security-policy: default-src 'self'\nset-cookie: sid=…; Secure; HttpOnly; SameSite=Lax"
        }
        rows={12}
        spellCheck={false}
        aria-label="HTTP response headers"
        className="w-full px-4 py-3 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl font-mono text-tool text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
      />
      {result && (
        <div className="mt-8 space-y-6">
          <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span className="text-2xl font-display font-bold">
                Grade{' '}
                <span
                  className={
                    result.grade === 'A'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : result.grade === 'F' || result.grade === 'D'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-amber-600 dark:text-amber-400'
                  }
                >
                  {result.grade}
                </span>
              </span>
              <span>
                <span className="text-slate-500">Headers parsed:</span>{' '}
                <span className="font-mono">{result.count}</span>
              </span>
              <span className="flex flex-wrap gap-1.5">
                {(['critical', 'high', 'medium', 'low', 'info'] as Sev[])
                  .filter((s) => counts[s] > 0)
                  .map((s) => (
                    <span
                      key={s}
                      className={`text-mini font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${SEV_STYLE[s].chip}`}
                    >
                      {counts[s]} {s}
                    </span>
                  ))}
              </span>
            </div>
          </section>
          {result.findings.length === 0 && (
            <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <ShieldCheck size={16} className="mt-0.5 flex-shrink-0" />
              <span>All checked headers look solid.</span>
            </section>
          )}
          {result.findings.length > 0 && (
            <section className="space-y-3">
              {result.findings.map((f, idx) => {
                const st = SEV_STYLE[f.sev];
                return (
                  <div
                    key={`${f.title}-${idx}`}
                    className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4"
                  >
                    <div className="flex items-start gap-2.5">
                      <st.Icon size={16} className={`mt-0.5 flex-shrink-0 ${st.text}`} />
                      <div className="min-w-0 flex-1">
                        <span
                          className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${st.chip}`}
                        >
                          {f.sev}
                        </span>
                        <h3 className={`font-display font-semibold mt-1.5 ${st.text}`}>{f.title}</h3>
                        <p className="text-sm text-muted mt-1 leading-relaxed">{f.detail}</p>
                        <p className="text-tool text-slate-700 dark:text-slate-300 mt-2">
                          <span className="text-slate-500 font-mono text-mini uppercase tracking-wider">fix</span>{' '}
                          {f.fix}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
