import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, ClipboardCopy, Check, ShieldAlert, Terminal, Crosshair, Upload } from 'lucide-react';
import { RelatedWikiArticles } from '../../components/dfir/RelatedWikiArticles';

type IocBucket = 'ipv4' | 'ipv6' | 'domain' | 'url' | 'md5' | 'sha1' | 'sha256' | 'email';

const PATTERNS: Record<IocBucket, RegExp> = {
  ipv4: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
  ipv6: /\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b/g,
  url: /\b(?:https?|hxxps?):\/\/[^\s<>"')]+/gi,
  domain: /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\b/gi,
  md5: /\b[a-f0-9]{32}\b/gi,
  sha1: /\b[a-f0-9]{40}\b/gi,
  sha256: /\b[a-f0-9]{64}\b/gi,
  email: /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi,
};

const ORDER: IocBucket[] = ['ipv4', 'ipv6', 'domain', 'url', 'md5', 'sha1', 'sha256', 'email'];
const LABELS: Record<IocBucket, string> = {
  ipv4: 'IPv4',
  ipv6: 'IPv6',
  domain: 'Domains',
  url: 'URLs',
  md5: 'MD5',
  sha1: 'SHA-1',
  sha256: 'SHA-256',
  email: 'Emails',
};

/**
 * Cyrillic/Greek lookalikes that defenders use to "defang" (or that
 * attackers use to bypass naive scanners). Folded back to ASCII when
 * the homograph-normalize toggle is on. Confined to the most common
 * confusables — overzealous folding mangles legitimate non-Latin text.
 */
const HOMOGRAPHS: Record<string, string> = {
  а: 'a',
  А: 'A', // Cyrillic а / А
  е: 'e',
  Е: 'E', // Cyrillic е / Е
  о: 'o',
  О: 'O', // Cyrillic о / О
  р: 'p',
  Р: 'P', // Cyrillic р / Р
  с: 'c',
  С: 'C', // Cyrillic с / С
  х: 'x',
  Х: 'X', // Cyrillic х / Х
  ѕ: 's',
  Ѕ: 'S', // Cyrillic ѕ / Ѕ
  і: 'i',
  І: 'I', // Cyrillic і / І
  ο: 'o',
  Ο: 'O', // Greek ο / Ο
  α: 'a',
  Α: 'A', // Greek α / Α
  ρ: 'p',
  Ρ: 'P', // Greek ρ / Ρ
  υ: 'u', // Greek υ
  '．': '.', // fullwidth full stop
  '。': '.', // ideographic full stop
  '·': '.', // middle dot (sometimes used as a separator)
};

function foldHomographs(s: string): string {
  let out = '';
  for (const ch of s) out += HOMOGRAPHS[ch] ?? ch;
  return out;
}

/**
 * Refang attacker/defender obfuscation patterns back to live indicators.
 * Applied iteratively until the string stabilises so nested defangs
 * (e.g. "[[.]]" or "h[xx]ps[://]") collapse fully.
 *
 * Patterns covered:
 *   - dots:   [.] (.) {.} [dot] (dot) {dot} [도트] [DOT] [punto]
 *   - colons: [:] [colon] [숫자콜론]
 *   - at:     [at] (at) {at} [@]
 *   - schemes: hxxp/hxxps (and variants htxp, htxxp, http5), html:// → http://
 *   - separators: [://] [/] [\] [-] (only when adjacent to a domain shape)
 *   - whitespace inside brackets: [ . ] [ : ] [ at ]
 *   - unicode: fullwidth dot, ideographic dot, middle dot
 *
 * If `normaliseHomographs` is true, common Cyrillic/Greek confusables
 * are folded to ASCII before extraction.
 */
function refang(input: string, normaliseHomographs: boolean): string {
  let s = normaliseHomographs ? foldHomographs(input) : input;

  // Iterate to fixed-point so nested defangs collapse.
  for (let pass = 0; pass < 5; pass++) {
    const before = s;

    // Bracketed/parenthesised dot, including word forms with optional whitespace.
    s = s.replace(/[[({]\s*(?:\.|dot|punto|점)\s*[\])}]/gi, '.');
    // Bracketed colon, word form too.
    s = s.replace(/[[({]\s*(?::|colon)\s*[\])}]/gi, ':');
    // Bracketed @ — also "[at]" / "(at)" / "{at}" with optional whitespace.
    s = s.replace(/[[({]\s*(?:@|at)\s*[\])}]/gi, '@');
    // Bracketed scheme separator and slashes.
    s = s.replace(/[[({]\s*:\/\/\s*[\])}]/g, '://');
    s = s.replace(/[[({]\s*\/\s*[\])}]/g, '/');
    s = s.replace(/[[({]\s*\\\s*[\])}]/g, '\\');

    // Scheme defangs: hxxp / hxxps / htxp / htxxp / http5 (rare) / html:// → http(s)://
    s = s.replace(/\bh(?:xx|tx|txx|xt)p(s?)\s*:\s*\/\s*\/\s*/gi, 'http$1://');
    s = s.replace(/\bhtml\s*:\s*\/\s*\/\s*/gi, 'http://');

    if (s === before) break;
  }
  return s;
}

function defang(s: string, type: IocBucket): string {
  if (type === 'url') return s.replace(/\./g, '[.]').replace(/^https?/i, (m) => m.replace(/t/gi, 'x'));
  if (type === 'ipv4' || type === 'ipv6' || type === 'domain' || type === 'email') return s.replace(/\./g, '[.]');
  return s;
}

interface ExtractResult {
  bucket: IocBucket;
  values: string[];
}

function extract(text: string, normaliseHomographs: boolean): ExtractResult[] {
  const refanged = refang(text, normaliseHomographs);
  const consumed = new Set<string>(); // hash matches dedupe by string; keep order

  // Order matters: hashes first (longest), then URLs, then ipv4, then ipv6, then email, then domain (last to avoid eating others)
  const order: IocBucket[] = ['sha256', 'sha1', 'md5', 'url', 'ipv4', 'ipv6', 'email', 'domain'];
  const out: Record<IocBucket, Set<string>> = {
    ipv4: new Set(),
    ipv6: new Set(),
    domain: new Set(),
    url: new Set(),
    md5: new Set(),
    sha1: new Set(),
    sha256: new Set(),
    email: new Set(),
  };

  let working = refanged;
  for (const bucket of order) {
    const matches = working.match(PATTERNS[bucket]) ?? [];
    for (const m of matches) {
      const lower = bucket === 'url' ? m : m.toLowerCase();
      // skip if already counted as a longer/more-specific type
      if (consumed.has(lower)) continue;
      // domains inside a URL/email shouldn't double-count
      if (bucket === 'domain') {
        const inUrl = [...out.url].some((u) => u.toLowerCase().includes(lower));
        const inEmail = [...out.email].some((e) => e.toLowerCase().includes(lower));
        if (inUrl || inEmail) continue;
      }
      out[bucket].add(lower);
      consumed.add(lower);
    }
    // remove matches from working text so domain pass doesn't pick them up
    if (bucket === 'url' || bucket === 'email') {
      working = working.replace(PATTERNS[bucket], ' ');
    }
  }

  return ORDER.map((b) => ({ bucket: b, values: [...out[b]].sort() })).filter((r) => r.values.length > 0);
}

export default function IocExtractor(): JSX.Element {
  const [input, setInput] = useState('');
  const [defanged, setDefanged] = useState(false);
  const [normaliseHomographs, setNormaliseHomographs] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [pipedFrom, setPipedFrom] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    const text = await file.text();
    setInput(text);
  };

  // Sister-tool pipe: PowerShell Deobfuscator (and others later) drops
  // its decoded output into sessionStorage and navigates here. Read
  // once on mount, prefill, then clear so a refresh doesn't re-pipe.
  useEffect(() => {
    const from = searchParams.get('from');
    if (!from) return;
    // Sister tools all share the same sessionStorage slot — only one
    // pipe at a time matters. Each `from` value carries a friendly label
    // for the banner.
    const KEYS: Record<string, { storage: string; label: string }> = {
      'ps-deob': { storage: 'ioc-extractor-pipe', label: 'PowerShell Deobfuscator' },
      phishing: { storage: 'ioc-extractor-pipe', label: 'Phishing Analyzer' },
      decoder: { storage: 'ioc-extractor-pipe', label: 'Decoder' },
      eml: { storage: 'ioc-extractor-pipe', label: 'EML Extractor' },
      weblog: { storage: 'ioc-extractor-pipe', label: 'Web Log Analyzer' },
      linux: { storage: 'ioc-extractor-pipe', label: 'Linux Triage' },
      pivot: { storage: 'ioc-extractor-pipe', label: 'IOC Pivot' },
    };
    const cfg = KEYS[from];
    if (!cfg) return;
    try {
      const piped = sessionStorage.getItem(cfg.storage);
      if (piped) {
        setInput(piped);
        setPipedFrom(cfg.label);
        sessionStorage.removeItem(cfg.storage);
      }
    } catch {
      /* sessionStorage unavailable — silently skip */
    }
    // Drop the ?from param so the URL is clean after the pipe.
    const next = new URLSearchParams(searchParams);
    next.delete('from');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const results = useMemo(() => extract(input, normaliseHomographs), [input, normaliseHomographs]);
  const totalCount = results.reduce((acc, r) => acc + r.values.length, 0);
  const refangedPreview = useMemo(
    () => (input.trim() ? refang(input, normaliseHomographs) : ''),
    [input, normaliseHomographs]
  );
  const refangChanged = refangedPreview && refangedPreview !== input;

  const renderValue = (b: IocBucket, v: string) => (defanged ? defang(v, b) : v);

  const copy = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2">IOC Extractor</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          Paste any blob of text, like an email, log line, blog post, or threat report. The extractor pulls out every
          IP, domain, URL, hash, and email it finds. Refanging is automatic.
        </p>
      </div>

      {/* File drop */}
      <div className="mb-4">
        <button
          type="button"
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void onFile(f);
          }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-4 text-center cursor-pointer hover:border-brand-500/40 focus-visible:outline-none focus-visible:border-brand-500/60"
          aria-label="Drop an .eml or text file here, or click to choose"
        >
          <Upload size={20} className="mx-auto mb-1 text-slate-500" />
          <p className="text-sm font-mono text-slate-600 dark:text-slate-400">
            Drop an .eml or .txt file, or paste below
          </p>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".eml,.txt,message/rfc822"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
      </div>

      {pipedFrom && (
        <div className="mb-3 rounded border border-cyan-500/30 bg-cyan-500/5 p-2.5 text-meta font-mono text-cyan-700 dark:text-cyan-300 inline-flex items-center gap-2">
          <Terminal size={12} /> Pre-filled from {pipedFrom} output. Edit freely below or
          <button
            type="button"
            onClick={() => {
              setInput('');
              setPipedFrom(null);
            }}
            className="underline hover:text-cyan-900 dark:hover:text-cyan-100"
          >
            clear
          </button>
          .
        </div>
      )}

      <label htmlFor="ioc-extractor-input" className="sr-only">
        Text blob to extract IOCs from
      </label>
      <textarea
        id="ioc-extractor-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste raw email, chat log, threat report, or any blob — refanging is automatic. Try patterns like example[.]com, hxxps://bad[.]site, 1[.]2[.]3[.]4[:]8080, [[.]] nesting, or Cyrillic homographs."
        rows={14}
        aria-label="Text blob to extract IOCs from"
        className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mt-4 mb-4">
        <span className="text-sm font-mono text-slate-600 dark:text-slate-400">
          {totalCount} indicator{totalCount === 1 ? '' : 's'} extracted
        </span>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-mono text-slate-600 dark:text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={normaliseHomographs}
              onChange={(e) => setNormaliseHomographs(e.target.checked)}
            />
            fold Cyrillic/Greek homographs
          </label>
          <label className="flex items-center gap-2 text-sm font-mono text-slate-600 dark:text-slate-400 cursor-pointer">
            <input type="checkbox" checked={defanged} onChange={(e) => setDefanged(e.target.checked)} />
            defang for output
          </label>
        </div>
      </div>

      {refangChanged && (
        <details className="mb-8 rounded border border-cyan-500/30 bg-cyan-500/5 p-3">
          <summary className="text-xs font-mono text-cyan-700 dark:text-cyan-300 cursor-pointer inline-flex items-center gap-2">
            <ShieldAlert size={12} /> input was refanged before extraction — click to see normalised text
          </summary>
          <pre className="mt-2 text-mini font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-all max-h-40 overflow-auto">
            {refangedPreview}
          </pre>
        </details>
      )}

      {results.length === 0 && input.trim() && (
        <p className="text-sm font-mono text-slate-500">No indicators detected.</p>
      )}

      {totalCount > 0 && (
        <div className="mb-4 flex gap-2">
          <Link
            to={`/dfir/ioc-check?indicator=${encodeURIComponent(results[0]?.values[0] ?? '')}`}
            className="inline-flex items-center gap-1.5 text-mini font-mono px-3 py-2 rounded-lg border border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:bg-brand-500/20"
          >
            <Crosshair size={11} /> Check first indicator in IOC Checker
          </Link>
        </div>
      )}

      <div className="space-y-6">
        {results.map(({ bucket, values }) => {
          const blob = values.map((v) => renderValue(bucket, v)).join('\n');
          const id = `${bucket}-${values.length}`;
          return (
            <section
              key={bucket}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-semibold text-slate-900 dark:text-slate-100">
                  {LABELS[bucket]} <span className="text-xs font-mono text-slate-500 ml-2">{values.length}</span>
                </h3>
                <button
                  onClick={() => copy(id, blob)}
                  className="inline-flex items-center gap-1 text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline"
                  type="button"
                >
                  {copied === id ? <Check size={12} /> : <ClipboardCopy size={12} />}
                  {copied === id ? 'copied' : 'copy all'}
                </button>
              </div>
              <ul className="space-y-1 font-mono text-sm text-slate-700 dark:text-slate-300 break-all">
                {values.map((v) => (
                  <li key={v}>{renderValue(bucket, v)}</li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <RelatedWikiArticles />
    </div>
  );
}
