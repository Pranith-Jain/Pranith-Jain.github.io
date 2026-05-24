import { Search, Globe, FileText, Hash, Shield, ExternalLink, Users } from 'lucide-react';
import type { Verdict } from '../../lib/dfir/types';

/**
 * Pivot Matrix — investigation guidance after enrichment.
 *
 * Inspired by Hokage-Intel's Pivot Matrix: personalized next steps based
 * on indicator type and verdict, with action buttons that link to other
 * tools in the platform.
 */

interface Pivot {
  label: string;
  desc: string;
  icon: typeof Search;
  href: string;
  external?: boolean;
}

export function PivotMatrix({ type, value, verdict }: { type: string; value: string; verdict: Verdict }): JSX.Element {
  const pivots: Pivot[] = [];

  if (type === 'ipv4' || type === 'ipv6') {
    pivots.push({
      label: 'Domain lookup',
      desc: 'Reverse DNS / RDAP / email auth',
      icon: Globe,
      href: `/dfir/domain/lookup?domain=${encodeURIComponent(value)}`,
    });
    pivots.push({
      label: 'ASN enrichment',
      desc: 'Shodan / Censys / Netlas',
      icon: Shield,
      href: `/dfir/asn/lookup?ip=${encodeURIComponent(value)}`,
    });
    pivots.push({
      label: 'Geo IP',
      desc: 'Location / ISP / carrier',
      icon: Globe,
      href: `/dfir/ip-geo?ip=${encodeURIComponent(value)}`,
    });
  }

  if (type === 'domain') {
    pivots.push({
      label: 'Full exposure scan',
      desc: 'Subdomains / certificates / email auth',
      icon: Search,
      href: `/dfir/exposure/scan?domain=${encodeURIComponent(value)}`,
    });
    pivots.push({
      label: 'Certificate search',
      desc: 'crt.sh certificate transparency',
      icon: FileText,
      href: `/dfir/cert-search?domain=${encodeURIComponent(value)}`,
    });
  }

  if (type === 'hash') {
    pivots.push({
      label: 'MalwareBazaar',
      desc: 'Sample metadata / signatures',
      icon: Hash,
      href: `https://bazaar.abuse.ch/browse.php?search=sha256:${encodeURIComponent(value)}`,
      external: true,
    });
    pivots.push({
      label: 'VirusTotal',
      desc: 'Detection ratios / behaviour',
      icon: Search,
      href: `https://virustotal.com/gui/file/${encodeURIComponent(value)}`,
      external: true,
    });
  }

  if (type === 'url') {
    pivots.push({
      label: 'URLscan preview',
      desc: 'Screenshots / DOM / requests',
      icon: Search,
      href: `https://urlscan.io/search/#${encodeURIComponent(value)}`,
      external: true,
    });
  }

  if (verdict === 'malicious' || verdict === 'suspicious') {
    pivots.push({
      label: 'ThreatFox lookup',
      desc: 'C2 / malware family attribution',
      icon: Shield,
      href: `/dfir/ioc-check?indicator=${encodeURIComponent(value)}`,
    });
    pivots.push({
      label: 'Actor KB',
      desc: 'Check known actor TTPs',
      icon: Users,
      href: '/threatintel/actor-kb',
    });
  }

  if (pivots.length === 0) return <></>;

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 mb-6">
      <h3 className="font-display font-semibold text-base mb-3 inline-flex items-center gap-2">
        <Search size={15} className="text-brand-600 dark:text-brand-400" />
        Pivot Matrix — investigation steps
      </h3>
      <div className="grid sm:grid-cols-2 gap-3">
        {pivots.map((p) => (
          <a
            key={p.label}
            href={p.href}
            target={p.external ? '_blank' : undefined}
            rel={p.external ? 'noopener noreferrer' : undefined}
            className="flex items-start gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 hover:border-brand-500/40 hover:bg-brand-500/5 transition-colors group"
          >
            <p.icon size={16} className="mt-0.5 shrink-0 text-slate-400 group-hover:text-brand-500" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                {p.label}
                {p.external && <ExternalLink size={11} className="text-slate-400" />}
              </div>
              <p className="text-[11px] font-mono text-slate-500 mt-0.5">{p.desc}</p>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
