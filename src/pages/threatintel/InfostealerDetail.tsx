import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Bug, Copy, ExternalLink, Radio, Globe, Calendar, Shield, Layers } from 'lucide-react';
import { INFOSTEALER_FAMILIES } from '../../data/threatintel/infostealer-families';
import { sanitizeUrl } from '../../lib/sanitize-url';

interface SampleItem {
  family: string;
  sha256: string;
  reporter?: string;
  first_seen?: string;
  file_type?: string;
  url: string;
}

interface C2Item {
  value: string;
  kind: string;
  family: string;
  source: string;
  observed_at?: string;
}

const STEALER_RE =
  /\b(redline|lumma(c2)?|stealc|vidar|raccoon|meta ?stealer|risepro|rhadamanthys|aurora ?stealer|mars ?stealer|azorult|agent ?tesla|snake ?keylogger|lokibot|amos|atomic ?stealer|banshee|cryptbot|phemedrone|stealerium|mystic ?stealer|darkcloud|strela|erbium|taurus ?stealer|skuld|nexus ?stealer|kematian|acrstealer|fickerstealer)\b/i;

export default function InfostealerDetail(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const family = INFOSTEALER_FAMILIES.find((f) => f.slug === slug) ?? null;

  const [samples, setSamples] = useState<SampleItem[]>([]);
  const [c2, setC2] = useState<C2Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!family) return;
    let alive = true;
    const ctrl = new AbortController();
    const opts = { signal: ctrl.signal };

    Promise.allSettled([
      fetch('/api/v1/malware-samples', opts).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/v1/live-iocs', opts).then((r) => (r.ok ? r.json() : null)),
    ]).then(([mbRes, liRes]) => {
      if (!alive) return;

      const names = new Set(
        [family.threatfoxTag, family.name, ...family.aliases]
          .map((n) => (n ?? '').toLowerCase().replace(/\s+/g, ''))
          .filter(Boolean)
      );

      // Match samples by signature/tag.  Compare without spaces so
      // "agent tesla" (regex match) === "agenttesla" (threatfoxTag).
      if (mbRes.status === 'fulfilled' && mbRes.value) {
        const mbData = mbRes.value as { samples?: Record<string, unknown>[] };
        if (Array.isArray(mbData.samples)) {
          const ss = mbData.samples
            .map((s) => {
              const sig = String(s.signature ?? '');
              const tags = Array.isArray(s.tags) ? (s.tags as unknown[]).map(String) : [];
              const hay = `${sig} ${tags.join(' ')}`;
              const m = hay.match(STEALER_RE);
              if (!m) return null;
              if (!names.has(m[0].toLowerCase().replace(/\s+/g, ''))) return null;
              return {
                family: m[0],
                sha256: String(s.sha256 ?? ''),
                reporter: typeof s.reporter === 'string' ? s.reporter : undefined,
                first_seen: typeof s.first_seen === 'string' ? s.first_seen : undefined,
                file_type: typeof s.file_type === 'string' ? s.file_type : undefined,
                url: String(s.bazaar_url ?? ''),
              } as SampleItem;
            })
            .filter((x): x is SampleItem => x !== null);
          setSamples(ss);
        }
      }

      // Match C2/IOCs by threatfoxTag substring in context (narrower match
      // than using nameParts which can include generic words like "stealer").
      if (liRes.status === 'fulfilled' && liRes.value) {
        const liData = liRes.value as { items?: Record<string, unknown>[] };
        if (Array.isArray(liData.items)) {
          const ci = liData.items
            .filter((i) => {
              const ctx = String(i.context ?? '').toLowerCase();
              return [...names].some((n) => ctx.includes(n));
            })
            .map((i) => ({
              value: String(i.value ?? ''),
              kind: String(i.kind ?? ''),
              family: String(i.context ?? '').match(STEALER_RE)?.[0] ?? '?',
              source: String(i.source ?? ''),
              observed_at: typeof i.observed_at === 'string' ? i.observed_at : undefined,
            }));
          setC2(ci);
        }
      }

      setLoading(false);
    });

    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [family]);

  if (!family) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
        <Link
          to="/threatintel/infostealer"
          className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
        >
          <ArrowLeft size={14} /> back to Infostealer
        </Link>
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 font-mono text-sm text-amber-700 dark:text-amber-300">
          Unknown infostealer family: <code>{slug}</code>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel/infostealer"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back to Infostealer
      </Link>

      <div className="mb-8 animate-fade-in-up">
        <div className="flex items-center gap-3 mb-2">
          <Bug size={24} className="text-brand-600 dark:text-brand-400" />
          <h1 className="text-3xl font-display font-bold">{family.name}</h1>
        </div>
        {family.aliases.length > 0 && (
          <p className="font-mono text-sm text-slate-500">aka {family.aliases.join(', ')}</p>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-8 animate-fade-in-up">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={14} className="text-slate-500" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">First seen</span>
          </div>
          <p className="font-mono text-sm font-semibold">{family.firstSeen}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Globe size={14} className="text-slate-500" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Platforms</span>
          </div>
          <p className="font-mono text-sm font-semibold">{family.platforms.join(', ')}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Layers size={14} className="text-slate-500" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Capabilities</span>
          </div>
          <p className="font-mono text-sm font-semibold">{family.capabilities.length}</p>
        </div>
      </div>

      <section className="mb-8 animate-fade-in-up">
        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{family.description}</p>
      </section>

      <section className="mb-8">
        <h2 className="font-display font-semibold text-base mb-3">Capabilities</h2>
        <div className="flex flex-wrap gap-1.5">
          {family.capabilities.map((c) => (
            <span
              key={c}
              className="text-[11px] font-mono px-2 py-1 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400"
            >
              {c}
            </span>
          ))}
        </div>
      </section>

      {family.actors.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display font-semibold text-base mb-3">Known threat actors</h2>
          <div className="flex flex-wrap gap-2">
            {family.actors.map((a) => (
              <Link
                key={a}
                to={`/threatintel/actors/${a.toLowerCase().replace(/\s+/g, '-')}`}
                className="text-[12px] font-mono px-2 py-1 rounded border border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300 hover:bg-rose-500/10"
              >
                {a}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="font-display font-semibold text-base mb-3">References</h2>
        <div className="flex flex-wrap gap-3">
          {family.malpediaUrl && (
            <a
              href={family.malpediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] font-mono px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 text-brand-600 dark:text-brand-400"
            >
              <ExternalLink size={12} /> Malpedia
            </a>
          )}
          {family.threatfoxTag && (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-mono px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500">
              <Shield size={12} /> ThreatFox:{' '}
              <code className="text-slate-700 dark:text-slate-300">{family.threatfoxTag}</code>
            </span>
          )}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="font-display font-semibold text-base mb-3 inline-flex items-center gap-2">
          <Bug size={16} className="text-brand-600 dark:text-brand-400" /> Live MalwareBazaar samples
        </h2>
        {loading ? (
          <p className="font-mono text-[12px] text-slate-500 animate-pulse">loading samples…</p>
        ) : samples.length === 0 ? (
          <p className="font-mono text-[12px] text-slate-500">No live samples in the current 24h window.</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {samples.map((s, i) => (
              <li
                key={i}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-rose-700 dark:text-rose-300">
                    {s.family}
                  </span>
                  {s.file_type && <span className="font-mono text-[10px] text-slate-400">{s.file_type}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={sanitizeUrl(s.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[11px] text-brand-600 dark:text-brand-400 hover:underline break-all flex-1 min-w-0"
                  >
                    <code>{s.sha256.slice(0, 32)}…</code>
                  </a>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(s.sha256)}
                    className="shrink-0 rounded border border-slate-200 dark:border-slate-700 p-1 text-slate-500 hover:text-brand-600"
                    aria-label="Copy SHA256"
                  >
                    <Copy size={11} />
                  </button>
                </div>
                <p className="font-mono text-[10px] text-slate-400 mt-1">
                  {s.reporter ? `by ${s.reporter}` : ''} {s.first_seen ?? ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="font-display font-semibold text-base mb-3 inline-flex items-center gap-2">
          <Radio size={16} className="text-brand-600 dark:text-brand-400" /> Live C2 / IOCs
        </h2>
        {loading ? (
          <p className="font-mono text-[12px] text-slate-500 animate-pulse">loading IOCs…</p>
        ) : c2.length === 0 ? (
          <p className="font-mono text-[12px] text-slate-500">No live IOCs attributed in the current window.</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {c2.map((x, i) => (
              <li
                key={i}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-rose-700 dark:text-rose-300">
                    {x.family}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    {x.kind} · {x.source}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <code className="font-mono text-[11px] text-slate-600 dark:text-slate-400 break-all flex-1 min-w-0">
                    {x.value}
                  </code>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(x.value)}
                    className="shrink-0 rounded border border-slate-200 dark:border-slate-700 p-1 text-slate-500 hover:text-brand-600"
                    aria-label="Copy indicator"
                  >
                    <Copy size={11} />
                  </button>
                </div>
                {x.observed_at && <p className="font-mono text-[10px] text-slate-400 mt-1">{x.observed_at}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
