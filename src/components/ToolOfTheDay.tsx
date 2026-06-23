import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Wrench, ArrowRight, Sparkles } from 'lucide-react';
import { preloadRoute } from '../lib/route-preloaders';

const TOOLS = [
  {
    path: '/dfir/ioc-check',
    name: 'IOC & Hash Checker',
    desc: 'Check IPs, domains, URLs, and hashes across 24+ sources.',
  },
  { path: '/dfir/phishing', name: 'Phishing Analyzer', desc: 'Analyze email headers and detect phishing attempts.' },
  { path: '/dfir/cve-prioritizer', name: 'CVE Prioritizer', desc: 'Prioritize CVEs with CVSS, EPSS, and KEV data.' },
  {
    path: '/dfir/rule-converter',
    name: 'Detection Rule Converter',
    desc: 'Convert between Sigma, KQL, SPL, and YARA.',
  },
  { path: '/dfir/email-defense', name: 'Email Defense', desc: 'Audit SPF, DKIM, DMARC, and BIMI records.' },
  {
    path: '/threatintel/actors/kb',
    name: 'Threat Actor KB',
    desc: 'Research threat actors, their TTPs and infrastructure.',
  },
  {
    path: '/threatintel/ransomware-live',
    name: 'Ransomware Live',
    desc: 'Monitor active ransomware leak sites in real-time.',
  },
  {
    path: '/threatintel/predictive/global-pulse',
    name: 'Global Pulse',
    desc: 'Interactive 3D globe showing global threat activity.',
  },
  { path: '/dfir/yara-workbench', name: 'YARA Workbench', desc: 'Author, test, and refine YARA detection rules.' },
  {
    path: '/dfir/stealer-parser',
    name: 'Infostealer Log Parser',
    desc: 'Parse stealer logs from RedLine, Raccoon, Vidar.',
  },
];

function getToolOfTheDay(): (typeof TOOLS)[0] {
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  return TOOLS[seed % TOOLS.length];
}

export function ToolOfTheDay(): JSX.Element | null {
  const [tool, setTool] = useState<(typeof TOOLS)[0] | null>(null);

  useEffect(() => {
    setTool(getToolOfTheDay());
  }, []);

  if (!tool) return null;

  return (
    <section className="group relative overflow-hidden rounded-lg border border-slate-200/70 dark:border-[rgb(var(--border-400))] p-5 transition-all duration-200 hover:border-brand-300/50 dark:hover:border-brand-500/30 hover:shadow-md dark:hover:shadow-brand-500/5">
      {/* Subtle gradient */}
      <div aria-hidden className="absolute inset-0 bg-[rgb(var(--hover-100))]" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <div className="grid h-6 w-6 place-items-center rounded bg-brand-500/10 text-brand-600 dark:text-brand-400">
            <Sparkles size={12} />
          </div>
          <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Tool of the Day
          </h3>
        </div>
        <Link
          to={tool.path}
          className="group block"
          onMouseEnter={() => preloadRoute(tool.path)}
          onFocus={() => preloadRoute(tool.path)}
        >
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/10 dark:bg-brand-500/15 text-brand-600 dark:text-brand-400 shrink-0">
              <Wrench size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                {tool.name}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{tool.desc}</p>
            </div>
            <ArrowRight
              size={14}
              className="text-slate-400 dark:text-slate-400 group-hover:text-brand-500 transition-colors shrink-0 mt-1"
            />
          </div>
        </Link>
      </div>
    </section>
  );
}
