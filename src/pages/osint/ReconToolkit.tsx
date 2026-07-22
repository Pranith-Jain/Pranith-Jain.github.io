import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, FileText, Globe, Hash, Search, Server, Shield } from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';

const RECON_TOOLS = [
  {
    name: 'Google Dorks',
    description: 'Advanced Google search operators for finding exposed information',
    href: '/dfir/google-dorks',
    icon: Search,
    color: 'bg-sky-600',
  },
  {
    name: 'Shodan',
    description: 'Search engine for internet-connected devices',
    href: 'https://shodan.io',
    external: true,
    icon: Server,
    color: 'bg-rose-600',
  },
  {
    name: 'Censys',
    description: 'Internet-wide scanning and certificate transparency',
    href: 'https://censys.io',
    external: true,
    icon: Globe,
    color: 'bg-violet-600',
  },
  {
    name: 'Certificate Transparency',
    description: 'Search CT logs for issued certificates',
    href: '/dfir/cert-search',
    icon: Shield,
    color: 'bg-emerald-600',
  },
  {
    name: 'Wayback Machine',
    description: 'Historical snapshots of web pages',
    href: '/dfir/wayback',
    icon: FileText,
    color: 'bg-amber-600',
  },
  {
    name: 'OSINT Framework',
    description: 'Collection of OSINT tools and resources',
    href: '/dfir/osint-framework',
    icon: Globe,
    color: 'bg-indigo-600',
  },
  {
    name: 'DNS Enumeration',
    description: 'DNS record lookup and zone transfer testing',
    href: '/osint/dns',
    icon: Hash,
    color: 'bg-teal-600',
  },
  {
    name: 'Subdomain Discovery',
    description: 'Find subdomains for any domain',
    href: '/osint/subdomain',
    icon: Globe,
    color: 'bg-pink-600',
  },
];

export default function ReconToolkit() {
  return (
    <>
      <PageMeta
        title="Recon Toolkit"
        description="OSINT reconnaissance tools and resources."
        canonicalPath="/osint/recon"
      />
      <div className="min-h-screen bg-[rgb(var(--surface-100))]">
        <div className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
            <div className="flex items-center gap-3">
              <Link
                to="/osint"
                className="p-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-slate-50"
              >
                <ArrowLeft size={16} className="text-slate-600" />
              </Link>
              <div className="w-10 h-10 rounded-lg bg-orange-600 flex items-center justify-center">
                <Search size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Recon Toolkit</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">OSINT reconnaissance tools and resources</p>
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <div className="grid sm:grid-cols-2 gap-4">
            {RECON_TOOLS.map((tool) => (
              <a
                key={tool.name}
                href={tool.href}
                target={tool.external ? '_blank' : undefined}
                rel={tool.external ? 'noopener noreferrer' : undefined}
                className="group rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-5 hover:shadow-md transition-all flex items-start gap-4"
              >
                <div className={`w-12 h-12 rounded-xl ${tool.color} flex items-center justify-center shrink-0`}>
                  <tool.icon size={22} className="text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-brand-600 transition-colors flex items-center gap-2">
                    {tool.name}
                    {tool.external && <ExternalLink size={12} className="text-slate-400" />}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{tool.description}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
