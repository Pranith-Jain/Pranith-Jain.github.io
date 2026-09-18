import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ExternalLink, Search, X, Github, Linkedin, MessageCircle, Filter, Clock, BookOpen, Shield, Code, ChevronDown, Bookmark, Check, Share2, Download, Upload, Trash2, Sparkles } from 'lucide-react';
import {
  courseUrl,
  loadBookmarks,
  loadProgress,
  normalizeCourseId,
  parseLibraryImport,
  saveBookmarks,
  saveProgress,
  serializeLibrary,
  type AnarchyProgress,
} from '../lib/anarchy-library';
import { recommendCourses, similarCourses } from '../lib/anarchy-recommend';

interface AnarchyProvider {
  name: string;
  host: string;
  icon: string;
}
type AnarchyDifficulty = 'beginner' | 'intermediate' | 'advanced';

interface AnarchyCourseSlim {
  id: string;
  title: string;
  href: string;
  img: string | null;
  tags: string[];
  provider: AnarchyProvider;
  difficulty: AnarchyDifficulty;
  hours: number;
  preview: string;
  sizeBytes: number;
}

interface AnarchyIndex {
  source: string;
  url: string;
  coursesUrl: string;
  description: string;
  license: string;
  author: string;
  authorUrl: string;
  syncedAt: string;
  builtAt: string;
  counts: { courses: number; categories: number };
  categories: { tag: string; count: number }[];
  topTags: { tag: string; count: number }[];
  topProviders: { name: string; count: number }[];
  prereqGraph: Record<string, { tag: string; weight: number }[]>;
  courses: AnarchyCourseSlim[];
}

interface AnarchyCourseBody {
  id: string;
  title: string;
  desc: string;
  href: string;
  img: string | null;
  tags: string[];
  provider: AnarchyProvider;
  difficulty: AnarchyDifficulty;
  hours: number;
  prereqs: string[];
}

// Display mapping — mirrors kazamadono.github.io filter chips
const FILTER_META: Record<string, { label: string; color: string }> = {
  all: { label: 'All', color: 'border-teal-900/40 bg-transparent' },
  aiml: { label: 'AI/ML', color: 'border-violet-500/30 bg-violet-500/10 text-violet-300' },
  exploits: { label: 'Low Level', color: 'border-red-500/30 bg-red-500/10 text-red-300' },
  psyops: { label: 'PsyOps', color: 'border-pink-500/30 bg-pink-500/10 text-pink-300' },
  bio: { label: 'Bio/Med', color: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  infra: { label: 'Infra', color: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
  blue: { label: 'Defensive', color: 'border-sky-500/30 bg-sky-500/10 text-sky-300' },
  red: { label: 'Offensive', color: 'border-rose-500/30 bg-rose-500/10 text-rose-300' },
  osint: { label: 'OSINT', color: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' },
  game: { label: 'Game Hacking', color: 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300' },
  webappsec: { label: 'BugBounty', color: 'border-orange-500/30 bg-orange-500/10 text-orange-300' },
  crypto: { label: 'Crypto', color: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300' },
  re: { label: 'Reversing', color: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300' },
  mobile: { label: 'Mobile', color: 'border-lime-500/30 bg-lime-500/10 text-lime-300' },
  cloud: { label: 'Cloud', color: 'border-blue-500/30 bg-blue-500/10 text-blue-300' },
  forensics: { label: 'Forensics', color: 'border-teal-500/30 bg-teal-500/10 text-teal-300' },
  ctf: { label: 'CTF', color: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300' },
  blockchain: { label: 'Blockchain', color: 'border-purple-500/30 bg-purple-500/10 text-purple-300' },
  iot: { label: 'IoT/HW', color: 'border-stone-500/30 bg-stone-500/10 text-stone-300' },
  dev: { label: 'Dev/CS', color: 'border-cyan-600/30 bg-cyan-600/10 text-cyan-200' },
  math: { label: 'Math', color: 'border-slate-500/30 bg-slate-500/10 text-slate-300' },
  project: { label: 'Project', color: 'border-teal-400/30 bg-teal-400/10 text-teal-200' },
};

const ALL_FILTERS = ['all', 'aiml', 'exploits', 'psyops', 'bio', 'infra', 'blue', 'red', 'osint', 'game', 'webappsec', 'crypto', 're', 'mobile', 'cloud', 'forensics', 'ctf', 'blockchain', 'iot', 'dev', 'math', 'project'];

function sanitizeUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') return url;
    return '#';
  } catch {
    return '#';
  }
}

export default function Anarchy() {
  const [idx, setIdx] = useState<AnarchyIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [difficulty, setDifficulty] = useState<string>('all');
  const [sort, setSort] = useState<'id' | 'hours' | 'difficulty'>('id');
  const [maxHours, setMaxHours] = useState<number>(12);
  const [visibleCount, setVisibleCount] = useState(48);
  const [selected, setSelected] = useState<AnarchyCourseSlim | null>(null);
  const [selectedBody, setSelectedBody] = useState<AnarchyCourseBody | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [binaryOn, setBinaryOn] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  // Phase 3 — personal library (localStorage) + deep-link routing
  const [bookmarks, setBookmarks] = useState<string[]>(() => loadBookmarks());
  const [progress, setProgress] = useState<Record<string, AnarchyProgress>>(() => loadProgress());
  const [savedOnly, setSavedOnly] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const routeParams = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Binary rain canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!binaryOn || reducedMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);
    const columns = Math.floor(w / 14);
    const drops: number[] = Array(columns).fill(0).map(() => Math.random() * -h);
    const chars = '01';
    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);
    const draw = () => {
      ctx.fillStyle = 'rgba(7,11,12,0.08)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(0,229,255,0.75)';
      ctx.font = '12px monospace';
      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)]!;
        ctx.fillText(text, i * 14, drops[i]!);
        if (drops[i]! > h && Math.random() > 0.975) drops[i] = 0;
        drops[i]! += 14;
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [binaryOn, reducedMotion]);

  // Reduced motion
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mql.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Fetch index
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Try new anarchy manifest first, fall back to direct courses.json proxy if not yet built
        let res = await fetch('/data/anarchy/index.json');
        if (!res.ok) res = await fetch('/data/anarchy/index.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as AnarchyIndex;
        if (!cancelled) {
          setIdx(json);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch full body on selection
  useEffect(() => {
    if (!selected) {
      setSelectedBody(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/data/anarchy/courses/${selected.id}.json`);
        if (res.ok) {
          const body = (await res.json()) as AnarchyCourseBody;
          if (!cancelled) setSelectedBody(body);
        } else {
          // Fallback to slim
          if (!cancelled)
            setSelectedBody({
              id: selected.id,
              title: selected.title,
              desc: selected.preview,
              href: selected.href,
              img: selected.img,
              tags: selected.tags,
              provider: selected.provider,
              difficulty: selected.difficulty,
              hours: selected.hours,
              prereqs: [],
            });
        }
      } catch {
        if (!cancelled)
          setSelectedBody({
            id: selected.id,
            title: selected.title,
            desc: selected.preview,
            href: selected.href,
            img: selected.img,
            tags: selected.tags,
            provider: selected.provider,
            difficulty: selected.difficulty,
            hours: selected.hours,
            prereqs: [],
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  // Phase 3 — persist personal library
  useEffect(() => {
    saveBookmarks(bookmarks);
  }, [bookmarks]);
  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  const openCourse = useCallback(
    (c: AnarchyCourseSlim) => {
      setSelected(c);
      setCopied(false);
      navigate(`/anarchy/c/${c.id}`, { replace: true });
    },
    [navigate]
  );

  const closeSelected = useCallback(() => {
    setSelected(null);
    setCopied(false);
    navigate('/anarchy', { replace: true });
  }, [navigate]);

  // Phase 3 — deep link: /anarchy/c/:id opens the course once the index loads
  const routeId = normalizeCourseId(routeParams.id);
  useEffect(() => {
    if (!idx || !routeId) return;
    if (selected?.id === routeId) return;
    const found = idx.courses.find((c) => normalizeCourseId(c.id) === routeId);
    if (found) setSelected(found);
  }, [idx, routeId, selected?.id]);

  const toggleBookmark = useCallback((id: string) => {
    const norm = normalizeCourseId(id) ?? id;
    setBookmarks((prev) => (prev.includes(norm) ? prev.filter((b) => b !== norm) : [...prev, norm]));
  }, []);

  const setCourseProgress = useCallback((id: string, value: AnarchyProgress | null) => {
    const norm = normalizeCourseId(id) ?? id;
    setProgress((prev) => {
      if (value === null) {
        if (!(norm in prev)) return prev;
        const next = { ...prev };
        delete next[norm];
        return next;
      }
      return { ...prev, [norm]: value };
    });
  }, []);

  const copyCourseLink = useCallback(async (id: string) => {
    const url = courseUrl(id);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API unavailable (permissions / insecure context) — fall back to selection hack
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, []);

  const shareCourse = useCallback(async (course: AnarchyCourseSlim | AnarchyCourseBody) => {
    const url = courseUrl(course.id);
    const nav = navigator as Navigator & { share?: (data: { title?: string; text?: string; url?: string }) => Promise<void> };
    if (typeof nav.share === 'function') {
      try {
        await nav.share({ title: course.title, text: course.title, url });
        return;
      } catch {
        /* user dismissed — fall through to copy */
      }
    }
    await copyCourseLink(course.id);
  }, [copyCourseLink]);

  // Keyboard shortcuts: / to focus, Esc to clear
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (selected) closeSelected();
        else if (showSettings) setShowSettings(false);
        else {
          setQ('');
          searchRef.current?.blur();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, showSettings, closeSelected]);

  const filtered = useMemo(() => {
    if (!idx) return [];
    let list = idx.courses;
    if (filter !== 'all') {
      list = list.filter((c) => c.tags.includes(filter));
    }
    if (difficulty !== 'all') {
      list = list.filter((c) => c.difficulty === difficulty);
    }
    if (maxHours < 12) {
      list = list.filter((c) => c.hours <= maxHours);
    }
    if (savedOnly) {
      list = list.filter((c) => bookmarks.includes(normalizeCourseId(c.id) ?? c.id));
    }
    if (hideDone) {
      list = list.filter((c) => progress[normalizeCourseId(c.id) ?? c.id] !== 'done');
    }
    if (q.trim()) {
      const needle = q.toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(needle) ||
          c.preview.toLowerCase().includes(needle) ||
          c.tags.join(' ').includes(needle) ||
          c.provider.name.toLowerCase().includes(needle) ||
          c.provider.host.toLowerCase().includes(needle)
      );
    }
    // Sort
    if (sort === 'hours') list = [...list].sort((a, b) => a.hours - b.hours);
    else if (sort === 'difficulty') {
      const rank: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 };
      list = [...list].sort((a, b) => (rank[a.difficulty] ?? 1) - (rank[b.difficulty] ?? 1));
    }
    return list;
  }, [idx, filter, difficulty, maxHours, sort, q, savedOnly, hideDone, bookmarks, progress]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const handleFilter = useCallback((f: string) => {
    setFilter(f);
    setVisibleCount(48);
    // Smooth scroll to grid on mobile
    if (window.innerWidth < 768) {
      gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const tagCounts = useMemo(() => {
    if (!idx) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const { tag, count } of idx.categories) m.set(tag, count);
    return m;
  }, [idx]);

  const libraryCounts = useMemo(() => {
    const done = Object.values(progress).filter((v) => v === 'done').length;
    const doing = Object.values(progress).filter((v) => v === 'doing').length;
    return { saved: bookmarks.length, doing, done };
  }, [bookmarks, progress]);

  // Phase 4 — deterministic picks from the local library (no fetch needed:
  // the full slim index is already in memory). Hidden until the user saves
  // or tracks at least one course.
  const forYou = useMemo(() => {
    if (!idx) return [];
    if (bookmarks.length + Object.keys(progress).length === 0) return [];
    const done = Object.entries(progress)
      .filter(([, v]) => v === 'done')
      .map(([k]) => k);
    const doing = Object.entries(progress)
      .filter(([, v]) => v === 'doing')
      .map(([k]) => k);
    return recommendCourses(idx.courses, { saved: bookmarks, done, doing, limit: 8 });
  }, [idx, bookmarks, progress]);

  const similar = useMemo(() => {
    if (!idx || !selected) return [];
    return similarCourses(idx.courses, selected.id, 4);
  }, [idx, selected]);

  const exportLibrary = useCallback(() => {
    const blob = new Blob([serializeLibrary(bookmarks, progress)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'anarchy-library.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [bookmarks, progress]);

  const importLibraryFile = useCallback(async (file: File) => {
    setImportError(null);
    try {
      const text = await file.text();
      const { bookmarks: b, progress: p } = parseLibraryImport(text);
      setBookmarks(b);
      setProgress(p);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Could not read that file — expected an anarchy-library.json export.');
    }
  }, []);

  const clearLibrary = useCallback(() => {
    setBookmarks([]);
    setProgress({});
    setSavedOnly(false);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070b0c] text-slate-200 flex items-center justify-center">
        <div className="text-center font-mono text-sm tracking-widest animate-pulse">
          <div className="text-red-500 mb-2">SYSTEM INITIALIZING...</div>
          <div className="text-cyan-400">LOADING ANARCHY PROTOCOL</div>
          <div className="mt-4 text-xs text-slate-500">{'>'} 1,708 courses • daily sync • kazamadono.github.io</div>
        </div>
      </div>
    );
  }

  if (error || !idx) {
    return (
      <div className="min-h-screen bg-[#070b0c] text-slate-200 flex items-center justify-center p-8">
        <div className="max-w-lg w-full rounded-2xl border border-red-900/30 bg-red-950/20 p-6">
          <h2 className="font-mono text-red-400 text-sm tracking-widest mb-2">SYNC FAILED</h2>
          <p className="text-slate-400 text-sm mb-4">{error ?? 'Manifest unavailable. Run `node scripts/sync-anarchy.mjs && node scripts/build-anarchy.mjs`.'}</p>
          <a href="https://kazamadono.github.io/" target="_blank" rel="noopener" className="inline-flex items-center gap-2 rounded-xl border border-teal-900/40 px-4 py-2 text-xs font-mono hover:bg-teal-900/20">
            Open upstream <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b0c] text-slate-200 selection:bg-cyan-500/30 selection:text-white relative overflow-hidden">
      {/* Binary rain */}
      {binaryOn && !reducedMotion && (
        <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 pointer-events-none opacity-[0.12] z-0" style={{ filter: 'drop-shadow(0 0 6px rgba(0,229,255,.35))' }} />
      )}
      {/* Scanlines */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.4] z-0" style={{ background: 'repeating-linear-gradient(to bottom, rgba(0,255,230,.04), rgba(0,255,230,.04) 1px, transparent 2px, transparent 3px)', mixBlendMode: 'overlay' as const }} />

      {/* Top Bar */}
      <header className="sticky top-0 z-40 backdrop-blur bg-[#070b0c]/70 border-b border-teal-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <img src="https://kazamadono.github.io/assets/Dorothea_Coyett_CS.webp" alt="Anarchy" className="w-9 h-9 object-contain hidden sm:block" />
            <div className="text-left">
              <h1 className="font-mono text-xl sm:text-2xl tracking-[0.2em] font-bold leading-none" style={{ fontFamily: 'Orbitron, monospace' }}>
                ANARCHY
              </h1>
              <p className="font-mono text-[10px] text-slate-400 tracking-widest">DAILY SYNC • {new Date(idx.syncedAt).toLocaleDateString()} • {idx.counts.courses} COURSES</p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2 w-full max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setVisibleCount(48);
                }}
                placeholder="Search courses, tags, stacks…"
                className="w-full rounded-xl bg-[#050808]/80 border border-teal-900/40 pl-9 pr-4 py-2 font-mono text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/60 focus:border-cyan-500/60"
              />
            </div>
            <button
              onClick={() => {
                setQ('');
                setFilter('all');
                setDifficulty('all');
                setMaxHours(12);
                setSavedOnly(false);
                setHideDone(false);
                setVisibleCount(48);
              }}
              className="hidden sm:inline-flex rounded-xl border border-teal-900/40 px-3 py-2 font-mono text-xs hover:bg-teal-900/20 transition-colors"
            >
              Clear
            </button>
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="rounded-xl border border-teal-900/40 px-3 py-2 font-mono text-xs hover:bg-teal-900/20 transition-colors"
              title="Settings"
            >
              ⚙
            </button>
            <a
              href="https://kazamadono.github.io/"
              target="_blank"
              rel="noopener"
              className="hidden md:inline-flex items-center gap-1.5 rounded-xl border border-red-900/30 bg-red-500/10 text-red-300 px-3 py-2 font-mono text-xs hover:bg-red-500/20 transition-colors"
            >
              Upstream <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid md:grid-cols-2 gap-8 items-start">
          <div>
            <h2 className="font-mono text-3xl sm:text-4xl md:text-5xl leading-tight font-bold" style={{ fontFamily: 'Orbitron, monospace' }}>
              <span className="text-red-500">Welcome</span> back, operative.
              <br />
              <span className="text-red-500">Your</span> training awaits.
            </h2>
            <p className="mt-4 text-slate-400 max-w-prose text-sm leading-relaxed">
              Master the art of cyber operations. Explore exploitation, adversarial AI, and defensive strategies — replicated daily from the{' '}
              <a href="https://kazamadono.github.io/" target="_blank" rel="noopener" className="text-cyan-400 hover:text-cyan-300 underline decoration-cyan-500/30">
                Anarchy
              </a>{' '}
              portal by KazamaDono. Search 1,708 courses across 20 tracks. Press <kbd className="px-1.5 py-0.5 rounded border border-white/10 bg-black/20 font-mono text-xs">/</kbd> to focus search, <kbd className="px-1.5 py-0.5 rounded border border-white/10 bg-black/20 font-mono text-xs">Esc</kbd> clears.
            </p>

            <div className="mt-6 flex flex-wrap gap-1.5 font-mono text-xs max-h-64 overflow-y-auto pr-1">
              {ALL_FILTERS.map((f) => {
                const meta = FILTER_META[f] ?? FILTER_META['all']!;
                const active = filter === f;
                const count = f === 'all' ? idx.counts.courses : tagCounts.get(f) ?? 0;
                return (
                  <button
                    key={f}
                    onClick={() => handleFilter(f)}
                    className={`rounded-full border px-3 py-1 text-xs font-mono transition-all hover:scale-[1.02] ${active ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200 ring-1 ring-cyan-500/30' : meta.color} `}
                    aria-pressed={active}
                  >
                    {meta.label} <span className="opacity-60 ml-1">{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Phase 2: difficulty + hours + sort */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono text-slate-500 tracking-widest">DIFFICULTY:</span>
              {(['all', 'beginner', 'intermediate', 'advanced'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    setDifficulty(d);
                    setVisibleCount(48);
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-mono capitalize transition-colors ${
                    difficulty === d ? 'bg-amber-500/20 border-amber-500/40 text-amber-200' : 'border-white/10 text-slate-400 hover:border-white/20'
                  }`}
                >
                  {d}
                </button>
              ))}
              <span className="text-xs font-mono text-slate-500 tracking-widest ml-2">SORT:</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as never)}
                className="rounded-full border border-white/10 bg-[#050808] px-3 py-1 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-500/40"
              >
                <option value="id">ID</option>
                <option value="hours">Hours ↑</option>
                <option value="difficulty">Difficulty</option>
              </select>
              <span className="text-xs font-mono text-slate-500 tracking-widest ml-2">MAX HOURS:</span>
              <input
                type="range"
                min={2}
                max={12}
                value={maxHours}
                onChange={(e) => {
                  setMaxHours(Number(e.target.value));
                  setVisibleCount(48);
                }}
                className="w-20 accent-cyan-500"
              />
              <span className="text-xs font-mono text-cyan-300 w-8">{maxHours}h</span>
              {maxHours < 12 && (
                <button onClick={() => setMaxHours(12)} className="text-xs font-mono text-slate-500 hover:text-white">
                  reset
                </button>
              )}
              <button
                onClick={() => {
                  setSavedOnly((v) => !v);
                  setVisibleCount(48);
                }}
                aria-pressed={savedOnly}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-mono transition-colors ${
                  savedOnly ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200' : 'border-white/10 text-slate-400 hover:border-white/20'
                }`}
              >
                <Bookmark className="w-3 h-3" /> Saved ({libraryCounts.saved})
              </button>
              <button
                onClick={() => {
                  setHideDone((v) => !v);
                  setVisibleCount(48);
                }}
                aria-pressed={hideDone}
                className={`rounded-full border px-3 py-1 text-xs font-mono transition-colors ${
                  hideDone ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200' : 'border-white/10 text-slate-400 hover:border-white/20'
                }`}
              >
                Hide done{libraryCounts.done > 0 ? ` (${libraryCounts.done})` : ''}
              </button>
              {libraryCounts.doing > 0 && (
                <span className="text-xs font-mono text-slate-500">• {libraryCounts.doing} in progress</span>
              )}
            </div>

            <div className="mt-3 flex items-center gap-3 text-xs font-mono text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> {filtered.length} matches
              </span>
              <span>•</span>
              <span>
                Synced {new Date(idx.syncedAt).toLocaleString()} • Built {new Date(idx.builtAt).toLocaleString()}
              </span>
              <a href="https://github.com/KazamaDono" target="_blank" rel="noopener" className="ml-auto hidden sm:inline-flex items-center gap-1 text-slate-400 hover:text-white">
                <Github className="w-3 h-3" /> KazamaDono
              </a>
            </div>
          </div>

          <div className="relative rounded-2xl border border-teal-900/40 p-6 shadow-[0_0_20px_rgba(0,229,255,.15)] bg-gradient-to-br from-[#070b0c] to-[#0b1f1f]/50 backdrop-blur">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-4 rounded-xl bg-[#050808]/70 border border-teal-900/30">
                <div className="font-mono text-3xl font-bold text-white">{idx.counts.courses}</div>
                <div className="font-mono text-[10px] tracking-widest text-slate-400">COURSES</div>
              </div>
              <div className="p-4 rounded-xl bg-[#050808]/70 border border-teal-900/30">
                <div className="font-mono text-3xl font-bold text-white">{idx.counts.categories}</div>
                <div className="font-mono text-[10px] tracking-widest text-slate-400">TRACKS</div>
              </div>
              <div className="p-4 rounded-xl bg-[#050808]/70 border border-teal-900/30">
                <div className="font-mono text-3xl font-bold text-cyan-300">∞</div>
                <div className="font-mono text-[10px] tracking-widest text-slate-400">LIFETIME</div>
              </div>
            </div>
            <p className="mt-4 font-mono text-xs text-slate-400">Tip: Be "Inspired by the fear of being average".</p>
            <div className="mt-6 flex justify-center gap-6">
              <a href="https://discord.gg/6jjeXCRGDx" target="_blank" rel="noopener" title="Discord" className="opacity-70 hover:opacity-100 hover:scale-110 transition-all">
                <MessageCircle className="w-6 h-6" />
              </a>
              <a href="https://www.linkedin.com/in/n%CF%86x1r-%E2%88%86ssa/" target="_blank" rel="noopener" title="LinkedIn" className="opacity-70 hover:opacity-100 hover:scale-110 transition-all">
                <Linkedin className="w-6 h-6" />
              </a>
              <a href="https://github.com/KazamaDono" target="_blank" rel="noopener" title="GitHub" className="opacity-70 hover:opacity-100 hover:scale-110 transition-all">
                <Github className="w-6 h-6" />
              </a>
            </div>
            {/* Quick tag bars */}
            <div className="mt-6 space-y-2">
              {idx.topTags.slice(0, 5).map((t) => {
                const pct = Math.round((t.count / idx.counts.courses) * 100);
                return (
                  <div key={t.tag} className="flex items-center gap-2 text-xs font-mono">
                    <span className="w-20 text-slate-400 truncate uppercase">{t.tag}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-cyan-500 to-teal-400" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-8 text-right text-slate-300">{t.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Phase 4 — For you (deterministic picks from the local library) */}
      {forYou.length > 0 && (
        <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-2">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-cyan-300" />
            <h3 className="font-mono text-xs tracking-[0.2em] text-slate-300">FOR YOU • FROM YOUR LIBRARY</h3>
            <span className="text-[11px] font-mono text-slate-500">
              {libraryCounts.saved} saved • {libraryCounts.done} done
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
            {forYou.map(({ course: c, score, reasons }, i) => {
              const normId = normalizeCourseId(c.id) ?? c.id;
              const saved = bookmarks.includes(normId);
              return (
                <article
                  key={c.id}
                  onClick={() => openCourse(c)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openCourse(c);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`#${i + 1}: ${c.title} — open details`}
                  className="group shrink-0 w-64 text-left rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-[#0b1a1c]/90 to-[#050808]/90 backdrop-blur hover:border-cyan-500/40 hover:shadow-[0_0_20px_rgba(0,229,255,.15)] transition-all duration-300 overflow-hidden cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60"
                >
                  <div className="p-4 flex flex-col h-full">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-lg font-bold text-cyan-300/80">#{i + 1}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBookmark(c.id);
                        }}
                        aria-pressed={saved}
                        aria-label={saved ? `Remove ${c.title} from saved` : `Save ${c.title} for later`}
                        className={`w-7 h-7 rounded-full border flex items-center justify-center transition-all hover:scale-110 ${
                          saved ? 'bg-cyan-500/30 border-cyan-400/50 text-cyan-100' : 'bg-black/40 border-white/10 text-white/70 hover:text-white'
                        }`}
                      >
                        <Bookmark className="w-3.5 h-3.5" fill={saved ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                    <h4 className="mt-2 font-mono text-sm font-semibold leading-tight line-clamp-2 group-hover:text-cyan-300 transition-colors" style={{ fontFamily: 'Orbitron, monospace' }}>
                      {c.title}
                    </h4>
                    <p className="mt-1 text-[11px] font-mono text-slate-500 line-clamp-2 leading-relaxed flex-1">
                      {reasons[0] ?? `Score ${score.toFixed(1)}`}
                      {reasons[1] ? ` • ${reasons[1]}` : ''}
                    </p>
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] font-mono">
                      <span className="text-white/80">{c.provider.icon} {c.provider.name}</span>
                      <span className="text-slate-500">•</span>
                      <span className={c.difficulty === 'advanced' ? 'text-red-300' : c.difficulty === 'beginner' ? 'text-emerald-300' : 'text-amber-300'}>
                        {c.difficulty}
                      </span>
                      <span className="text-slate-500">•</span>
                      <span className="text-cyan-200 inline-flex items-center gap-0.5">
                        <Clock className="w-3 h-3" /> {c.hours}h
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Grid */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-mono text-xs tracking-[0.2em] text-slate-400">
            {filter === 'all' ? 'ALL COURSES' : FILTER_META[filter]?.label.toUpperCase() ?? filter.toUpperCase()} • {filtered.length}
          </h3>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
            <Filter className="w-3 h-3" /> {visible.length} / {filtered.length} shown
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-teal-900/30 bg-[#050808]/50 p-12 text-center">
            <Search className="w-8 h-8 mx-auto text-slate-600 mb-3" />
            <p className="font-mono text-sm text-slate-400">No courses match “{q}”{savedOnly ? ' in your saved library' : ''}.</p>
            <button
              onClick={() => {
                setQ('');
                setFilter('all');
                setDifficulty('all');
                setMaxHours(12);
                setSavedOnly(false);
                setHideDone(false);
              }}
              className="mt-4 rounded-xl border border-teal-900/40 px-4 py-2 font-mono text-xs hover:bg-teal-900/20"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <>
            <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6">
              {visible.map((c) => {
                const normId = normalizeCourseId(c.id) ?? c.id;
                const saved = bookmarks.includes(normId);
                const st = progress[normId];
                return (
                <article
                  key={c.id}
                  onClick={() => openCourse(c)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openCourse(c);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${c.title} — open details`}
                  className="group text-left rounded-2xl border border-teal-900/30 bg-gradient-to-br from-[#0a1214]/80 to-[#050808]/80 backdrop-blur hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(0,229,255,.15)] transition-all duration-300 overflow-hidden flex flex-col h-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60"
                >
                  {/* Image */}
                  <div className="h-28 bg-[#050808] relative overflow-hidden border-b border-teal-900/20">
                    {c.img ? (
                      <img
                        src={`https://kazamadono.github.io/${c.img}`}
                        alt=""
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-[1.02] transition-all duration-500"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-teal-900/20 to-cyan-900/20">
                        <BookOpen className="w-8 h-8 text-teal-700" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
                    <div className="absolute top-2 left-2 flex gap-1 flex-wrap">
                      {c.tags.slice(0, 2).map((t) => {
                        const meta = FILTER_META[t] ?? { label: t, color: 'border-white/10 bg-black/40 text-white' };
                        return (
                          <span key={t} className={`text-[10px] font-mono px-2 py-0.5 rounded-full border backdrop-blur ${meta.color}`}>
                            {meta.label}
                          </span>
                        );
                      })}
                    </div>
                    <div className="absolute top-2 right-2 flex items-center gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBookmark(c.id);
                        }}
                        aria-pressed={saved}
                        aria-label={saved ? `Remove ${c.title} from saved` : `Save ${c.title} for later`}
                        title={saved ? 'Saved — click to remove' : 'Save for later'}
                        className={`w-7 h-7 rounded-full backdrop-blur border flex items-center justify-center transition-all hover:scale-110 ${
                          saved ? 'bg-cyan-500/30 border-cyan-400/50 text-cyan-100' : 'bg-black/40 border-white/10 text-white/70 hover:text-white'
                        }`}
                      >
                        <Bookmark className="w-3.5 h-3.5" fill={saved ? 'currentColor' : 'none'} />
                      </button>
                      <span className="text-[10px] font-mono text-white/60 bg-black/40 backdrop-blur px-2 py-0.5 rounded-full border border-white/10">
                        #{c.id}
                      </span>
                    </div>
                    {/* Provider + difficulty + hours */}
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-black/50 backdrop-blur px-2 py-0.5 rounded-full border border-white/10 text-white">
                        <span>{c.provider.icon}</span> {c.provider.name}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border backdrop-blur ${c.difficulty === 'advanced' ? 'border-red-500/30 bg-red-500/20 text-red-200' : c.difficulty === 'beginner' ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-200' : 'border-amber-500/30 bg-amber-500/20 text-amber-200'}`}>
                          {c.difficulty}
                        </span>
                        <span className="text-[10px] font-mono bg-black/50 backdrop-blur px-2 py-0.5 rounded-full border border-white/10 text-cyan-200 inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {c.hours}h
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <h4 className="font-mono text-sm font-semibold leading-tight line-clamp-2 group-hover:text-cyan-300 transition-colors" style={{ fontFamily: 'Orbitron, monospace' }}>
                      {c.title}
                    </h4>
                    <p className="mt-2 text-xs text-slate-400 line-clamp-3 leading-relaxed flex-1">{c.preview}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-400 group-hover:text-cyan-300">
                        Open <ExternalLink className="w-3 h-3" />
                      </span>
                      {st ? (
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                            st === 'done'
                              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                              : 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                          }`}
                        >
                          {st === 'done' ? '✓ Done' : '◐ Doing'}
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-slate-500">
                          {c.tags.length} tracks • {c.provider.host || 'external'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-0.5 bg-gradient-to-r from-cyan-500 to-teal-400 scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
                </article>
                );
              })}
            </div>

            {visible.length < filtered.length && (
              <div className="mt-8 flex justify-center">
                <button
                  onClick={() => setVisibleCount((n) => n + 48)}
                  className="inline-flex items-center gap-2 rounded-xl border border-teal-900/40 bg-[#050808]/60 px-6 py-3 font-mono text-sm hover:bg-teal-900/20 hover:border-cyan-500/30 transition-colors"
                >
                  Load more <ChevronDown className="w-4 h-4" /> <span className="text-slate-500">({filtered.length - visible.length} remaining)</span>
                </button>
              </div>
            )}
          </>
        )}

        {/* Attribution */}
        <div className="mt-12 rounded-2xl border border-teal-900/20 bg-[#050808]/30 p-4 flex flex-wrap gap-3 items-center justify-between text-xs font-mono text-slate-500">
          <span>
            Source: <a href="https://kazamadono.github.io/" target="_blank" rel="noopener" className="text-cyan-400 hover:underline">kazamadono.github.io</a> •{' '}
            <a href="https://github.com/KazamaDono" target="_blank" rel="noopener" className="text-cyan-400 hover:underline">
              @KazamaDono
            </a>{' '}
            • {idx.license}
          </span>
          <span className="inline-flex items-center gap-2">
            <Clock className="w-3 h-3" /> Daily sync at 06:00 UTC • Next: tomorrow 06:00 UTC
          </span>
        </div>
      </main>

      {/* Course Modal */}
      {selected &&
        (() => {
          const modalNorm = normalizeCourseId(selected.id) ?? selected.id;
          const modalSaved = bookmarks.includes(modalNorm);
          const modalProgress = progress[modalNorm] ?? null;
          return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeSelected} />
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-teal-900/30 bg-[#070b0c] shadow-[0_0_40px_rgba(0,229,255,.2)] flex flex-col">
            <div className="h-48 relative overflow-hidden shrink-0">
              {selected.img ? (
                <img src={`https://kazamadono.github.io/${selected.img}`} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-teal-900/30 to-cyan-900/30 flex items-center justify-center">
                  <Code className="w-12 h-12 text-teal-600" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#070b0c] via-black/20 to-transparent" />
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <button
                  onClick={() => toggleBookmark(selected.id)}
                  aria-pressed={modalSaved}
                  aria-label={modalSaved ? 'Remove from saved' : 'Save for later'}
                  title={modalSaved ? 'Saved — click to remove' : 'Save for later'}
                  className={`h-8 px-3 rounded-full backdrop-blur border flex items-center gap-1.5 font-mono text-xs transition-colors ${
                    modalSaved ? 'bg-cyan-500/30 border-cyan-400/50 text-cyan-100' : 'bg-black/60 border-white/10 text-white hover:bg-black/80'
                  }`}
                >
                  <Bookmark className="w-3.5 h-3.5" fill={modalSaved ? 'currentColor' : 'none'} />
                  {modalSaved ? 'Saved' : 'Save'}
                </button>
                <button
                  onClick={closeSelected}
                  aria-label="Close details"
                  className="w-8 h-8 rounded-full bg-black/60 backdrop-blur border border-white/10 flex items-center justify-center hover:bg-black/80 transition-colors"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className="absolute bottom-3 left-4 right-4">
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {(selectedBody?.tags ?? selected.tags).map((t) => {
                    const meta = FILTER_META[t] ?? { label: t, color: 'border-white/20 bg-black/50 text-white' };
                    return (
                      <span key={t} className={`text-xs font-mono px-2.5 py-1 rounded-full border backdrop-blur ${meta.color}`}>
                        {meta.label}
                      </span>
                    );
                  })}
                </div>
                <h3 className="font-mono text-xl font-bold text-white leading-tight" style={{ fontFamily: 'Orbitron, monospace' }}>
                  {selectedBody?.title ?? selected.title}
                </h3>
                <p className="text-xs font-mono text-white/60 mt-1">#{selected.id} • {selected.tags.length} tracks</p>
              </div>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <p className="text-sm text-slate-300 leading-relaxed">{selectedBody?.desc ?? selected.preview}</p>
              <div className="mt-6 grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="rounded-xl border border-teal-900/20 bg-[#050808]/50 p-3">
                  <div className="text-slate-500 tracking-widest text-[10px]">PROVIDER</div>
                  <div className="text-slate-200 mt-1 flex items-center gap-1.5 truncate">
                    <span>{(selectedBody?.provider ?? selected.provider).icon}</span> {(selectedBody?.provider ?? selected.provider).name} • {(selectedBody?.provider ?? selected.provider).host}
                  </div>
                </div>
                <div className="rounded-xl border border-teal-900/20 bg-[#050808]/50 p-3">
                  <div className="text-slate-500 tracking-widest text-[10px]">ID • DIFFICULTY • HOURS</div>
                  <div className="text-slate-200 mt-1 flex items-center gap-2 font-mono">
                    <span>#{selected.id}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] border ${((selectedBody?.difficulty ?? selected.difficulty) === 'advanced' ? 'border-red-500/30 bg-red-500/20 text-red-200' : (selectedBody?.difficulty ?? selected.difficulty) === 'beginner' ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-200' : 'border-amber-500/30 bg-amber-500/20 text-amber-200')}`}>
                      {selectedBody?.difficulty ?? selected.difficulty}
                    </span>
                    <span className="inline-flex items-center gap-1 text-cyan-300">
                      <Clock className="w-3 h-3" /> {selectedBody?.hours ?? selected.hours}h
                    </span>
                  </div>
                </div>
              </div>
              {selectedBody?.prereqs && selectedBody.prereqs.length > 0 && (
                <div className="mt-4 rounded-xl border border-teal-900/20 bg-[#050808]/50 p-3">
                  <div className="text-slate-500 tracking-widest text-[10px] font-mono">PREREQUISITES • TAG GRAPH</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedBody.prereqs.map((p) => {
                      const meta = FILTER_META[p] ?? { label: p, color: 'border-white/10 bg-white/5 text-slate-300' };
                      return (
                        <button key={p} onClick={() => { setFilter(p); closeSelected(); setVisibleCount(48); gridRef.current?.scrollIntoView({ behavior: 'smooth' }); }} className={`text-xs font-mono px-2.5 py-1 rounded-full border ${meta.color} hover:scale-[1.02] transition-transform`}>
                          → {meta.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">Click a prereq tag to filter. Graph derived from tag co-occurrence across 1,708 courses.</p>
                </div>
              )}
              {/* Phase 4 — similar courses */}
              {similar.length > 0 && (
                <div className="mt-4 rounded-xl border border-teal-900/20 bg-[#050808]/50 p-3">
                  <div className="text-slate-500 tracking-widest text-[10px] font-mono">SIMILAR COURSES</div>
                  <div className="mt-2 grid gap-1.5">
                    {similar.map(({ course: c, reasons }) => (
                      <button
                        key={c.id}
                        onClick={() => openCourse(c)}
                        className="text-left rounded-lg border border-white/5 hover:border-cyan-500/30 hover:bg-cyan-500/5 px-3 py-2 transition-colors"
                      >
                        <div className="text-xs font-mono text-slate-200 truncate">{c.title}</div>
                        <div className="text-[11px] font-mono text-slate-500 truncate">
                          #{c.id} • {reasons[0] ?? `${c.provider.name} • ${c.difficulty} • ${c.hours}h`}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Phase 3 — my track: progress + share */}
              <div className="mt-4 rounded-xl border border-teal-900/20 bg-[#050808]/50 p-3">
                <div className="text-slate-500 tracking-widest text-[10px] font-mono">MY TRACK • SAVED IN THIS BROWSER</div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {(['todo', 'doing', 'done'] as const).map((s) => {
                    const active = (modalProgress ?? 'todo') === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setCourseProgress(selected.id, s === 'todo' ? null : s)}
                        aria-pressed={active}
                        className={`text-xs font-mono px-3 py-1.5 rounded-full border transition-colors ${
                          active
                            ? s === 'done'
                              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
                              : s === 'doing'
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                                : 'bg-white/10 border-white/20 text-white'
                            : 'border-white/10 text-slate-400 hover:border-white/25 hover:text-slate-200'
                        }`}
                      >
                        {s === 'todo' ? 'Not started' : s === 'doing' ? '◐ In progress' : '✓ Done'}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => copyCourseLink(selected.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                    {copied ? 'Link copied!' : 'Copy link'}
                  </button>
                  <button
                    onClick={() => shareCourse(selectedBody ?? selected)}
                    className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-full border border-white/10 text-slate-300 hover:border-white/25 hover:text-white transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Share…
                  </button>
                  <span className="text-[11px] font-mono text-slate-600 truncate">{courseUrl(selected.id)}</span>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-teal-900/20 bg-[#050808]/50 flex gap-3">
              <a
                href={sanitizeUrl(selected.href)}
                target="_blank"
                rel="noopener"
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-black font-mono text-sm font-bold py-3 hover:from-cyan-400 hover:to-teal-400 transition-colors"
              >
                Open course <ExternalLink className="w-4 h-4" />
              </a>
              <button
                onClick={closeSelected}
                className="rounded-xl border border-teal-900/40 px-6 py-3 font-mono text-sm hover:bg-teal-900/20 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
          );
        })()}

      {/* Settings */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSettings(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-teal-900/30 bg-[#070b0c] p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-mono text-sm tracking-widest text-white">SETTINGS</h3>
              <button onClick={() => setShowSettings(false)} className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/10">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <div>
                  <div className="font-mono text-sm text-white">Binary Rain</div>
                  <div className="text-xs text-slate-500">Ambient matrix rain overlay</div>
                </div>
                <button
                  onClick={() => setBinaryOn((v) => !v)}
                  className={`w-11 h-6 rounded-full p-1 transition-colors ${binaryOn ? 'bg-gradient-to-r from-cyan-500 to-teal-500' : 'bg-slate-800'}`}
                >
                  <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${binaryOn ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </label>
              <div className="rounded-xl border border-teal-900/20 bg-[#050808]/50 p-3">
                <div className="font-mono text-xs text-white">My library</div>
                <div className="text-xs text-slate-500 mt-1">
                  {libraryCounts.saved} saved • {libraryCounts.doing} in progress • {libraryCounts.done} done — stored in this browser only.
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    onClick={exportLibrary}
                    className="inline-flex items-center gap-1.5 rounded-full border border-teal-900/40 px-3 py-1.5 font-mono text-xs text-slate-200 hover:bg-teal-900/20 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Export
                  </button>
                  <button
                    onClick={() => {
                      setImportError(null);
                      importRef.current?.click();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-teal-900/40 px-3 py-1.5 font-mono text-xs text-slate-200 hover:bg-teal-900/20 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" /> Import
                  </button>
                  <button
                    onClick={clearLibrary}
                    className="inline-flex items-center gap-1.5 rounded-full border border-red-900/40 px-3 py-1.5 font-mono text-xs text-red-300 hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Clear
                  </button>
                  <input
                    ref={importRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    aria-label="Import library file"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) void importLibraryFile(f);
                    }}
                  />
                </div>
                {importError && <div className="mt-2 text-xs font-mono text-red-400">Import failed: {importError}</div>}
              </div>
              <div className="rounded-xl border border-teal-900/20 bg-[#050808]/50 p-3 font-mono text-xs text-slate-400">
                <div>Source: kazamadono.github.io • Daily sync 06:00 UTC</div>
                <div className="mt-1">Synced: {new Date(idx.syncedAt).toLocaleString()}</div>
                <div>Built: {new Date(idx.builtAt).toLocaleString()}</div>
                <div className="mt-2">
                  <a href="https://github.com/KazamaDono" target="_blank" rel="noopener" className="text-cyan-400 hover:underline">
                    github.com/KazamaDono
                  </a>
                </div>
              </div>
              <button
                onClick={() => {
                  setBinaryOn(true);
                  setShowSettings(false);
                }}
                className="w-full rounded-xl border border-teal-900/40 py-2 font-mono text-xs hover:bg-teal-900/20"
              >
                Reset to defaults
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="relative z-10 border-t border-teal-900/20 bg-[#050808]/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-wrap gap-4 items-center justify-between text-xs font-mono text-slate-500">
          <span>© Anarchy • Replicated daily with attribution • Not affiliated — links retained verbatim</span>
          <span className="inline-flex items-center gap-2">
            <Shield className="w-3 h-3" /> 1,708 courses • 20 tracks • Lifetime •{' '}
            <a href="https://pranithjain.qzz.io/anarchy" className="text-cyan-400 hover:underline">
              pranithjain.qzz.io/anarchy
            </a>
          </span>
        </div>
      </footer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700&family=Share+Tech+Mono&display=swap');
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .line-clamp-3 { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      `}</style>
    </div>
  );
}
