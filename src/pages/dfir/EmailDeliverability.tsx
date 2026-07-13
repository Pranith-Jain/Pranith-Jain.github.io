import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataPageLayout } from '../../components/DataPageLayout';
import {
  Mail,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Upload,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  CircleAlert,
} from 'lucide-react';

/**
 * Email Deliverability Tester — paste or upload a raw email (.eml /
 * MIME source) and get back a graded deliverability analysis from
 * IntoDNS.ai's /api/debug-email endpoint. Returns:
 *
 *   - spam score + threshold + per-rule breakdown
 *   - SPF / DKIM / DMARC alignment status
 *   - header analysis (issues + warnings)
 *   - prioritized fix suggestions
 *
 * Why a dedicated tool (vs. just a panel in EmlExtractor): EmlExtractor
 * is IOC-focused (URLs, hashes, senders). Deliverability is a different
 * concern — does this email *land* in the inbox, and what's the path
 * to inbox placement? Distinct user, distinct workflow.
 */

const SAMPLE_EML = `From: "Marketing Team" <marketing@acme-corp.com>
To: "Customer" <jane@example.org>
Subject: Your weekly digest
Date: Wed, 15 Jan 2026 09:14:22 -0500
Message-ID: <abc123@acme-corp.com>
MIME-Version: 1.0
Authentication-Results: mx.example.org;
	spf=fail smtp.mailfrom=acme-corp.com;
	dkim=none;
	dmarc=fail header.from=acme-corp.com
Received: from sender.acme-corp.com (sender.acme-corp.com [203.0.113.10])
	by mx.example.org (Postfix) with ESMTPS id A1B2C3
	for <jane@example.org>; Wed, 15 Jan 2026 09:14:22 -0500 (EST)
Return-Path: <bounces@acme-corp.com>
List-Unsubscribe: <mailto:unsub@acme-corp.com>, <https://acme-corp.com/unsub>
Content-Type: text/html; charset=UTF-8

<html><body>
<h1>This week's digest</h1>
<p>Hi Jane, here's what we shipped this week…</p>
</body></html>`;

interface IntodnsAlignment {
  spf?: boolean;
  dkim?: boolean;
}

interface IntodnsSpamRule {
  name?: string;
  score?: number;
  description?: string;
}

interface IntodnsHeaderIssue {
  type?: string;
  field?: string;
  message?: string;
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
}

interface IntodnsSuggestion {
  issue?: string;
  fix?: string;
  priority?: 'high' | 'medium' | 'low';
}

interface IntodnsDebugResponse {
  spf?: { status?: string; details?: string; aligned?: boolean };
  dkim?: { status?: string; details?: string; aligned?: boolean };
  dmarc?: { status?: string; alignment?: IntodnsAlignment; details?: string };
  comp?: { result?: string; details?: string };
  spamScore?: {
    score?: number;
    threshold?: number;
    rules?: IntodnsSpamRule[];
  };
  headerAnalysis?: { issues?: IntodnsHeaderIssue[]; warnings?: IntodnsHeaderIssue[] };
  suggestions?: IntodnsSuggestion[];
}

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
const SEV_TONE: Record<Severity, { text: string; chip: string; icon: typeof ShieldAlert }> = {
  critical: { text: 'text-rose-700 dark:text-rose-300', chip: 'border-rose-500/40 bg-rose-500/10', icon: ShieldX },
  high: { text: 'text-rose-600 dark:text-rose-400', chip: 'border-rose-500/30 bg-rose-500/5', icon: ShieldAlert },
  medium: {
    text: 'text-amber-700 dark:text-amber-300',
    chip: 'border-amber-500/30 bg-amber-500/10',
    icon: AlertTriangle,
  },
  low: { text: 'text-sky-700 dark:text-sky-300', chip: 'border-sky-500/30 bg-sky-500/10', icon: CircleAlert },
  info: { text: 'text-slate-600 dark:text-slate-400', chip: 'border-slate-500/30 bg-slate-500/10', icon: CircleAlert },
};

function tone(sev: Severity | undefined): (typeof SEV_TONE)[Severity] {
  return SEV_TONE[sev ?? 'info'] ?? SEV_TONE.info;
}

const CITATIONS = {
  apiDocs: 'https://intodns.ai/api-docs',
  emailTest: (d: string) => `https://intodns.ai/email-test?domain=${encodeURIComponent(d)}`,
  methodology: 'https://intodns.ai/methodology',
  llmApi: 'https://intodns.ai/llm/api.md',
};

export default function EmailDeliverability(): JSX.Element {
  const [searchParams] = useSearchParams();
  const initialEml = searchParams.get('eml') ?? '';
  const [rawEml, setRawEml] = useState(initialEml);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IntodnsDebugResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedHeaders, setExpandedHeaders] = useState(false);

  useEffect(() => {
    if (!initialEml) return;
    if (rawEml.trim() === initialEml.trim()) {
      void onSubmit({ preventDefault: () => {} } as FormEvent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitRef = useRef<AbortController | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = rawEml.trim();
    if (!trimmed) return;
    submitRef.current?.abort();
    const ctrl = new AbortController();
    submitRef.current = ctrl;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch('/api/v1/intodns/debug-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_email: trimmed }),
        signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(30_000)]),
      });
      if (ctrl.signal.aborted) return;
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        throw new Error(body.error ?? `${res.status}${body.detail ? `: ${body.detail}` : ''}`);
      }
      const data = (await res.json()) as IntodnsDebugResponse;
      setResult(data);
    } catch (err) {
      console.error('handler failed:', err instanceof Error ? err.message : String(err));
      if (ctrl.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'analysis failed');
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  };

  const onUpload = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setRawEml(text);
    };
    reader.readAsText(file);
  };

  const onClear = () => {
    setRawEml('');
    setResult(null);
    setError(null);
  };

  const onSample = () => {
    setRawEml(SAMPLE_EML);
  };

  const spamScore = result?.spamScore?.score ?? 0;
  const spamThreshold = result?.spamScore?.threshold ?? 5;
  const spamVerdict: 'pass' | 'warn' | 'fail' =
    spamScore >= spamThreshold ? 'fail' : spamScore >= spamThreshold * 0.6 ? 'warn' : 'pass';

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Mail size={28} />}
      title="Email Deliverability Tester"
      description={
        <>
          Paste or upload a raw email (.eml) to get a spam score, SPF/DKIM/DMARC alignment, header analysis, and
          prioritized inbox-placement suggestions. Backed by{' '}
          <a
            href={CITATIONS.apiDocs}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
          >
            IntoDNS.ai /api/debug-email <ExternalLink size={10} aria-hidden="true" />
          </a>
          .
        </>
      }
    >
      <form onSubmit={onSubmit} className="mb-6">
        <label
          htmlFor="raw-email-input"
          className="block text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2"
        >
          Raw email source
        </label>
        <textarea
          id="raw-email-input"
          value={rawEml}
          onChange={(e) => setRawEml(e.target.value)}
          placeholder="Paste the full email source (headers + body). For .eml files, upload below."
          rows={10}
          className="w-full rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3 font-mono text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          spellCheck={false}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={loading || !rawEml.trim()}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-xl disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
            {loading ? 'Analyzing…' : 'Analyze'}
          </button>
          <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-muted font-mono text-sm rounded-xl cursor-pointer hover:border-slate-300">
            <Upload size={14} aria-hidden="true" />
            upload .eml
            <input
              type="file"
              accept=".eml,message/rfc822,text/plain"
              className="sr-only"
              onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            onClick={onSample}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-muted font-mono text-sm rounded-xl hover:border-slate-300"
          >
            <Sparkles size={14} aria-hidden="true" />
            use sample
          </button>
          <button
            type="button"
            onClick={onClear}
            className="ml-auto px-3 py-2.5 text-mini font-mono text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            clear
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="font-mono text-rose-600 dark:text-rose-400 mb-4">
          error: {error}
        </p>
      )}

      {result && (
        <div className="space-y-6">
          {/* Spam score hero */}
          <section
            className={`rounded-xl border p-5 ${
              spamVerdict === 'fail'
                ? 'border-rose-500/40 bg-rose-500/5'
                : spamVerdict === 'warn'
                  ? 'border-amber-500/40 bg-amber-500/5'
                  : 'border-emerald-500/40 bg-emerald-500/5'
            }`}
          >
            <div className="flex flex-wrap items-center gap-4">
              <div
                className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-xl font-mono text-2xl font-bold ring-2 ${
                  spamVerdict === 'fail'
                    ? 'bg-rose-500/10 ring-rose-500/40 text-rose-700 dark:text-rose-300'
                    : spamVerdict === 'warn'
                      ? 'bg-amber-500/10 ring-amber-500/40 text-amber-700 dark:text-amber-300'
                      : 'bg-emerald-500/10 ring-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                }`}
                title={`Spam score ${spamScore} / threshold ${spamThreshold}`}
              >
                {spamScore}/{spamThreshold}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-mini font-mono uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  Inbox placement verdict
                </div>
                <div className="mt-0.5 text-lg font-semibold">
                  {spamVerdict === 'fail'
                    ? 'Likely filtered to spam'
                    : spamVerdict === 'warn'
                      ? 'Borderline — review before sending'
                      : 'Likely inbox placement'}
                </div>
                {result.spamScore?.rules && result.spamScore.rules.length > 0 && (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    {result.spamScore.rules.length} rule{result.spamScore.rules.length === 1 ? '' : 's'} triggered
                  </p>
                )}
              </div>
            </div>

            {/* Per-rule breakdown */}
            {result.spamScore?.rules && result.spamScore.rules.length > 0 && (
              <ul className="mt-4 space-y-1.5 border-t border-slate-200 dark:border-[rgb(var(--border-400))] pt-3">
                {result.spamScore.rules
                  .slice()
                  .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                  .map((r, i) => (
                    <li key={`${r.name}-${i}`} className="flex items-baseline gap-3 text-xs">
                      <span className="font-mono text-rose-700 dark:text-rose-300 tabular-nums w-8 text-right">
                        +{r.score ?? 0}
                      </span>
                      <span className="font-mono text-slate-700 dark:text-slate-300">{r.name}</span>
                      {r.description && (
                        <span className="text-slate-600 dark:text-slate-400 truncate">— {r.description}</span>
                      )}
                    </li>
                  ))}
              </ul>
            )}
          </section>

          {/* Auth alignment */}
          <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-5">
            <h2 className="font-display font-bold text-lg mb-3">Authentication alignment</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <AuthRow
                label="SPF"
                result={result.spf?.status}
                aligned={result.spf?.aligned}
                details={result.spf?.details}
              />
              <AuthRow
                label="DKIM"
                result={result.dkim?.status}
                aligned={result.dkim?.aligned}
                details={result.dkim?.details}
              />
              <AuthRow
                label="DMARC"
                result={result.dmarc?.status}
                aligned={Boolean(result.dmarc?.alignment?.spf && result.dmarc?.alignment?.dkim)}
                details={result.dmarc?.details}
              />
            </div>
          </section>

          {/* Header analysis */}
          {result.headerAnalysis?.issues?.length || result.headerAnalysis?.warnings?.length ? (
            <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display font-bold text-lg">Header analysis</h2>
                <button
                  type="button"
                  onClick={() => setExpandedHeaders((v) => !v)}
                  className="inline-flex items-center gap-1 text-mini font-mono text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  {expandedHeaders ? 'collapse' : 'expand'}
                  {expandedHeaders ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                </button>
              </div>
              {expandedHeaders && (
                <div className="space-y-3">
                  {result.headerAnalysis?.issues?.map((iss, i) => {
                    const t = tone(iss.severity as Severity);
                    const Icon = t.icon;
                    return (
                      <div key={`iss-${i}`} className={`rounded border px-3 py-2 ${t.chip}`}>
                        <div className="flex items-start gap-2">
                          <Icon size={12} className={`mt-0.5 ${t.text}`} aria-hidden="true" />
                          <div>
                            <div className={`text-xs font-mono ${t.text}`}>
                              {iss.field && <span className="font-semibold">{iss.field}</span>}
                              {iss.type && <span className="ml-2 text-slate-500">{iss.type}</span>}
                            </div>
                            {iss.message && (
                              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{iss.message}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {result.headerAnalysis?.warnings?.map((w, i) => {
                    const t = tone(w.severity as Severity);
                    return (
                      <div key={`warn-${i}`} className={`rounded border px-3 py-2 ${t.chip}`}>
                        <div className={`text-xs font-mono ${t.text}`}>
                          {w.field && <span className="font-semibold">{w.field}</span>}
                          {w.message && <span className="ml-2 text-slate-600 dark:text-slate-400">{w.message}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}

          {/* Suggestions */}
          {result.suggestions && result.suggestions.length > 0 && (
            <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-5">
              <h2 className="font-display font-bold text-lg mb-3">Suggestions</h2>
              <ul className="space-y-2">
                {result.suggestions
                  .slice()
                  .sort((a, b) => {
                    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
                    return (order[a.priority ?? 'low'] ?? 2) - (order[b.priority ?? 'low'] ?? 2);
                  })
                  .map((s, i) => {
                    const t = tone(s.priority as Severity);
                    return (
                      <li key={`s-${i}`} className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-micro font-mono uppercase tracking-wider ${t.chip} ${t.text}`}
                        >
                          {s.priority ?? 'low'}
                        </span>
                        <div className="min-w-0">
                          {s.issue && (
                            <div className="text-xs font-medium text-slate-900 dark:text-slate-100">{s.issue}</div>
                          )}
                          {s.fix && <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{s.fix}</div>}
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </section>
          )}

          <footer className="flex flex-wrap items-center justify-between gap-2 text-mini font-mono text-slate-400 dark:text-slate-500">
            <span>
              powered by{' '}
              <a href={CITATIONS.apiDocs} target="_blank" rel="noopener noreferrer" className="underline">
                intodns.ai
              </a>
              {' · '}
              <a href={CITATIONS.llmApi} target="_blank" rel="noopener noreferrer" className="underline">
                llm doc
              </a>
            </span>
            <span>no caching — every paste is a fresh analysis</span>
          </footer>
        </div>
      )}
    </DataPageLayout>
  );
}

function AuthRow({
  label,
  result,
  aligned,
  details,
}: {
  label: string;
  result?: string;
  aligned?: boolean;
  details?: string;
}): JSX.Element {
  const ok = result === 'pass' || result === 'none' || aligned;
  const Icon = ok ? ShieldCheck : ShieldAlert;
  return (
    <div
      className={`rounded border p-3 ${
        ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon
          size={12}
          className={ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
        />
        <span className="text-micro font-mono uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          {label}
        </span>
      </div>
      <div
        className={`text-sm font-mono ${ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}
      >
        {result ?? 'unknown'}
        {aligned !== undefined && (
          <span className="ml-2 text-mini text-slate-500 dark:text-slate-400">· aligned: {aligned ? 'yes' : 'no'}</span>
        )}
      </div>
      {details && <p className="mt-1 text-micro text-slate-600 dark:text-slate-400 leading-relaxed">{details}</p>}
    </div>
  );
}
