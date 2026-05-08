import { Link } from 'react-router-dom';
import {
  Hash,
  ShieldAlert,
  Globe,
  Radar,
  FileSearch,
  BookOpen,
  Clock,
  Users,
  Lock,
  Newspaper,
  type LucideIcon,
} from 'lucide-react';

interface Tool {
  path: string;
  label: string;
  desc: string;
  icon: LucideIcon;
}

const TOOLS: Tool[] = [
  { path: '/dfir/ioc-check', label: 'IOC Checker', desc: 'IPs · domains · URLs · hashes', icon: Hash },
  { path: '/dfir/phishing', label: 'Phishing Analyzer', desc: 'Email headers + content', icon: ShieldAlert },
  { path: '/dfir/domain', label: 'Domain Lookup', desc: 'WHOIS · DNS · email auth', icon: Globe },
  { path: '/dfir/exposure', label: 'Exposure Scanner', desc: 'Subdomains + open ports', icon: Radar },
  { path: '/dfir/file', label: 'File Analyzer', desc: 'Hash-based lookups', icon: FileSearch },
  { path: '/dfir/wiki', label: 'Knowledge Base', desc: 'Concepts + playbooks', icon: BookOpen },
  { path: '/dfir/dashboard', label: 'Recent Lookups', desc: 'Your last 20 queries', icon: Clock },
  { path: '/dfir/actors', label: 'Threat Actors', desc: 'APT catalog · STIX-aware', icon: Users },
  { path: '/dfir/privacy', label: 'Privacy Check', desc: 'IP · WebRTC · fingerprint', icon: Lock },
  { path: '/dfir/briefings', label: 'Intel Briefings', desc: 'IOC feeds · daily summaries', icon: Newspaper },
];

export function ToolGrid(): JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {TOOLS.map(({ path, label, desc, icon: Icon }) => (
        <Link
          key={path}
          to={path}
          className="group block rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-brand-500/40 hover:bg-slate-50 dark:bg-slate-800 transition-colors"
        >
          <div className="flex items-center gap-3 mb-2">
            <Icon size={18} className="text-brand-600 dark:text-brand-400" aria-hidden="true" />
            <span className="font-display font-semibold text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:text-brand-400 transition-colors">
              {label}
            </span>
          </div>
          <p className="text-sm font-mono text-slate-600 dark:text-slate-400 leading-relaxed">{desc}</p>
        </Link>
      ))}
    </div>
  );
}
