import { Link } from 'react-router-dom';
import {
  ArrowRight,
  AtSign,
  Domain,
  FileText,
  Globe,
  Hash,
  Mail,
  MapPin,
  Phone,
  Search,
  Server,
  Shield,
  User,
} from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';

const OSINT_TOOLS = [
  {
    id: 'domain',
    label: 'Domain Investigation',
    icon: Globe,
    href: '/osint/domain',
    desc: 'WHOIS, DNS, subdomains, takeovers, SSL certs',
    color: 'bg-sky-600',
  },
  {
    id: 'ip',
    label: 'IP Investigation',
    icon: Server,
    href: '/osint/ip',
    desc: 'Geolocation, ASN, reverse DNS, open ports, abuse reports',
    color: 'bg-rose-600',
  },
  {
    id: 'username',
    label: 'Username OSINT',
    icon: User,
    href: '/osint/username',
    desc: 'Check username across 400+ platforms',
    color: 'bg-violet-600',
  },
  {
    id: 'email',
    label: 'Email Investigation',
    icon: Mail,
    href: '/osint/email',
    desc: 'Email validation, breach checks, social profiles',
    color: 'bg-amber-600',
  },
  {
    id: 'phone',
    label: 'Phone OSINT',
    icon: Phone,
    href: '/osint/phone',
    desc: 'Carrier lookup, validation, social engineering checks',
    color: 'bg-emerald-600',
  },
  {
    id: 'recon',
    label: 'Recon Toolkit',
    icon: Search,
    href: '/osint/recon',
    desc: 'Google dorks, Shodan, Censys, certificate transparency',
    color: 'bg-orange-600',
  },
  {
    id: 'dns',
    label: 'DNS Investigation',
    icon: Hash,
    href: '/osint/dns',
    desc: 'DNS records, zone transfers, passive DNS',
    color: 'bg-teal-600',
  },
  {
    id: 'subdomain',
    label: 'Subdomain Discovery',
    icon: Domain,
    href: '/osint/subdomain',
    desc: 'Subdomain enumeration, takeover checks',
    color: 'bg-indigo-600',
  },
  {
    id: 'whois',
    label: 'WHOIS History',
    icon: FileText,
    href: '/osint/whois',
    desc: 'Historical WHOIS records, registrant changes',
    color: 'bg-pink-600',
  },
  {
    id: 'geolocation',
    label: 'Geolocation',
    icon: MapPin,
    href: '/osint/geolocation',
    desc: 'IP/city/country mapping, ASN details',
    color: 'bg-cyan-600',
  },
];

export default function OsintHub() {
  return (
    <>
      <PageMeta
        title="OSINT Tools"
        description="Open-source intelligence tools for investigators and security researchers."
        canonicalPath="/osint"
      />

      <div className="min-h-screen bg-[rgb(var(--surface-100))]">
        {/* Hero Header */}
        <div className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Search size={32} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">OSINT Toolkit</h1>
            <p className="text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
              Open-source intelligence tools for security researchers, investigators, and penetration testers.
              Investigate domains, IPs, usernames, emails, and phone numbers.
            </p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          {/* Quick Search */}
          <div className="mb-8">
            <div className="relative max-w-2xl mx-auto">
              <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Enter a domain, IP, username, email, or phone number..."
                className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-base text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 shadow-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (!val) return;
                    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(val))
                      window.location.href = `/osint/ip?q=${encodeURIComponent(val)}`;
                    else if (val.includes('@')) window.location.href = `/osint/email?q=${encodeURIComponent(val)}`;
                    else if (/^\+?\d{7,15}$/.test(val.replace(/[\s\-()]/g, '')))
                      window.location.href = `/osint/phone?q=${encodeURIComponent(val)}`;
                    else if (val.includes('.') && !val.includes(' '))
                      window.location.href = `/osint/domain?q=${encodeURIComponent(val)}`;
                    else window.location.href = `/osint/username?q=${encodeURIComponent(val)}`;
                  }
                }}
              />
            </div>
          </div>

          {/* Tool Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {OSINT_TOOLS.map((tool) => (
              <Link
                key={tool.id}
                to={tool.href}
                className="group rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-5 hover:shadow-lg hover:border-brand-300 dark:hover:border-brand-700 transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl ${tool.color} flex items-center justify-center shrink-0`}>
                    <tool.icon size={22} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                      {tool.label}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{tool.desc}</p>
                  </div>
                  <ArrowRight
                    size={16}
                    className="text-slate-300 group-hover:text-brand-500 mt-1 shrink-0 transition-colors"
                  />
                </div>
              </Link>
            ))}
          </div>

          {/* Features */}
          <div className="mt-12 grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center mx-auto mb-3">
                <Shield size={24} className="text-brand-600 dark:text-brand-400" />
              </div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">Passive Recon</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                All lookups are passive — no active scanning or exploitation.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center mx-auto mb-3">
                <Globe size={24} className="text-brand-600 dark:text-brand-400" />
              </div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">Multi-Source</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Data aggregated from WHOIS, DNS, Shodan, AbuseIPDB, and more.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center mx-auto mb-3">
                <Search size={24} className="text-brand-600 dark:text-brand-400" />
              </div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">Instant Results</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Fast lookups with cached results for repeat queries.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
