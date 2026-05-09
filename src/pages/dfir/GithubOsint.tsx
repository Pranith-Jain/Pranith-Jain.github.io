import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Github,
  Search,
  Loader2,
  ExternalLink,
  AlertTriangle,
  Mail,
  Calendar,
  Star,
  GitFork,
  Users,
  Building2,
  MapPin,
} from 'lucide-react';
import { motion } from 'framer-motion';

interface GithubUser {
  login: string;
  id: number;
  type: 'User' | 'Organization';
  name?: string | null;
  company?: string | null;
  blog?: string | null;
  location?: string | null;
  email?: string | null;
  hireable?: boolean | null;
  bio?: string | null;
  twitter_username?: string | null;
  public_repos: number;
  public_gists: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
  avatar_url: string;
  html_url: string;
}

interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  fork: boolean;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  pushed_at: string;
  archived: boolean;
}

interface GithubEvent {
  id: string;
  type: string;
  repo: { name: string; url: string };
  created_at: string;
}

interface CommitAuthor {
  email: string;
  name: string;
  repo: string;
}

const USERNAME_RE = /^[A-Za-z0-9-]{1,39}$/;

function fmtDate(s: string): string {
  return new Date(s).toISOString().slice(0, 10);
}

function eventTypeLabel(t: string): string {
  return t
    .replace(/Event$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();
}

function isLikelyRealEmail(e: string): boolean {
  if (!e) return false;
  const lower = e.toLowerCase();
  if (lower.endsWith('@users.noreply.github.com')) return false;
  if (lower === 'noreply@github.com') return false;
  return /@/.test(lower);
}

export default function GithubOsint(): JSX.Element {
  const [username, setUsername] = useState('');
  const [user, setUser] = useState<GithubUser | null>(null);
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [events, setEvents] = useState<GithubEvent[]>([]);
  const [emails, setEmails] = useState<CommitAuthor[]>([]);
  const [emailsScanned, setEmailsScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scanningEmails, setScanningEmails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validUsername = USERNAME_RE.test(username.trim());

  const lookup = async () => {
    const u = username.trim();
    if (!USERNAME_RE.test(u)) return;
    setLoading(true);
    setError(null);
    setUser(null);
    setRepos([]);
    setEvents([]);
    setEmails([]);
    setEmailsScanned(false);

    try {
      const userRes = await fetch(`https://api.github.com/users/${encodeURIComponent(u)}`);
      if (userRes.status === 404) throw new Error(`User '${u}' not found`);
      if (userRes.status === 403) throw new Error('GitHub rate-limit hit (60/hour for unauthenticated). Try later.');
      if (!userRes.ok) throw new Error(`HTTP ${userRes.status}`);
      const userJson = (await userRes.json()) as GithubUser;
      setUser(userJson);

      const [reposRes, eventsRes] = await Promise.all([
        fetch(`https://api.github.com/users/${encodeURIComponent(u)}/repos?per_page=100&sort=pushed&direction=desc`),
        fetch(`https://api.github.com/users/${encodeURIComponent(u)}/events/public?per_page=30`),
      ]);
      if (reposRes.ok) setRepos((await reposRes.json()) as GithubRepo[]);
      if (eventsRes.ok) setEvents((await eventsRes.json()) as GithubEvent[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const scanCommitEmails = async () => {
    if (!user) return;
    setScanningEmails(true);
    try {
      // Pick the top 3 non-fork, non-archived repos by recent push
      const candidates = repos
        .filter((r) => !r.fork && !r.archived)
        .sort((a, b) => b.pushed_at.localeCompare(a.pushed_at))
        .slice(0, 3);
      const seen = new Map<string, CommitAuthor>();
      for (const r of candidates) {
        try {
          const res = await fetch(
            `https://api.github.com/repos/${encodeURIComponent(r.full_name)}/commits?author=${encodeURIComponent(user.login)}&per_page=30`
          );
          if (!res.ok) continue;
          const commits = (await res.json()) as Array<{
            commit: { author: { email?: string; name?: string }; committer: { email?: string; name?: string } };
          }>;
          for (const c of commits) {
            for (const a of [c.commit.author, c.commit.committer]) {
              const email = a?.email ?? '';
              if (!isLikelyRealEmail(email)) continue;
              const k = `${email}|${r.full_name}`;
              if (!seen.has(k)) {
                seen.set(k, { email, name: a?.name ?? '', repo: r.full_name });
              }
            }
          }
        } catch {
          /* ignore one repo failing */
        }
      }
      setEmails([...seen.values()]);
      setEmailsScanned(true);
    } finally {
      setScanningEmails(false);
    }
  };

  const topRepos = useMemo(
    () =>
      [...repos]
        .filter((r) => !r.fork)
        .sort((a, b) => b.stargazers_count - a.stargazers_count)
        .slice(0, 8),
    [repos]
  );

  const languages = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of repos) if (r.language) m.set(r.language, (m.get(r.language) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [repos]);

  return (
    <div className="max-w-6xl mx-auto px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /dfir
      </Link>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Github size={28} className="text-brand-600 dark:text-brand-400" /> GitHub Recon
        </h1>
        <p className="text-slate-600 dark:text-slate-400 font-mono mb-2">
          Profile metadata, top repos, languages, recent activity — and an opt-in scan for emails leaked via commit
          metadata. Public unauthenticated GitHub API; rate-limited at 60 requests/hour per IP.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-8">
          Pairs with{' '}
          <Link to="/dfir/username" className="text-brand-600 dark:text-brand-400 hover:underline">
            Username Pivot
          </Link>{' '}
          and{' '}
          <Link to="/dfir/wayback" className="text-brand-600 dark:text-brand-400 hover:underline">
            Wayback Machine
          </Link>
          .
        </p>
      </motion.div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void lookup();
          }}
          className="flex flex-wrap gap-2"
        >
          <div className="relative flex-1 min-w-[220px]">
            <Github size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username or org (e.g. anthropics)"
              className="w-full pl-9 pr-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-sm focus:border-brand-500/60 focus:outline-none"
              aria-label="GitHub username"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <button
            type="submit"
            disabled={!validUsername || loading}
            className="text-sm font-mono px-3 py-2 rounded border border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300 hover:border-brand-500 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {loading ? 'Loading' : 'Lookup'}
          </button>
        </form>
        {error && (
          <p className="mt-2 text-xs font-mono text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5">
            <AlertTriangle size={12} /> {error}
          </p>
        )}
      </section>

      {user && (
        <>
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
            <div className="flex items-start gap-4">
              <img
                src={user.avatar_url}
                alt=""
                width={64}
                height={64}
                className="rounded-lg border border-slate-200 dark:border-slate-800"
                referrerPolicy="no-referrer"
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2 mb-1">
                  <a
                    href={user.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-display font-bold text-xl text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1"
                  >
                    {user.name || user.login} <ExternalLink size={12} />
                  </a>
                  <span className="text-sm font-mono text-slate-500 dark:text-slate-500">@{user.login}</span>
                  <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-brand-500/30 bg-brand-500/10 text-brand-700 dark:text-brand-300">
                    {user.type}
                  </span>
                </div>
                {user.bio && <p className="text-sm font-mono text-slate-700 dark:text-slate-300 mb-2">{user.bio}</p>}
                <div className="flex flex-wrap gap-3 text-[12px] font-mono text-slate-600 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <Calendar size={11} /> joined {fmtDate(user.created_at)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users size={11} /> {user.followers} followers · {user.following} following
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Star size={11} /> {user.public_repos} repos · {user.public_gists} gists
                  </span>
                  {user.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={11} /> {user.location}
                    </span>
                  )}
                  {user.company && (
                    <span className="inline-flex items-center gap-1">
                      <Building2 size={11} /> {user.company}
                    </span>
                  )}
                  {user.email && (
                    <a
                      href={`mailto:${user.email}`}
                      className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      <Mail size={11} /> {user.email}
                    </a>
                  )}
                  {user.blog && (
                    <a
                      href={user.blog.startsWith('http') ? user.blog : `https://${user.blog}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      <ExternalLink size={11} /> {user.blog}
                    </a>
                  )}
                  {user.twitter_username && (
                    <a
                      href={`https://x.com/${user.twitter_username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      @{user.twitter_username}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </section>

          {languages.length > 0 && (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
                Top languages
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {languages.map(([lang, n]) => (
                  <span
                    key={lang}
                    className="text-[11px] font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  >
                    {lang} <span className="opacity-60">· {n}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {topRepos.length > 0 && (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
                Top repositories ({topRepos.length} of {repos.length})
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {topRepos.map((r) => (
                  <li
                    key={r.id}
                    className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5"
                  >
                    <div className="flex flex-wrap items-baseline gap-2 mb-1">
                      <a
                        href={r.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400"
                      >
                        {r.name}
                      </a>
                      {r.archived && (
                        <span className="text-[9px] font-mono uppercase tracking-wider px-1 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                          archived
                        </span>
                      )}
                      {r.language && (
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-500">{r.language}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-500 dark:text-slate-500 mb-1">
                      <span className="inline-flex items-center gap-1">
                        <Star size={11} /> {r.stargazers_count}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <GitFork size={11} /> {r.forks_count}
                      </span>
                      <span className="text-slate-400 dark:text-slate-600">pushed {fmtDate(r.pushed_at)}</span>
                    </div>
                    {r.description && (
                      <p className="text-[11px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">
                        {r.description}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {events.length > 0 && (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
                Recent activity ({events.length})
              </h2>
              <ul className="space-y-1">
                {events.slice(0, 12).map((ev) => (
                  <li key={ev.id} className="text-[12px] font-mono flex flex-wrap items-baseline gap-2">
                    <span className="text-slate-500 dark:text-slate-500 w-20 inline-block">
                      {fmtDate(ev.created_at)}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                      {eventTypeLabel(ev.type)}
                    </span>
                    <a
                      href={`https://github.com/${ev.repo.name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      {ev.repo.name}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Email scan */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono">
                Commit-author email scan
              </h2>
              {!emailsScanned && (
                <button
                  onClick={() => void scanCommitEmails()}
                  disabled={scanningEmails || repos.length === 0}
                  className="text-xs font-mono px-2 py-1 rounded border border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300 hover:border-brand-500 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {scanningEmails ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
                  {scanningEmails ? 'Scanning…' : 'Scan top 3 repos'}
                </button>
              )}
            </div>
            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-500 mb-3">
              Reads the latest 30 commits from each of the top 3 non-fork, non-archived repos and surfaces author /
              committer emails. Skips <code>noreply.github.com</code> placeholders. Costs roughly 4 GitHub API calls
              against the 60/h unauthenticated quota.
            </p>
            {emailsScanned && emails.length === 0 && (
              <p className="text-[12px] font-mono text-slate-600 dark:text-slate-400 inline-flex items-center gap-1.5">
                No real emails found — the user has the "Keep my email addresses private" setting enabled, or all
                commits use noreply addresses. That's good operational hygiene.
              </p>
            )}
            {emails.length > 0 && (
              <ul className="space-y-1.5">
                {emails.map((e, i) => (
                  <li key={`${e.email}-${i}`} className="flex flex-wrap items-baseline gap-2 text-[12px] font-mono">
                    <a
                      href={`mailto:${e.email}`}
                      className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
                    >
                      <Mail size={11} /> {e.email}
                    </a>
                    {e.name && <span className="text-slate-700 dark:text-slate-300">{e.name}</span>}
                    <span className="text-slate-500 dark:text-slate-500">via {e.repo}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {!user && !loading && !error && (
        <section className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm font-mono text-slate-500 dark:text-slate-500">
          Enter a GitHub username or organisation to begin.
        </section>
      )}
    </div>
  );
}
