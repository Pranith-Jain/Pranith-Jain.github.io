import { useMemo, useState, useEffect, useRef } from 'react';
import { Search, ExternalLink, Copy, Check, RotateCcw, Send, Filter } from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import {
  PLATFORMS,
  CATEGORIES,
  detectInputKind,
  fillTemplate,
  type DetectedKind,
  type Platform,
  type Placeholder,
} from '../../lib/dfir/multi-search/platforms';

/**
 * /dfir/multi-search — fan out a single query across 60+ OSINT platforms.
 *
 * The user pastes one piece of intel (email, IP, username, hash, CVE,
 * BTC address, etc.) and the page auto-detects the kind, fills URL
 * templates, and opens every relevant platform in a parallel new tab.
 * Pure frontend: no API keys, no rate limits, no server cost.
 *
 * State model:
 *   - `autoSelected`: re-computed whenever the input kind changes; this
 *     is the "default" set of platforms for the current kind.
 *   - `manualOverrides`: the platforms the user has manually toggled
 *     on or off (e.g. they want all the "web" category platforms
 *     unchecked, or they want a specific platform added even though
 *     it's not auto-selected).
 *   - `activePlatforms` (derived): union of autoSelected + manualOverrides.
 *     This separation matters — the previous implementation re-built
 *     the active set on every input change, which silently undid the
 *     user's manual toggles.
 *
 * "Open all selected" opens each platform sequentially with a small
 * delay so the browser doesn't coalesce popups into a single
 * blocked-permission dialog. A cancellation ref lets the user bail
 * out (and prevents open() calls after unmount).
 */

const FAVORITES_KEY = 'dfir.multi-search.favorites:v1';

function loadFavorites(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

function saveFavorites(f: Set<string>): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...f]));
  } catch {
    /* quota */
  }
}

const KIND_LABEL: Record<DetectedKind, string> = {
  email: 'Email',
  ip: 'IPv4 / IPv6',
  domain: 'Domain',
  url: 'URL',
  hash: 'File hash',
  cve: 'CVE ID',
  btc: 'Crypto address',
  phone: 'Phone number',
  username: 'Username',
  q: 'Free-text',
};

const KIND_PLACEHOLDER: Record<DetectedKind, string> = {
  email: 'user@example.com',
  ip: '8.8.8.8',
  domain: 'example.com',
  url: 'https://example.com/article',
  hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  cve: 'CVE-2024-12345',
  btc: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  phone: '+1 555 123 4567',
  username: 'octocat',
  q: 'OSINT methodology blog',
};

/** Map a detected kind onto the placeholder slot the template uses. */
function kindToPlaceholder(kind: DetectedKind): Placeholder {
  switch (kind) {
    case 'email':
      return 'email';
    case 'ip':
      return 'ip';
    case 'domain':
      return 'domain';
    case 'url':
      return 'url';
    case 'hash':
      return 'hash';
    case 'cve':
      return 'cve';
    case 'btc':
      return 'btc';
    case 'phone':
      return 'phone';
    case 'username':
      return 'username';
    case 'q':
      return 'q';
  }
}

/** Build the auto-selected set for a given kind + favorites. Pure
 *  function so the auto-select effect is referentially stable. */
function buildAutoSelected(kind: DetectedKind, input: string, favorites: Set<string>): Set<string> {
  const next = new Set<string>();
  if (!input.trim()) return next;
  const primary = kindToPlaceholder(kind);
  for (const p of PLATFORMS) {
    if (p.required.includes(primary)) {
      if (!p.autoMatch || (kind !== 'q' && p.autoMatch.includes(kind as (typeof p.autoMatch)[number]))) {
        next.add(p.id);
      }
    }
  }
  for (const id of favorites) {
    const p = PLATFORMS.find((x) => x.id === id);
    if (!p) continue;
    if (p.required.every((r) => (r === primary ? !!input.trim() : true))) {
      next.add(id);
    }
  }
  return next;
}

export default function MultiSearch(): JSX.Element {
  const [input, setInput] = useState('');
  const [kind, setKind] = useState<DetectedKind>('q');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set(CATEGORIES.map((c) => c.id)));
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const [autoSelected, setAutoSelected] = useState<Set<string>>(new Set());
  /** Manual add/remove keyed by platform id. The value is the desired
   *  state — true = force-on, false = force-off. The union with
   *  autoSelected is the live activePlatforms set. */
  const [manualOverrides, setManualOverrides] = useState<Map<string, boolean>>(new Map());
  const [popupStatus, setPopupStatus] = useState<{ opened: number; blocked: number } | null>(null);
  const cancelOpenRef = useRef(false);

  // Auto-detect kind as the user types.
  useEffect(() => {
    const trimmed = input.trim();
    if (!trimmed) {
      setKind('q');
      return;
    }
    setKind(detectInputKind(trimmed));
  }, [input]);

  // Auto-select when the kind or favorites change. Manual overrides
  // are NOT touched here — that was the bug in v1.
  useEffect(() => {
    setAutoSelected(buildAutoSelected(kind, input, favorites));
  }, [kind, input, favorites]);

  // Resolve the live active set: union of auto + manual on, minus
  // manual off.
  const activePlatforms = useMemo(() => {
    const next = new Set(autoSelected);
    for (const [id, on] of manualOverrides) {
      if (on) next.add(id);
      else next.delete(id);
    }
    return next;
  }, [autoSelected, manualOverrides]);

  // Build the filled URL for a platform, given the current input.
  function buildUrl(p: Platform): string {
    const primary = kindToPlaceholder(kind);
    const inputs: Partial<Record<Placeholder, string>> = {};
    if (input.trim()) inputs[primary] = input.trim();
    return fillTemplate(p.url, inputs);
  }

  const filteredPlatforms = PLATFORMS.filter((p) => selectedCategories.has(p.category));
  const readyPlatforms = filteredPlatforms.filter((p) => activePlatforms.has(p.id));
  const unfilledPlatforms = filteredPlatforms.filter((p) => !activePlatforms.has(p.id));

  function toggleCategory(cat: string): void {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  /** Toggle a platform: explicit on / explicit off, regardless of the
   *  auto-select set. The override is sticky across kind changes so
   *  the user can mark "always include Shodan Cert" or "always
   *  exclude LinkedIn". */
  function togglePlatform(id: string): void {
    setManualOverrides((prev) => {
      const next = new Map(prev);
      const current = activePlatforms.has(id);
      next.set(id, !current);
      return next;
    });
  }

  function toggleFavorite(id: string): void {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveFavorites(next);
      return next;
    });
  }

  function selectAllReady(): void {
    setManualOverrides((prev) => {
      const next = new Map(prev);
      for (const p of filteredPlatforms) next.set(p.id, true);
      return next;
    });
  }

  function selectNone(): void {
    setManualOverrides((prev) => {
      const next = new Map(prev);
      for (const p of filteredPlatforms) next.set(p.id, false);
      return next;
    });
  }

  function clearOverrides(): void {
    setManualOverrides(new Map());
  }

  /** Open all selected platforms, staggered so the browser doesn't
   *  collapse them into one blocked-popup dialog. Catches popup
   *  blocker rejection: `window.open` returns `null` when blocked. */
  async function openAll(): Promise<void> {
    cancelOpenRef.current = false;
    const urls = readyPlatforms.map((p) => ({ name: p.name, url: buildUrl(p) })).filter((x) => !x.url.includes('{'));
    let opened = 0;
    let blocked = 0;
    for (const { url } of urls) {
      if (cancelOpenRef.current) break;
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (win) opened++;
      else blocked++;
      // Stagger — most browsers cap unprompted popups at ~1-2 if
      // the user hasn't clicked recently; 250ms is the standard
      // pattern for "user-initiated multi-open".
      await new Promise((r) => setTimeout(r, 250));
    }
    setPopupStatus({ opened, blocked });
  }

  function cancelOpen(): void {
    cancelOpenRef.current = true;
  }

  // Clear the popup status banner after a few seconds.
  useEffect(() => {
    if (!popupStatus) return;
    const t = setTimeout(() => setPopupStatus(null), 5000);
    return () => clearTimeout(t);
  }, [popupStatus]);

  function copyAll(): void {
    const text = readyPlatforms
      .map((p) => `${p.name}: ${buildUrl(p)}`)
      .filter((line) => !line.includes('{'))
      .join('\n');
    void navigator.clipboard.writeText(text);
  }

  function reset(): void {
    setInput('');
    setKind('q');
    setManualOverrides(new Map());
    setAutoSelected(new Set());
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono transition-colors"
      >
        ← back to DFIR
      </BackLink>

      <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
        <span className="text-brand-600 dark:text-brand-400">
          <Search size={32} />
        </span>
        Multi-Search Launcher
      </h1>
      <p className="text-muted max-w-2xl leading-relaxed mb-8">
        Fan out a single indicator across {PLATFORMS.length}+ OSINT platforms in parallel. Type a value, the page
        auto-detects the kind and pre-selects every matching tool. Pure frontend — no API keys, no rate limits, no
        server cost.
      </p>

      {/* ── Input row ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2">
          <span className="block text-xs font-mono text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
            Indicator
          </span>
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={KIND_PLACEHOLDER[kind]}
              spellCheck={false}
              autoComplete="off"
              aria-label="Indicator value"
              className="flex-1 px-4 py-3 rounded-xl border border-slate-300 dark:border-[#1e2030] bg-white dark:bg-[#12121a] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {input && (
              <button
                type="button"
                onClick={reset}
                className="p-3 rounded-xl border border-slate-300 dark:border-[#1e2030] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                aria-label="Reset"
                title="Reset"
              >
                <RotateCcw size={16} />
              </button>
            )}
          </div>
          {input && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-slate-500">Detected:</span>
              <span className="px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-700 dark:text-brand-300 font-mono">
                {KIND_LABEL[kind]}
              </span>
            </div>
          )}
        </div>

        <div>
          <span className="block text-xs font-mono text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
            Categories
          </span>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => {
              const on = selectedCategories.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCategory(c.id)}
                  className={`px-2.5 py-1 text-xs font-mono rounded-full border transition-colors ${
                    on
                      ? 'bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300'
                      : 'bg-slate-100 dark:bg-slate-800/50 border-slate-300 dark:border-[#1e2030] text-slate-500'
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Action bar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          type="button"
          onClick={openAll}
          disabled={readyPlatforms.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Send size={16} /> Open {readyPlatforms.length} tab{readyPlatforms.length === 1 ? '' : 's'}
        </button>
        <button
          type="button"
          onClick={copyAll}
          disabled={readyPlatforms.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-[#1e2030] hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Copy size={16} /> Copy all URLs
        </button>
        <button
          type="button"
          onClick={selectAllReady}
          disabled={filteredPlatforms.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-300 dark:border-[#1e2030] hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-mono disabled:opacity-40"
        >
          Select all
        </button>
        <button
          type="button"
          onClick={selectNone}
          disabled={filteredPlatforms.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-300 dark:border-[#1e2030] hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-mono disabled:opacity-40"
        >
          Deselect all
        </button>
        {manualOverrides.size > 0 && (
          <button
            type="button"
            onClick={clearOverrides}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-300 dark:border-[#1e2030] hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-mono text-amber-600 dark:text-amber-400"
            title={`${manualOverrides.size} manual override${manualOverrides.size === 1 ? '' : 's'} active — click to clear`}
          >
            Clear {manualOverrides.size} override{manualOverrides.size === 1 ? '' : 's'}
          </button>
        )}
        {popupStatus && popupStatus.blocked > 0 && (
          <button
            type="button"
            onClick={cancelOpen}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-rose-500/40 text-rose-400 text-xs font-mono"
            title="Stop opening more tabs"
          >
            <Filter size={12} /> Stop ({popupStatus.opened} opened, {popupStatus.blocked} blocked)
          </button>
        )}
        <span className="text-xs text-slate-500 ml-auto">
          {favorites.size > 0 && `${favorites.size} favorite${favorites.size === 1 ? '' : 's'} · `}
          {PLATFORMS.length} platforms total · {readyPlatforms.length} active
        </span>
      </div>

      {popupStatus && (
        <div
          role="status"
          className={`mb-6 rounded-lg border px-3 py-2 text-xs font-mono ${
            popupStatus.blocked > 0
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          {popupStatus.blocked > 0
            ? `Opened ${popupStatus.opened} tab(s); ${popupStatus.blocked} were blocked by the browser's popup blocker. Allow popups for this origin and try again, or use "Copy all URLs" to paste the links manually.`
            : `Opened ${popupStatus.opened} tab(s) successfully.`}
        </div>
      )}

      {/* ── Selected (ready) platforms ─────────────────────────── */}
      {readyPlatforms.length > 0 && (
        <section className="mb-10">
          <h2 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
            <Filter size={14} /> Ready ({readyPlatforms.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {readyPlatforms.map((p) => (
              <PlatformCard
                key={p.id}
                platform={p}
                url={buildUrl(p)}
                active
                favorite={favorites.has(p.id)}
                isManual={manualOverrides.get(p.id) === true}
                onToggle={() => togglePlatform(p.id)}
                onFavorite={() => toggleFavorite(p.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Other (inactive) platforms ─────────────────────────── */}
      {unfilledPlatforms.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400 mb-3">
            Other ({unfilledPlatforms.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 opacity-60">
            {unfilledPlatforms.map((p) => (
              <PlatformCard
                key={p.id}
                platform={p}
                url={buildUrl(p)}
                active={false}
                favorite={favorites.has(p.id)}
                isManual={manualOverrides.get(p.id) === false}
                onToggle={() => togglePlatform(p.id)}
                onFavorite={() => toggleFavorite(p.id)}
              />
            ))}
          </div>
        </section>
      )}

      {readyPlatforms.length === 0 && unfilledPlatforms.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-[#1e2030] p-8 text-center text-sm text-slate-500">
          Type an indicator above to start. Enable a category to populate the list.
        </div>
      )}
    </div>
  );
}

/* ── Card ─────────────────────────────────────────────────────────── */

interface PlatformCardProps {
  platform: Platform;
  url: string;
  active: boolean;
  favorite: boolean;
  isManual: boolean;
  onToggle: () => void;
  onFavorite: () => void;
}

function PlatformCard({
  platform,
  url,
  active,
  favorite,
  isManual,
  onToggle,
  onFavorite,
}: PlatformCardProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const hasUnfilled = url.includes('{');

  function copy(): void {
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className={`group rounded-xl border p-3 transition-all ${
        active && !hasUnfilled
          ? isManual
            ? 'border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10'
            : 'border-brand-500/40 bg-brand-500/5 hover:bg-brand-500/10'
          : isManual
            ? 'border-amber-500/30 bg-amber-500/5 opacity-60'
            : 'border-slate-200 dark:border-[#1e2030] bg-white/40 dark:bg-[#12121a]/40'
      }`}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={active}
          onChange={onToggle}
          className="mt-1.5"
          aria-label={`Include ${platform.name}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-sm truncate">{platform.name}</span>
            {isManual && (
              <span
                className="text-[9px] font-mono px-1 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300"
                title="Manually toggled"
              >
                manual
              </span>
            )}
            <button
              type="button"
              onClick={onFavorite}
              className={`text-sm ${favorite ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'} transition-colors`}
              aria-label={favorite ? 'Unfavorite' : 'Favorite'}
              title={favorite ? 'Unfavorite' : 'Add to favorites'}
            >
              {favorite ? '★' : '☆'}
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-snug">{platform.description}</p>
          {hasUnfilled && (
            <p className="text-[10px] font-mono text-amber-600 dark:text-amber-400 mt-1">
              missing:{' '}
              {Array.from(url.matchAll(/\{(\w+)\}/g))
                .map((m) => m[1])
                .join(', ')}
            </p>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1">
        <a
          href={hasUnfilled ? undefined : url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (hasUnfilled) e.preventDefault();
          }}
          className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
            hasUnfilled
              ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              : 'bg-brand-600 hover:bg-brand-700 text-white'
          }`}
        >
          <ExternalLink size={11} /> Open
        </a>
        <button
          type="button"
          onClick={copy}
          className="p-1.5 rounded-md border border-slate-300 dark:border-[#1e2030] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          aria-label="Copy URL"
          title="Copy URL"
        >
          {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
        </button>
      </div>
    </div>
  );
}
