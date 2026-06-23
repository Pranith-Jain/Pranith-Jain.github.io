import { useMemo } from 'react';
import { ExternalLink, ArrowRight, Globe, Server, Hash, Network, Fingerprint, Shield } from 'lucide-react';
import type { ProviderResultWire, ProviderId } from '../../lib/dfir/types';

interface Pivot {
  label: string;
  value: string;
  kind: 'domain' | 'ip' | 'hash' | 'asn' | 'url' | 'hostname' | 'org';
  source: ProviderId;
}

/**
 * Extract pivot artifacts from each provider's raw_summary.
 *
 * raw_summary shapes are deliberately Spartan (aggregate counts, not full
 * result items).  We extract whatever structured data each adapter actually
 * emits — see api/src/providers/<name>.ts for exact field names.
 */
function extractPivots(results: ProviderResultWire[], indicatorValue: string): Pivot[] {
  const pivots: Pivot[] = [];

  for (const r of results) {
    if (r.status !== 'ok' || r.verdict === 'clean') continue;
    const s = r.raw_summary ?? {};

    switch (r.source) {
      case 'shodan': {
        const org = s.org as string | undefined;
        if (org) pivots.push({ label: 'Shodan organization', value: org, kind: 'org', source: 'shodan' });
        const vulns = s.vulns as string[] | undefined;
        if (Array.isArray(vulns))
          for (const v of vulns) pivots.push({ label: 'Shodan CVE', value: v, kind: 'hash', source: 'shodan' });
        break;
      }
      case 'censys': {
        const asn = s.asn as string | number | undefined;
        if (asn !== undefined) pivots.push({ label: 'Censys ASN', value: `AS${asn}`, kind: 'asn', source: 'censys' });
        const asName = s.as_name as string | undefined;
        if (asName) pivots.push({ label: 'Censys AS name', value: asName, kind: 'org', source: 'censys' });
        break;
      }
      case 'netlas': {
        const domains = s.domains as string[] | undefined;
        if (Array.isArray(domains))
          for (const d of domains)
            if (d !== indicatorValue)
              pivots.push({ label: 'Netlas domain', value: d, kind: 'domain', source: 'netlas' });
        const asn = s.asn as string | number | undefined;
        if (asn !== undefined) pivots.push({ label: 'Netlas ASN', value: `AS${asn}`, kind: 'asn', source: 'netlas' });
        const asName = s.as_name as string | undefined;
        if (asName) pivots.push({ label: 'Netlas AS name', value: asName, kind: 'org', source: 'netlas' });
        break;
      }
      case 'malwarebazaar': {
        const sha256 = s.sha256_hash as string | undefined;
        if (sha256 && sha256 !== indicatorValue)
          pivots.push({ label: 'MalwareBazaar SHA-256', value: sha256, kind: 'hash', source: 'malwarebazaar' });
        break;
      }
      case 'greynoise': {
        const name = s.name as string | undefined;
        if (name) pivots.push({ label: 'GreyNoise context', value: name, kind: 'org', source: 'greynoise' });
        break;
      }
      case 'otx': {
        const samplePulses = s.sample_pulses as string[] | undefined;
        if (Array.isArray(samplePulses))
          for (const p of samplePulses.slice(0, 5))
            pivots.push({ label: 'OTX pulse', value: p, kind: 'hostname', source: 'otx' });
        break;
      }
      case 'urlscan': {
        const link = s.link as string | undefined;
        if (link) pivots.push({ label: 'URLScan report', value: link, kind: 'url', source: 'urlscan' });
        break;
      }
    }
  }

  return dedupePivots(pivots).slice(0, 20);
}

function dedupePivots(pivots: Pivot[]): Pivot[] {
  const seen = new Set<string>();
  return pivots.filter((p) => {
    const key = `${p.kind}:${p.value.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pivotUrl(p: Pivot): string {
  const val = encodeURIComponent(p.value);
  switch (p.kind) {
    case 'domain':
      return `/dfir/domain?domain=${val}`;
    case 'ip':
      return `/dfir/ioc-check?indicator=${val}`;
    case 'hash':
      return `/dfir/ioc-check?indicator=${val}`;
    case 'asn':
      return `/dfir/asn-lookup?asn=${val.replace(/^AS/i, '')}`;
    case 'hostname':
      return `/dfir/domain?domain=${val}`;
    case 'org':
      return `/dfir/ioc-check?indicator=${val}`;
    case 'url':
      return `/dfir/url-preview?url=${val}`;
    default:
      return `/dfir/ioc-check?indicator=${val}`;
  }
}

function externalUrl(p: Pivot): string | null {
  const val = encodeURIComponent(p.value);
  switch (p.kind) {
    case 'domain':
      return `https://www.virustotal.com/gui/domain/${val}`;
    case 'ip':
      return `https://www.virustotal.com/gui/ip-address/${val}`;
    case 'hash':
      return `https://bazaar.abuse.ch/sample/${val}/`;
    case 'asn':
      return `https://ipinfo.io/AS${val.replace(/^AS/i, '')}`;
    default:
      return null;
  }
}

const KIND_ICON: Record<Pivot['kind'], typeof Globe> = {
  domain: Globe,
  ip: Server,
  hash: Hash,
  asn: Network,
  url: ExternalLink,
  hostname: Globe,
  org: Shield,
};

export function PivotsTab({
  results,
  indicatorValue,
}: {
  results: ProviderResultWire[];
  indicatorValue: string;
}): JSX.Element | null {
  const pivots = useMemo(() => extractPivots(results, indicatorValue), [results, indicatorValue]);

  if (pivots.length === 0) return null;

  return (
    <section className="mb-8 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Fingerprint size={16} className="text-brand-600 dark:text-brand-400" />
        <h3 className="font-display font-semibold text-base">Pivots — extracted artifacts</h3>
        <span className="text-mini font-mono text-slate-500">
          · {pivots.length} artifact{pivots.length !== 1 ? 's' : ''}
        </span>
      </div>
      <p className="text-mini font-mono text-slate-500 mb-3">
        ASNs, domains, CVEs, orgs, and hashes extracted from provider raw results. → Pivot opens the artifact
        in-platform; ↗ Open follows up externally.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {pivots.map((p, i) => {
          const Icon = KIND_ICON[p.kind];
          return (
            <div
              key={`${p.kind}-${p.value}-${i}`}
              className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3 flex items-center justify-between gap-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Icon size={11} className="text-slate-500 shrink-0" />
                  <span className="text-micro font-mono uppercase tracking-wider text-slate-500">{p.kind}</span>
                  <span className="text-micro font-mono rounded px-1 bg-slate-200 dark:bg-[rgb(var(--surface-300))] text-slate-500">
                    {p.source}
                  </span>
                </div>
                <code
                  className="text-meta font-mono text-slate-900 dark:text-slate-100 break-all block truncate"
                  title={p.value}
                >
                  {p.value}
                </code>
                <span className="text-micro font-mono text-slate-400 truncate block">{p.label}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={pivotUrl(p)}
                  className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] p-1.5 text-slate-500 hover:text-brand-600 hover:border-brand-500/40 transition-colors"
                  title="Pivot in-platform"
                >
                  <ArrowRight size={12} />
                </a>
                {externalUrl(p) && (
                  <a
                    href={externalUrl(p)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] p-1.5 text-slate-500 hover:text-brand-600 hover:border-brand-500/40 transition-colors"
                    title="Open externally"
                  >
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-micro font-mono text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
          Why some providers are missing
        </summary>
        <p className="mt-2 text-micro font-mono text-slate-400 leading-relaxed">
          Several enrichment providers (URLScan, VirusTotal, and others) only return aggregate scores and counts in
          their raw_summary, not the individual result items needed for pivots. The artifacts shown are extracted from
          the structured fields each provider actually emits — a quiet adapter means fewer pivots, not a platform gap.
        </p>
      </details>
    </section>
  );
}
