import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, ExternalLink, Loader2, Users, Globe, Code2, BookOpen, Briefcase, Gamepad2 } from 'lucide-react';
import { CopyChip } from '../../components/dfir/CopyButton';
import { PLATFORMS, CATEGORY_LABELS, type IdentityProfile, type PlatformDef } from '../../lib/dfir/identity-lookup';

const CAT_ICONS: Record<string, typeof Code2> = {
  dev: Code2,
  social: Users,
  gaming: Gamepad2,
  creative: BookOpen,
  professional: Briefcase,
};

const USERNAME_RE = /^[A-Za-z0-9_.-]{1,40}$/;

function ProfileCard({ profile, platform }: { profile: IdentityProfile; platform: PlatformDef }) {
  const CatIcon = CAT_ICONS[platform.category] ?? Globe;
  return (
    <div className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a]/40 shadow-e1 p-3 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
      <div className="flex items-start gap-3">
        <div className="shrink-0">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt=""
              className="w-10 h-10 rounded-full border border-slate-200 dark:border-[#1e2030]"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-lg text-slate-400">
              {platform.icon}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">
              {profile.displayName ?? profile.username}
            </span>
            <span className="text-micro font-mono text-slate-500">@{profile.username}</span>
            <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center gap-1">
              <CatIcon size={10} /> {CATEGORY_LABELS[platform.category] ?? platform.category}
            </span>
          </div>
          <div className="text-mini font-mono text-muted mt-1 leading-relaxed line-clamp-2">
            {profile.bio ?? 'No bio'}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-micro font-mono text-slate-500 flex-wrap">
            {profile.followers !== undefined && <span>↑ {profile.followers} followers</span>}
            {profile.following !== undefined && <span>↓ {profile.following} following</span>}
            {profile.publicRepos !== undefined && <span>⊞ {profile.publicRepos} repos</span>}
            {profile.location && <span>📍 {profile.location}</span>}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <a
              href={profile.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-micro font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              {profile.profileUrl} <ExternalLink size={9} />
            </a>
            <CopyChip value={profile.profileUrl} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function IdentityLookup(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [profiles, setProfiles] = useState<Map<string, IdentityProfile | null>>(new Map());
  const [running, setRunning] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [doneCount, setDoneCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const validQuery = USERNAME_RE.test(query.trim());

  const startLookup = async (override?: string) => {
    const q = (override ?? query).trim().toLowerCase();
    if (!USERNAME_RE.test(q)) return;
    if (override) setQuery(override);
    setSearchParams({ q }, { replace: false });
    setRunning(true);
    setDoneCount(0);
    setProfiles(new Map());

    const concurrency = 4;
    for (let i = 0; i < PLATFORMS.length; i += concurrency) {
      const batch = PLATFORMS.slice(i, i + concurrency);
      const settled = await Promise.all(batch.map(async (p) => ({ id: p.id, result: await p.fetch(q) })));
      setProfiles((prev) => {
        const next = new Map(prev);
        for (const s of settled) next.set(s.id, s.result);
        return next;
      });
      setDoneCount((c) => c + batch.length);
    }
    setRunning(false);
  };

  useEffect(() => {
    const initial = searchParams.get('q');
    if (initial && USERNAME_RE.test(initial)) {
      void startLookup(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const entries = PLATFORMS.map((p) => ({ platform: p, profile: profiles.get(p.id) ?? undefined }));
    if (categoryFilter === 'all') return entries;
    return entries.filter((e) => e.platform.category === categoryFilter);
  }, [profiles, categoryFilter]);

  const foundCount = useMemo(() => {
    let n = 0;
    for (const v of profiles.values()) if (v) n++;
    return n;
  }, [profiles]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Search size={28} className="text-brand-600 dark:text-brand-400" /> Identity Lookup
        </h1>
        <p className="text-muted mb-2 leading-relaxed">
          Look up a username across {PLATFORMS.length} platforms and see profile details — avatar, bio, followers,
          repos. All checks run from your browser against public APIs.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-8">
          Inspired by KagamiID. Each platform returns live profile data where available. "Not found" means the username
          is unregistered on that service, or its API is currently rate-limiting.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 p-4 mb-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startLookup();
          }}
          className="flex flex-wrap gap-2"
        >
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="username (letters / digits / . _ -)"
              className="w-full pl-9 pr-3 py-2 rounded border border-slate-300 dark:border-[#1e2030] bg-slate-50 dark:bg-slate-950 font-mono text-sm focus:border-brand-500/60 focus:outline-none"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <button
            type="submit"
            disabled={!validQuery || running}
            className="text-sm font-mono px-3 py-2 rounded border border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300 hover:border-brand-500 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {running ? `Searching (${doneCount}/${PLATFORMS.length})` : 'Search'}
          </button>
        </form>
      </section>

      {/* Results */}
      {profiles.size > 0 && (
        <>
          <section className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 p-4 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-2">
                <Globe size={14} /> Profiles for <span className="text-slate-900 dark:text-slate-100">@{query}</span>
              </h2>
              <span className="text-mini font-mono text-slate-500">
                {foundCount} found · {PLATFORMS.length - foundCount} not found
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setCategoryFilter('all')}
                className={`text-mini font-mono px-2 py-1 rounded border transition-colors ${
                  categoryFilter === 'all'
                    ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                    : 'border-slate-300 dark:border-[#1e2030] text-muted hover:border-brand-500/40'
                }`}
              >
                All ({PLATFORMS.length})
              </button>
              {[...new Set(PLATFORMS.map((p) => p.category))].map((cat) => {
                const count = PLATFORMS.filter((p) => p.category === cat).length;
                const CatIcon = CAT_ICONS[cat] ?? Globe;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`text-mini font-mono px-2 py-1 rounded border transition-colors inline-flex items-center gap-1 ${
                      categoryFilter === cat
                        ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                        : 'border-slate-300 dark:border-[#1e2030] text-muted hover:border-brand-500/40'
                    }`}
                  >
                    <CatIcon size={11} /> {CATEGORY_LABELS[cat] ?? cat} <span className="opacity-60">· {count}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 p-4 mb-6">
            <div className="grid gap-2">
              {filtered.map(({ platform, profile }) =>
                profile ? (
                  <ProfileCard key={platform.id} profile={profile} platform={platform} />
                ) : (
                  <div
                    key={platform.id}
                    className="flex items-center gap-3 rounded border border-slate-200 dark:border-[#1e2030] bg-slate-50 dark:bg-slate-950 p-3"
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-lg text-slate-400">
                      {platform.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-semibold text-sm text-slate-500">{platform.name}</span>
                        <span className="text-micro font-mono text-slate-400">@{query}</span>
                      </div>
                      <p className="text-mini font-mono text-slate-400 mt-0.5">
                        {profiles.get(platform.id) === undefined ? 'Checking...' : 'Not found'}
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        </>
      )}

      <section className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 p-4">
        <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono mb-2">
          Notes
        </h2>
        <ul className="space-y-1.5 text-sm font-mono text-muted list-disc pl-5">
          <li>
            Each platform is checked via its public API — no auth keys, no server proxy. Data is what the API returns.
          </li>
          <li>"Not found" may also mean the API is rate-limiting (GitHub: 60 req/h per IP, Reddit: 60 req/min).</li>
          <li>
            For deeper pivoting on a found identity, use the{' '}
            <Link to="/dfir/socmint" className="text-brand-600 dark:text-brand-400 hover:underline">
              SOCMINT
            </Link>{' '}
            and{' '}
            <Link to="/dfir/username-investigator" className="text-brand-600 dark:text-brand-400 hover:underline">
              Username Pivot
            </Link>{' '}
            tools.
          </li>
        </ul>
      </section>
    </div>
  );
}
