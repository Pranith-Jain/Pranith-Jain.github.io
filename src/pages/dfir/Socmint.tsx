import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import {
  ArrowLeft,
  Search,
  ExternalLink,
  Network,
  Lock,
  Users,
  ShieldAlert,
  Building,
  Globe2,
  Code2,
  ScrollText,
  AtSign,
  Clipboard,
  Check,
} from 'lucide-react';
import {
  PIVOTS,
  detectKind,
  type PivotCategory,
  type PivotInputKind,
  type PivotLink,
} from '../../data/dfir/socmint-pivots';

const CATEGORY_META: Record<PivotCategory, { label: string; blurb: string; icon: typeof Search; pillCls: string }> = {
  breach: {
    label: 'Breach exposure',
    blurb: 'HIBP, XposedOrNot, Dehashed, IntelX, LeakCheck, EmailRep',
    icon: ShieldAlert,
    pillCls: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  },
  b2b: {
    label: 'B2B / data brokers',
    blurb: 'Hunter, Apollo, ZoomInfo, Snov, RocketReach, Lusha, ContactOut, LeadIQ, Clearbit, PeopleDataLabs',
    icon: Building,
    pillCls: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  },
  social: {
    label: 'Social media',
    blurb: 'LinkedIn, X, Reddit, Instagram, Facebook, TikTok, Mastodon, Bluesky, Telegram, WhatsMyName',
    icon: Users,
    pillCls: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  },
  dev: {
    label: 'Code / dev platforms',
    blurb: 'GitHub commit-author, GitLab, npm, PyPI, Stack Overflow',
    icon: Code2,
    pillCls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  paste: {
    label: 'Paste-site dorks',
    blurb: 'Pastebin, GhostBin, paste.ee, hastebin, rentry, privatebin, PSBDMP',
    icon: ScrollText,
    pillCls: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  dorks: {
    label: 'Search-engine dorks',
    blurb: 'Google, Bing, DuckDuckGo, Yandex, Wayback Machine',
    icon: Search,
    pillCls: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  identity: {
    label: 'Identity / people-search',
    blurb: 'Gravatar, Pipl, Spokeo, ThatsThem, BeenVerified',
    icon: AtSign,
    pillCls: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
  },
  infra: {
    label: 'Domain / infra',
    blurb: 'Domain inspector, WHOIS, Shodan, Censys, SecurityTrails, crt.sh',
    icon: Network,
    pillCls: 'border-slate-400/40 bg-slate-400/10 text-slate-700 dark:text-slate-300',
  },
};

const KIND_LABEL: Record<PivotInputKind, string> = {
  email: 'email address',
  domain: 'domain',
  username: 'username',
  handle: 'handle (@x)',
  name: 'name / free text',
};

const SAMPLES: { label: string; value: string }[] = [
  { label: 'Email', value: 'jane.doe@example.com' },
  { label: 'Domain', value: 'example.com' },
  { label: 'Handle', value: '@vitalik' },
  { label: 'Name', value: 'Linus Torvalds' },
];

export default function Socmint(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [input, setInput] = useState(searchParams.get('q') ?? '');
  const [activeCategories, setActiveCategories] = useState<Set<PivotCategory>>(new Set());
  const [includePaid, setIncludePaid] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const initialDone = useRef(false);

  const value = input.trim();
  const kind = useMemo<PivotInputKind | null>(() => (value ? detectKind(value) : null), [value]);

  const matchingPivots = useMemo<PivotLink[]>(() => {
    if (!value || !kind) return [];
    return PIVOTS.filter((p) => p.appliesTo.includes(kind))
      .filter((p) => includePaid || !p.paid)
      .filter((p) => activeCategories.size === 0 || activeCategories.has(p.category));
  }, [value, kind, includePaid, activeCategories]);

  const grouped = useMemo(() => {
    const out: Partial<Record<PivotCategory, PivotLink[]>> = {};
    for (const p of matchingPivots) {
      const list = out[p.category] ?? [];
      list.push(p);
      out[p.category] = list;
    }
    return out;
  }, [matchingPivots]);

  const categoriesAvailable = useMemo<PivotCategory[]>(() => {
    if (!value || !kind) return [];
    const set = new Set<PivotCategory>();
    for (const p of PIVOTS) if (p.appliesTo.includes(kind)) set.add(p.category);
    return [...set];
  }, [value, kind]);

  // Sync ?q= into URL (debounced via the controlled-input pattern is OK here).
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set('q', value);
        else next.delete('q');
        return next;
      },
      { replace: true }
    );
  }, [value, setSearchParams]);

  // Auto-trigger from ?q= on mount.
  useEffect(() => {
    if (initialDone.current) return;
    if (searchParams.get('q')) {
      initialDone.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCategory = (c: PivotCategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const copyAll = async () => {
    const blob = matchingPivots.map((p) => p.build(value)).join('\n');
    await navigator.clipboard.writeText(blob);
    setCopied('all');
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Users size={28} className="text-brand-600 dark:text-brand-400" /> SOCMINT Pivots
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 max-w-3xl leading-relaxed">
          Paste an email, domain, username, handle, or name. You get a categorised list of OSINT lookup links across
          breach, B2B contact databases (ZoomInfo, Apollo, Hunter, RocketReach…), social, dev, paste-site dorks,
          search-engine dorks, identity, and infra. URL-only; no scraping.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-8">
          Pairs with{' '}
          <Link to="/dfir/breach" className="text-brand-600 dark:text-brand-400 hover:underline">
            Breach Checker
          </Link>{' '}
          (HIBP-style direct lookups),{' '}
          <Link to="/dfir/domain" className="text-brand-600 dark:text-brand-400 hover:underline">
            Domain Inspector
          </Link>{' '}
          (SPF/DKIM/DMARC), and{' '}
          <Link to="/dfir/username" className="text-brand-600 dark:text-brand-400 hover:underline">
            Username Pivot
          </Link>{' '}
          (50+ services). Paid tools tagged with <Lock size={9} className="inline" />.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="email / domain / @handle / username / name"
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {kind && (
            <span className="self-center text-[11px] font-mono uppercase tracking-wider text-brand-600 dark:text-brand-400">
              detected: {KIND_LABEL[kind]}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 self-center mr-1">samples:</span>
          {SAMPLES.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setInput(s.value)}
              className="text-[11px] font-mono px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      {value && kind === 'email' && (
        <div className="mb-4 rounded border border-amber-500/30 bg-amber-500/5 p-3 text-[12px] font-mono text-amber-700 dark:text-amber-300">
          <strong>Email → LinkedIn is heuristic.</strong> There is no free, deterministic, TOS-compliant way to map an
          email to a LinkedIn profile. The pivots below derive a probable name from the email local-part (e.g.{' '}
          <code>jane.doe@acme.com</code> → "Jane Doe" + company "acme") and generate Google site-search dorks + probable
          LinkedIn URL guesses. <strong>Verify before quoting.</strong> Paid services (Hunter, ContactOut, RocketReach,
          Apollo) under "B2B / data brokers" do this properly.
        </div>
      )}

      {value && categoriesAvailable.length > 0 && (
        <section className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-[11px] font-mono text-slate-500 mr-1">filter:</span>
          {categoriesAvailable.map((c) => {
            const meta = CATEGORY_META[c];
            const Icon = meta.icon;
            const active = activeCategories.size === 0 || activeCategories.has(c);
            const count = grouped[c]?.length ?? 0;
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleCategory(c)}
                className={`text-[11px] font-mono px-2 py-1 rounded border inline-flex items-center gap-1 ${
                  active ? meta.pillCls : 'border-slate-200 dark:border-slate-800 text-slate-500'
                }`}
                title={meta.blurb}
              >
                <Icon size={10} />
                {meta.label} {count > 0 && <span className="opacity-60">· {count}</span>}
              </button>
            );
          })}
          <label className="text-[11px] font-mono text-slate-500 dark:text-slate-400 cursor-pointer inline-flex items-center gap-1.5 ml-auto">
            <input type="checkbox" checked={includePaid} onChange={(e) => setIncludePaid(e.target.checked)} />
            include paid services
          </label>
          {matchingPivots.length > 0 && (
            <button
              type="button"
              onClick={() => void copyAll()}
              className="text-[11px] font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-brand-500/40 inline-flex items-center gap-1"
            >
              {copied === 'all' ? <Check size={11} /> : <Clipboard size={11} />}
              {copied === 'all' ? 'copied URLs' : 'copy all URLs'}
            </button>
          )}
        </section>
      )}

      {value && matchingPivots.length === 0 && (
        <p className="text-sm font-mono text-slate-500 dark:text-slate-400 mb-6">
          No pivots match this input shape with the current filters.
        </p>
      )}

      <div className="space-y-6">
        {(Object.keys(grouped) as PivotCategory[]).map((cat) => {
          const list = grouped[cat]!;
          const meta = CATEGORY_META[cat];
          const Icon = meta.icon;
          return (
            <section
              key={cat}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <span
                  className={`inline-flex items-center gap-1 text-xs font-mono px-2 py-1 rounded border ${meta.pillCls}`}
                >
                  <Icon size={10} /> {meta.label}
                </span>
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{meta.blurb}</span>
              </div>
              <ul className="grid sm:grid-cols-2 gap-2">
                {list.map((p) => {
                  const url = p.build(value);
                  const internal = url.startsWith('/');
                  return (
                    <li key={`${cat}-${p.label}`}>
                      {internal ? (
                        <Link
                          to={url}
                          className="block rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 hover:border-brand-500/40"
                        >
                          <PivotInner pivot={p} url={url} internal />
                        </Link>
                      ) : (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 hover:border-brand-500/40"
                        >
                          <PivotInner pivot={p} url={url} internal={false} />
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {value && (
        <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-8">
          {matchingPivots.length} pivot{matchingPivots.length === 1 ? '' : 's'} for {KIND_LABEL[kind!]}. Input shape
          detected as <code>{kind}</code>. Pivots are URL templates; nothing about your input is sent anywhere except
          the destination service when you click a link.
        </p>
      )}
    </div>
  );
}

function PivotInner({ pivot, url, internal }: { pivot: PivotLink; url: string; internal: boolean }): JSX.Element {
  return (
    <>
      <div className="flex items-baseline justify-between gap-2 mb-0.5">
        <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">{pivot.label}</span>
        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500">
          {pivot.paid && (
            <span className="px-1 py-0.5 rounded border border-amber-500/40 text-amber-700 dark:text-amber-300">
              <Lock size={9} className="inline" /> paid
            </span>
          )}
          {pivot.signupRequired && !pivot.paid && (
            <span className="px-1 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-500">
              signup
            </span>
          )}
          {internal ? <Globe2 size={10} /> : <ExternalLink size={10} />}
        </span>
      </div>
      <span className="block text-[11px] font-mono text-slate-500 dark:text-slate-400">{pivot.blurb}</span>
      <span className="block text-[10px] font-mono text-slate-400 dark:text-slate-600 truncate mt-1">{url}</span>
    </>
  );
}
