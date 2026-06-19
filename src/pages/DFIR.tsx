import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bug,
  Compass,
  Crosshair,
  Clock,
  FileSearch,
  FileText,
  GitBranch,
  Globe,
  Hash,
  Mail,
  Search,
  Shield,
  ShieldAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import { MAIN_TOOL_COUNT } from '../components/dfir/tool-sections';
import { catalogSearch } from '../data/dfir-catalog';
import { useRecentTools } from '../hooks/useRecentTools';
import { getSidebarForSection } from '../data/sidebar-nav';
import { DfirStructuredData } from '../components/ToolStructuredData';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

/**
 * DFIR home page — redesigned following SaaS UX patterns from
 * Huntress, Shodan, and Recorded Future.
 *
 * Structure:
 *   1. Bold hero — "What is this?" in one sentence + primary search
 *   2. Stats — Social proof (Huntress "5M+ endpoints" pattern)
 *   3. Category overview — 8 clean topic cards (NOT 60+ individual tools)
 *   4. Quick access — Most-used tools for returning users
 *   5. Getting started — 3-step guide for novices
 *   6. Case studies — "Used in real cases" (proven credibility)
 *   7. Full catalog — One click away
 */

/* ------------------------------------------------------------------ */
/*  Category cards — the primary navigation surface                    */
/* ------------------------------------------------------------------ */

interface CategoryCard {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  href: string;
  tone: string;
  pages: number;
}

const CATEGORY_CARDS: CategoryCard[] = [
  {
    id: 'ioc-triage',
    label: 'IOC Triage',
    description: 'Check IPs, domains, URLs, and hashes across 24+ sources. Get consensus verdicts in seconds.',
    icon: Crosshair,
    href: '/dfir/catalog?cat=ioc-triage',
    tone: 'text-rose-600 dark:text-rose-400 bg-white dark:bg-[rgb(18,18,24)] border-slate-200 dark:border-white/10',
    pages: 9,
  },
  {
    id: 'malware',
    label: 'Malware Analysis',
    description: 'Triage samples, parse stealer logs, extract capabilities, and submit to sandboxes.',
    icon: Bug,
    href: '/dfir/catalog?cat=malware',
    tone: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
    pages: 7,
  },
  {
    id: 'email-security',
    label: 'Email Security',
    description: 'Analyze phishing, audit SPF/DKIM/DMARC, check BEC risk, and inspect email headers.',
    icon: Mail,
    href: '/dfir/catalog?cat=email-security',
    tone: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800',
    pages: 5,
  },
  {
    id: 'cloud-iam',
    label: 'Cloud & IAM',
    description: 'Audit AWS, GCP, Azure IAM policies. Analyze CloudTrail, K8s RBAC, and security groups.',
    icon: Shield,
    href: '/dfir/catalog?cat=cloud-iam',
    tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
    pages: 7,
  },
  {
    id: 'detection',
    label: 'Detection & Rules',
    description: 'Author, convert, and test detection rules. Sigma, KQL, YARA, SPL — all in one place.',
    icon: FileSearch,
    href: '/dfir/catalog?cat=detection',
    tone: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    pages: 8,
  },
  {
    id: 'forensics',
    label: 'Forensics & Triage',
    description: 'Parse EVTX logs, registry hives, PCAPs, prefetch files, and iOS backups.',
    icon: FileText,
    href: '/dfir/catalog?cat=forensics',
    tone: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800',
    pages: 8,
  },
  {
    id: 'web-reputation',
    label: 'Web & Domain Intel',
    description: 'Check domain reputation, WHOIS, DNS, certificates, URL safety, and open directories.',
    icon: Globe,
    href: '/dfir/catalog?cat=web-reputation',
    tone: 'text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-800',
    pages: 8,
  },
  {
    id: 'frameworks',
    label: 'Frameworks & Models',
    description: 'MITRE ATT&CK, Diamond Model, Kill Chain, OWASP, STIX/TAXII — visual frameworks for analysis.',
    icon: GitBranch,
    href: '/dfir/catalog?cat=frameworks',
    tone: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800',
    pages: 7,
  },
];

/* ------------------------------------------------------------------ */
/*  Case studies — Huntress "Global Threats We've Wrecked" pattern     */
/* ------------------------------------------------------------------ */

interface ToolCase {
  caseSlug: string;
  caseTitle: string;
  tools: { path: string; label: string }[];
  contribution: string;
}

const TOOL_CASES: ToolCase[] = [
  {
    caseSlug: '/projects/phishing-program-at-scale',
    caseTitle: 'Phishing program at scale (250+ incidents, −25% FPs)',
    tools: [
      { path: '/dfir/ioc-check', label: 'IOC & Hash Checker' },
      { path: '/dfir/email-defense', label: 'Email Defense' },
    ],
    contribution:
      'Cross-source consensus on the IOC checker re-classified ~12% of "suspicious, escalate" cases as single-feed false alarms.',
  },
  {
    caseSlug: '/projects/dmarc-enforcement-1300-domains',
    caseTitle: 'DMARC enforcement across 1,300+ domains',
    tools: [{ path: '/dfir/email-defense', label: 'Email Defense / BEC Score' }],
    contribution: 'The audit rules in Email Defense came directly from the failure modes seen in this rollout.',
  },
  {
    caseSlug: '/projects/dfir-toolkit-design',
    caseTitle: 'Building the toolkit itself: lab → converter loop',
    tools: [
      { path: '/dfir/detection-lab', label: 'Detection Lab' },
      { path: '/dfir/rule-converter', label: 'Rule Converter' },
    ],
    contribution:
      'Author in the lab, prove the rule fires, export to the SIEM dialect you actually run. One detection-engineering loop.',
  },
  {
    caseSlug: '/projects/threat-intel-platform-build',
    caseTitle: 'Autonomous CTI pipeline (layer-1 + layer-2 IOC defence)',
    tools: [{ path: '/dfir/ioc-check', label: 'IOC & Hash Checker' }],
    contribution:
      'The same validators that power the public IOC checker also gate every IOC the autonomous pipeline emits.',
  },
];

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function DFIRPage(): JSX.Element {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [iocInput, setIocInput] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchResults = useMemo(() => (query.trim() ? catalogSearch(query) : null), [query]);
  const isSearching = query.trim().length > 0;
  const location = typeof window !== 'undefined' ? window.location.pathname : '/dfir';
  const { entries: recentTools, isHydrated } = useRecentTools('dfir', location, 6);

  useDocumentMeta({
    title: 'DFIR Toolkit',
    description:
      '60+ browser-side security tools for incident response, forensics, and detection engineering. IOC checks, CVE triage, rule conversion, and more.',
    section: 'DFIR',
    canonicalPath: '/dfir',
    ogImage: '/og-dfir.svg',
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField = target && /^(INPUT|TEXTAREA)$/.test(target.tagName);
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        setQuery('');
        return;
      }
      if (inField) return;
      if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Sidebar lookup for recent tool icons
  const sidebarLookup = useMemo(() => {
    const map = new Map<string, { icon: LucideIcon; label: string }>();
    const sidebar = getSidebarForSection('/dfir');
    if (sidebar) {
      for (const g of sidebar.groups) {
        for (const it of g.items) {
          map.set(it.href, { icon: it.icon, label: it.label });
        }
      }
    }
    return map;
  }, []);

  return (
    <div className="w-full py-4 sm:py-8 text-slate-900 dark:text-slate-100 space-y-6">
      <DfirStructuredData />
      {/* ── Hero — bold value prop + primary search ───────────── */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] p-6 sm:p-8 lg:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-brand-500/10 dark:bg-brand-400/10 blur-3xl"
        />
        <div className="relative">
          <div className="text-mini font-mono uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400 mb-3 inline-flex items-center gap-2">
            Free · No signup · Runs in your browser
          </div>
          <h1 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl leading-[1.1] tracking-tight">
            Investigate faster.
            <br />
            Respond with confidence.
          </h1>
          <p className="text-slate-600 dark:text-slate-300 mt-4 max-w-3xl text-base sm:text-lg leading-relaxed">
            Check if an indicator is malicious, investigate phishing, triage CVEs, convert detection rules, and more —
            60+ tools that run entirely in your browser with no data leaving your machine.
          </p>

          {/* Primary search — the VirusTotal/Shodan pattern */}
          <div className="mt-6 relative max-w-2xl">
            <Search
              size={16}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search 60+ tools — IOC check, phishing, CVEs, decoders..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-24 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20 dark:border-[#1e2030] dark:bg-[#0e0e15] dark:text-slate-100 dark:placeholder:text-slate-500"
              aria-label="Search DFIR tools"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded px-2 py-1 text-xs font-mono text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                aria-label="Clear search"
              >
                <X size={12} /> clear
              </button>
            ) : (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden items-center gap-1 font-mono text-xs text-slate-400 sm:inline-flex">
                <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-700">
                  /
                </kbd>
                <span>or</span>
                <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-700">
                  ⌘K
                </kbd>
              </span>
            )}
          </div>

          {/* Popular shortcuts */}
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span>Popular:</span>
            {[
              { label: 'IOC Check', href: '/dfir/ioc-check' },
              { label: 'Email Defense', href: '/dfir/email-defense' },
              { label: 'CVE Prioritizer', href: '/dfir/cve-prioritizer' },
              { label: 'Rule Converter', href: '/dfir/rule-converter' },
            ].map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-600 dark:border-[#1e2030] dark:bg-[#12121a] dark:text-slate-300 dark:hover:border-brand-600 dark:hover:text-brand-400 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Stats — Huntress "5M+ endpoints" pattern */}
          <div className="mt-6 flex flex-wrap gap-6 text-sm">
            {[
              { value: `${MAIN_TOOL_COUNT}+`, label: 'tools' },
              { value: '24', label: 'IOC sources' },
              { value: '0', label: 'data leaves your browser' },
            ].map((stat) => (
              <div key={stat.label} className="flex items-baseline gap-1.5">
                <span className="font-display text-xl font-bold text-slate-900 dark:text-white">{stat.value}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Personalized workspace — "Continue where you left off" */}
      {isHydrated && recentTools.length > 0 && (
        <section className="rounded-xl border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-brand-600 dark:text-brand-400" />
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Continue where you left off
              </h2>
            </div>
            <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
              {recentTools.length} recent
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {recentTools.map((entry) => {
              const meta = sidebarLookup.get(entry.path);
              const Icon = meta?.icon ?? Clock;
              return (
                <Link
                  key={entry.path}
                  to={entry.path}
                  className="group inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:border-brand-500/40 hover:bg-brand-50/50 dark:border-[#1e2030] dark:bg-[#15151f] dark:text-slate-300 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10 transition-colors"
                >
                  <Icon
                    size={12}
                    className="text-slate-500 group-hover:text-brand-500 dark:text-slate-400 dark:group-hover:text-brand-400"
                  />
                  <span>{meta?.label ?? entry.label}</span>
                  <ArrowRight size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Quick IOC check — paste an indicator inline */}
      <section className="rounded-xl border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Hash size={14} className="text-brand-600 dark:text-brand-400" />
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">Quick IOC check</h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Paste an IP, domain, URL, or hash and get an instant verdict from 24 sources.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={iocInput}
            onChange={(e) => setIocInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && iocInput.trim()) {
                navigate(`/dfir/ioc-check?indicator=${encodeURIComponent(iocInput.trim())}`);
              }
            }}
            placeholder="e.g. 8.8.8.8, evil.com, hash..."
            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20 dark:border-[#1e2030] dark:bg-[#0e0e15] dark:text-slate-100 dark:placeholder:text-slate-500"
            aria-label="Enter IOC to check"
          />
          <button
            type="button"
            onClick={() => {
              if (iocInput.trim()) {
                navigate(`/dfir/ioc-check?indicator=${encodeURIComponent(iocInput.trim())}`);
              }
            }}
            disabled={!iocInput.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Search size={12} />
            Check
          </button>
        </div>
      </section>

      {/* ── Search results (when typing) ─────────────────────── */}
      {isSearching && (
        <section className="animate-fade-in-up">
          <div className="font-mono text-xs text-slate-500 mb-4">
            {searchResults?.length ?? 0} {searchResults?.length === 1 ? 'match' : 'matches'} for &ldquo;{query.trim()}
            &rdquo;
            {(searchResults?.length ?? 0) === 0 && ' — try fewer or different keywords'}
          </div>
          {searchResults && searchResults.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {searchResults.map(({ category, ...t }) => {
                const Icon = t.icon ?? category.icon;
                return (
                  <li key={t.path}>
                    <Link
                      to={t.path}
                      className="group block h-full rounded-xl border border-slate-200 bg-white p-4 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-e2 dark:border-[#1e2030] dark:bg-[#12121a]"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <Icon size={16} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-400" />
                        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          {category.label}
                        </span>
                      </div>
                      <h3 className="font-display text-sm font-semibold text-slate-900 group-hover:text-brand-600 dark:text-slate-100 dark:group-hover:text-brand-400">
                        {t.label}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{t.desc}</p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {searchResults && searchResults.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">No matches. Try different keywords.</p>
            </div>
          )}
        </section>
      )}

      {/* ── Non-search content ───────────────────────────────── */}
      {!isSearching && (
        <>
          {/* ── Quick access — always visible, no scrolling needed */}
          <section>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'IOC Check', desc: '24 sources, streaming verdicts', href: '/dfir/ioc-check', icon: Hash },
                { label: 'Email Defense', desc: 'SPF / DKIM / DMARC audit', href: '/dfir/email-defense', icon: Mail },
                {
                  label: 'CVE Prioritizer',
                  desc: 'CVSS + EPSS + KEV in one call',
                  href: '/dfir/cve-prioritizer',
                  icon: ShieldAlert,
                },
                {
                  label: 'Rule Converter',
                  desc: 'Sigma ↔ KQL ↔ SPL ↔ YARA',
                  href: '/dfir/rule-converter',
                  icon: GitBranch,
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-e2 dark:border-[#1e2030] dark:bg-[#12121a]"
                  >
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-50 dark:bg-white/5 text-brand-600 dark:text-brand-400 shrink-0">
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {item.label}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{item.desc}</p>
                    </div>
                    <ArrowRight
                      size={14}
                      className="ml-auto text-slate-300 dark:text-slate-700 group-hover:text-brand-500 transition-colors shrink-0"
                    />
                  </Link>
                );
              })}
            </div>
          </section>

          {/* ── Collapsible: Explore by topic */}
          <details className="group rounded-xl border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a]">
            <summary className="flex items-center justify-between cursor-pointer p-4 sm:p-5 select-none">
              <div>
                <h2 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">Explore by topic</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  8 categories · {MAIN_TOOL_COUNT}+ tools
                </p>
              </div>
              <ArrowRight size={16} className="text-slate-400 group-open:rotate-90 transition-transform" />
            </summary>
            <div className="px-4 sm:px-5 pb-4 sm:pb-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {CATEGORY_CARDS.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <Link
                      key={cat.id}
                      to={cat.href}
                      className={`group relative rounded-xl border p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-e2 ${cat.tone}`}
                    >
                      <Icon size={20} className="mb-2" aria-hidden="true" />
                      <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">
                        {cat.label}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3">
                        {cat.description}
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                          {cat.pages} tools
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                          explore <ArrowRight size={10} />
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </details>

          {/* ── Collapsible: Getting started */}
          <details className="group rounded-xl border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a]">
            <summary className="flex items-center justify-between cursor-pointer p-4 sm:p-5 select-none">
              <h2 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">New here?</h2>
              <ArrowRight size={16} className="text-slate-400 group-open:rotate-90 transition-transform" />
            </summary>
            <div className="px-4 sm:px-5 pb-4 sm:pb-5">
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  {
                    step: '1',
                    title: 'Pick a task',
                    desc: 'What are you trying to do? Check an indicator? Investigate phishing? Triage a CVE?',
                  },
                  {
                    step: '2',
                    title: 'Find the tool',
                    desc: 'Use the search bar or category cards above to find the right tool for your job.',
                  },
                  {
                    step: '3',
                    title: 'Get results',
                    desc: 'Everything runs in your browser. No signup, no data leaves your machine.',
                  },
                ].map((s) => (
                  <div key={s.step} className="flex gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 dark:bg-white/5 font-mono text-sm font-bold text-brand-600 dark:text-brand-400">
                      {s.step}
                    </span>
                    <div>
                      <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {s.title}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </details>

          {/* ── Collapsible: Case studies */}
          <details className="group rounded-xl border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a]">
            <summary className="flex items-center justify-between cursor-pointer p-4 sm:p-5 select-none">
              <div>
                <h2 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">
                  Used in real cases
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {TOOL_CASES.length} case studies · real incidents
                </p>
              </div>
              <ArrowRight size={16} className="text-slate-400 group-open:rotate-90 transition-transform" />
            </summary>
            <div className="px-4 sm:px-5 pb-4 sm:pb-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {TOOL_CASES.map((tc) => (
                  <Link
                    key={tc.caseSlug}
                    to={tc.caseSlug}
                    className="group rounded-xl border border-slate-200 bg-slate-50 p-4 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-e2 dark:border-[#1e2030] dark:bg-[#15151f]"
                  >
                    <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 mb-1.5">
                      {tc.caseTitle}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-2 line-clamp-2">
                      {tc.contribution}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {tc.tools.map((t) => (
                        <span
                          key={t.path}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-brand-500/30 text-brand-600 dark:text-brand-400"
                        >
                          {t.label}
                        </span>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </details>

          {/* ── Full catalog link */}
          <div className="flex justify-center">
            <Link
              to="/dfir/catalog"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 hover:border-brand-300 hover:text-brand-600 dark:border-[#1e2030] dark:bg-[#12121a] dark:text-slate-300 dark:hover:border-brand-600 dark:hover:text-brand-400 transition-colors"
            >
              <Compass size={16} />
              Browse the full catalog
              <span className="font-mono text-xs text-slate-400 dark:text-slate-500">{MAIN_TOOL_COUNT}+ tools</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
