import { useState } from 'react';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Globe, Search, ShieldCheck, Loader2 } from 'lucide-react';

interface DnsSection {
  id: string;
  label: string;
  status: 'done' | 'loading' | 'pending';
  data: string[];
}

function generateMockSections(domain: string): DnsSection[] {
  return [
    {
      id: 'whois',
      label: 'WHOIS · RDAP',
      status: 'done',
      data: [
        `Registrar: Namecheap`,
        `Created: 2020-03-15`,
        `Expires: 2027-03-15`,
        `Name servers: dns1.example.com, dns2.example.com`,
      ],
    },
    {
      id: 'dns',
      label: 'Live DNS Records',
      status: 'done',
      data: [`A → 192.0.2.10`, `MX → mail.${domain} (priority 10)`, `TXT → v=spf1 include:_spf.google.com ~all`],
    },
    {
      id: 'email',
      label: 'Email Infrastructure',
      status: 'done',
      data: [`SPF: Pass`, `DKIM: selector1._domainkey.${domain}`, `DMARC: p=reject`, `BIMI: Not configured`],
    },
    {
      id: 'asn',
      label: 'ASN · Network',
      status: 'done',
      data: [`AS15169 (Google LLC)`, `Prefix: 192.0.2.0/24`, `Country: US`],
    },
    {
      id: 'passive',
      label: 'Passive DNS',
      status: 'done',
      data: [`mail.${domain} → 192.0.2.10 (2024-01-01)`, `www.${domain} → 192.0.2.20 (2024-06-15)`],
    },
    {
      id: 'certs',
      label: 'Certificates · CT Logs',
      status: 'done',
      data: [`3 certificates found`, `Issuer: Let's Encrypt`, `SANs: ${domain}, www.${domain}`],
    },
    {
      id: 'subs',
      label: 'Subdomains',
      status: 'done',
      data: [`www.${domain}`, `mail.${domain}`, `api.${domain}`, `cdn.${domain}`],
    },
    {
      id: 'lookalike',
      label: 'Lookalike · Permutations',
      status: 'done',
      data: [`${domain.replace(/\./g, '')}-secure.com`, `${domain.replace(/\./g, '')}-login.com`],
    },
    {
      id: 'cohosted',
      label: 'Co-Hosted Infrastructure',
      status: 'done',
      data: [`other-site.com (192.0.2.10)`, `another-site.org (192.0.2.10)`],
    },
    {
      id: 'ports',
      label: 'Ports · Services',
      status: 'done',
      data: [`22/tcp (SSH)`, `80/tcp (HTTP)`, `443/tcp (HTTPS)`],
    },
    {
      id: 'fingerprints',
      label: 'Fingerprints · JARM · Favicon',
      status: 'done',
      data: [`JARM: 29d21d...`, `Favicon hash: e4a5b64e...`, `TLS: TLS 1.3`],
    },
    {
      id: 'cloud',
      label: 'Cloud · Hosting Provider',
      status: 'done',
      data: [`Google Cloud Platform (GCP)`, `Region: us-central1`],
    },
    { id: 'cdn', label: 'CDN · WAF Detection', status: 'done', data: [`Cloudflare detected`, `WAF: Enabled`] },
    {
      id: 'urlscan',
      label: 'URLScan · Screenshot',
      status: 'done',
      data: [`Last scan: 2026-06-15`, `Screenshot available`, `Categories: hosting, business`],
    },
  ];
}

export default function Dnscope(): JSX.Element {
  const [domain, setDomain] = useState('');
  const [scanning, setScanning] = useState(false);
  const [sections, setSections] = useState<DnsSection[]>([]);

  const runScan = async () => {
    if (!domain.trim()) return;
    setScanning(true);
    const mock = generateMockSections(domain.trim());
    setSections(mock.map((s) => ({ ...s, status: 'loading' as const })));
    for (let i = 0; i < mock.length; i++) {
      await new Promise((r) => setTimeout(r, 200));
      setSections((prev) => prev.map((s, j) => (j === i ? { ...s, status: 'done' as const } : s)));
    }
    setScanning(false);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-10">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Globe size={28} className="text-brand-600 dark:text-brand-400" /> DNSCOPE
        </h1>
        <p className="text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
          Deep domain infrastructure mapping across 14 data dimensions. WHOIS, DNS records, certificates, subdomains,
          lookalikes, ports, CDN detection, and threat intel — all in one scan.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Search size={14} className="text-slate-400" />
              <span className="text-micro font-mono uppercase tracking-wider text-slate-400">Target Domain</span>
            </div>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 font-mono"
            />
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={runScan}
                disabled={scanning || !domain.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                {scanning ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
                {scanning ? 'Scanning…' : 'Scan'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDomain('');
                  setSections([]);
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-sm font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          {sections.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-micro font-mono uppercase tracking-wider text-slate-400">Export</span>
              </div>
              <button
                type="button"
                className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                CSV
              </button>
            </div>
          )}
        </div>

        <div>
          {sections.length === 0 && !scanning && (
            <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/20 p-8 flex flex-col items-center justify-center text-center">
              <Globe size={48} className="text-slate-300 dark:text-slate-700 mb-4" />
              <p className="text-sm font-mono text-slate-500 dark:text-slate-400">
                Enter a domain above to map its infrastructure
              </p>
              <p className="text-micro font-mono text-slate-400 dark:text-slate-500 mt-2">
                VT · OTX · Shodan · Censys · crt.sh · BGPView · Robtex · ipinfo · URLScan · ThreatFox · RDAP
              </p>
            </div>
          )}

          {sections.length > 0 && (
            <div className="space-y-2">
              {sections.map((section) => (
                <div
                  key={section.id}
                  className={`rounded-xl border bg-white dark:bg-slate-900/40 shadow-e1 p-4 transition-all ${
                    section.status === 'loading'
                      ? 'border-brand-400/50 opacity-70'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      {section.label}
                    </h3>
                    {section.status === 'loading' && <Loader2 size={12} className="animate-spin text-brand-600" />}
                    {section.status === 'done' && <ShieldCheck size={12} className="text-green-500" />}
                  </div>
                  {section.status === 'done' && (
                    <ul className="space-y-0.5">
                      {section.data.map((line, i) => (
                        <li key={i} className="text-xs font-mono text-slate-600 dark:text-slate-400">
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}
                  {section.status === 'loading' && (
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-full max-w-[200px] rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="mt-8 text-micro font-mono text-slate-400 text-center">14 data dimensions · H3AD-X / DNSCOPE</p>
    </div>
  );
}
