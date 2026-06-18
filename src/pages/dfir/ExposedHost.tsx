/* eslint-disable jsx-a11y/no-static-element-interactions */
import { useState, useCallback, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Globe,
  Server,
  Shield,
  AlertTriangle,
  Clock,
  HardDrive,
  MapPin,
  Network,
  Wifi,
  File,
  Hash,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { CopyButton } from '../../components/dfir/CopyButton';
import { SEVERITY_TONE, type Severity } from '../../components/severity';

const API = '/api/v1';

function cvssSeverity(cvss: number): Severity {
  if (cvss >= 9) return 'critical';
  if (cvss >= 7) return 'high';
  return 'medium';
}

interface Protocol {
  port: number;
  protocol: string;
}

interface Vuln {
  id: string;
  cvss?: number;
}

interface ExposedHostResult {
  ip: string;
  country: string;
  countryCode: string;
  city: string;
  asn: string;
  asOrg: string;
  isp: string;
  ports: number[];
  protocols: Protocol[];
  hostnames: string[];
  cpes: string[];
  vulns: Vuln[];
  tags: string[];
  isVpn: boolean;
  isTor: boolean;
  isProxy: boolean;
  isHosting: boolean;
  privacyService?: string;
  hasOpenDirectory: boolean;
  artifactCount: number;
  artifactTotalSize: number;
  artifactTypes: Record<string, number>;
  firstSeen: string;
  lastSeen: string;
  scanTimeMs: number;
  sources: string[];
}

interface ArtifactEntry {
  name: string;
  type: 'file' | 'directory';
  size: number | null;
  extension: string | null;
  risk: 'critical' | 'high' | 'medium' | 'low' | 'info';
  riskReason?: string;
  hashes?: { md5?: string; sha256?: string; sha512?: string };
}

const TAG_COLORS: Record<string, string> = {
  tor: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  vpn: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  proxy: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300',
  hosting: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  scanner: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
  c2: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
  malware: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
  botnet: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
  spam: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  'brute-force': 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
  'critical-vuln': 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
  'risky-ports': 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function ExposedHostView(): JSX.Element {
  const [ip, setIp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ExposedHostResult | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>('ports');
  const [previewArtifact, setPreviewArtifact] = useState<ArtifactEntry | null>(null);

  const lookup = useCallback(async (targetIp: string) => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`${API}/exposed-host?ip=${encodeURIComponent(targetIp)}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ExposedHostResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (ip.trim()) void lookup(ip.trim());
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 mb-6"
      >
        ← back to DFIR tools
      </Link>

      <h1 className="text-3xl font-display font-bold mb-2">Exposed Host Intelligence</h1>
      <p className="text-muted mb-6">
        Per-IP asset intelligence view — open ports, services, CVEs, privacy flags, and artifact inventory. Inspired by
        etugen.io's exposed host feature.
      </p>

      <form onSubmit={onSubmit} className="flex gap-2 mb-8">
        <div className="relative flex-1">
          <Server size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="8.8.8.8"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] text-sm font-mono focus-visible:ring-2 focus-visible:ring-brand-500 focus:border-transparent"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !ip.trim()}
          className="px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2"
        >
          {loading ? <Clock size={14} className="animate-spin" /> : <Search size={14} />}
          {loading ? 'Scanning…' : 'Analyze'}
        </button>
      </form>

      {error && (
        <div className="mb-6 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/50 text-rose-700 dark:text-rose-300 text-sm font-mono">
          <AlertTriangle size={14} className="inline mr-2" />
          {error}
        </div>
      )}

      {result && (
        <>
          {/* Header Card */}
          <div className="mb-6 p-4 rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-xl font-mono font-bold">{result.ip}</h2>
                  <CopyButton value={result.ip} />
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <MapPin size={12} />
                  <span>
                    {result.city ? `${result.city}, ` : ''}
                    {result.country}
                  </span>
                  {result.asn && <span className="font-mono">· {result.asn}</span>}
                </div>
              </div>
              <div className="text-right text-xs font-mono text-slate-400">
                <div>{result.scanTimeMs}ms</div>
                <div>{result.sources.join(', ')}</div>
              </div>
            </div>

            {/* Privacy Flags */}
            <div className="flex flex-wrap gap-2 mb-3">
              {result.isTor && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                  <Shield size={10} /> Tor Exit Node
                </span>
              )}
              {result.isVpn && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                  <Wifi size={10} /> VPN {result.privacyService && `(${result.privacyService})`}
                </span>
              )}
              {result.isProxy && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300">
                  <Globe size={10} /> Proxy
                </span>
              )}
              {result.isHosting && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                  <Server size={10} /> Hosting
                </span>
              )}
            </div>

            {/* Tags */}
            {result.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {result.tags.map((tag) => (
                  <span
                    key={tag}
                    className={`px-2 py-0.5 rounded text-micro font-mono ${TAG_COLORS[tag] ?? 'bg-slate-100 dark:bg-slate-800 text-muted'}`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Open Ports', value: result.ports.length, icon: Network },
              { label: 'CVEs', value: result.vulns.length, icon: AlertTriangle },
              { label: 'Hostnames', value: result.hostnames.length, icon: Globe },
              { label: 'Artifacts', value: result.artifactCount, icon: File },
            ].map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="p-3 rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={12} className="text-slate-400" />
                  <span className="text-micro font-mono uppercase text-slate-500">{label}</span>
                </div>
                <span className="text-2xl font-mono font-bold">{value}</span>
              </div>
            ))}
          </div>

          {/* Network Info */}
          <div className="mb-4 p-3 rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
              <Network size={12} /> Network
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-slate-500">ASN:</span> <span className="font-mono">{result.asn}</span>
              </div>
              <div>
                <span className="text-slate-500">Organization:</span> <span className="font-mono">{result.asOrg}</span>
              </div>
              <div>
                <span className="text-slate-500">ISP:</span> <span className="font-mono">{result.isp}</span>
              </div>
              <div>
                <span className="text-slate-500">Country:</span> <span className="font-mono">{result.country}</span>
              </div>
            </div>
          </div>

          {/* Collapsible Sections */}
          <div className="space-y-3">
            {/* Open Ports */}
            <div className="border border-slate-200 dark:border-[#1e2030] rounded-lg bg-white dark:bg-[#12121a] overflow-hidden">
              <button
                onClick={() => toggleSection('ports')}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <span className="text-sm font-semibold flex items-center gap-2">
                  <Network size={14} className="text-brand-600" /> Open Ports ({result.ports.length})
                </span>
                {expandedSection === 'ports' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {expandedSection === 'ports' && (
                <div className="px-3 pb-3 border-t border-slate-100 dark:border-[#1e2030]">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-2">
                    {result.protocols.map((p) => (
                      <div
                        key={p.port}
                        className="flex items-center gap-2 p-2 rounded bg-slate-50 dark:bg-slate-800/50"
                      >
                        <span className="font-mono text-sm font-bold text-brand-600">{p.port}</span>
                        <span className="text-xs text-slate-500">{p.protocol}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* CVEs */}
            {result.vulns.length > 0 && (
              <div className="border border-slate-200 dark:border-[#1e2030] rounded-lg bg-white dark:bg-[#12121a] overflow-hidden">
                <button
                  onClick={() => toggleSection('vulns')}
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <span className="text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle size={14} className="text-rose-500" /> CVEs ({result.vulns.length})
                  </span>
                  {expandedSection === 'vulns' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {expandedSection === 'vulns' && (
                  <div className="px-3 pb-3 border-t border-slate-100 dark:border-[#1e2030]">
                    <div className="space-y-1 mt-2 max-h-60 overflow-y-auto">
                      {result.vulns.map((v) => (
                        <div
                          key={v.id}
                          className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-slate-800/50"
                        >
                          <Link
                            to={`/dfir/cve?cve=${v.id}`}
                            className="font-mono text-sm text-brand-600 hover:underline"
                          >
                            {v.id}
                          </Link>
                          {v.cvss !== undefined && (
                            <span
                              className={`text-xs font-mono px-1.5 py-0.5 rounded border ${SEVERITY_TONE[cvssSeverity(v.cvss)]}`}
                            >
                              CVSS {v.cvss}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Hostnames */}
            {result.hostnames.length > 0 && (
              <div className="border border-slate-200 dark:border-[#1e2030] rounded-lg bg-white dark:bg-[#12121a] overflow-hidden">
                <button
                  onClick={() => toggleSection('hostnames')}
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <span className="text-sm font-semibold flex items-center gap-2">
                    <Globe size={14} className="text-blue-500" /> Hostnames ({result.hostnames.length})
                  </span>
                  {expandedSection === 'hostnames' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {expandedSection === 'hostnames' && (
                  <div className="px-3 pb-3 border-t border-slate-100 dark:border-[#1e2030]">
                    <div className="space-y-1 mt-2">
                      {result.hostnames.map((h) => (
                        <div key={h} className="flex items-center gap-2 p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                          <Globe size={10} className="text-slate-400" />
                          <Link to={`/dfir/domain?d=${h}`} className="font-mono text-sm text-brand-600 hover:underline">
                            {h}
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* CPEs / Software */}
            {result.cpes.length > 0 && (
              <div className="border border-slate-200 dark:border-[#1e2030] rounded-lg bg-white dark:bg-[#12121a] overflow-hidden">
                <button
                  onClick={() => toggleSection('cpes')}
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <span className="text-sm font-semibold flex items-center gap-2">
                    <HardDrive size={14} className="text-emerald-500" /> Software ({result.cpes.length})
                  </span>
                  {expandedSection === 'cpes' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {expandedSection === 'cpes' && (
                  <div className="px-3 pb-3 border-t border-slate-100 dark:border-[#1e2030]">
                    <div className="space-y-1 mt-2 max-h-40 overflow-y-auto">
                      {result.cpes.map((cpe) => (
                        <div
                          key={cpe}
                          className="p-2 rounded bg-slate-50 dark:bg-slate-800/50 font-mono text-xs text-muted break-all"
                        >
                          {cpe}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Artifact Preview Modal */}
          {previewArtifact && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
              onClick={() => setPreviewArtifact(null)}
              onKeyDown={(e) => e.key === 'Escape' && setPreviewArtifact(null)}
            >
              <div
                className="max-w-2xl w-full max-h-[80vh] rounded-lg bg-white dark:bg-[#12121a] border border-slate-200 dark:border-[#1e2030] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-[#1e2030]">
                  <div className="flex items-center gap-2">
                    <File size={14} className="text-brand-600" />
                    <span className="font-mono text-sm font-medium">{previewArtifact.name}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded border text-micro font-mono ${SEVERITY_TONE[previewArtifact.risk]}`}
                    >
                      {previewArtifact.risk}
                    </span>
                  </div>
                  <button onClick={() => setPreviewArtifact(null)} className="text-slate-400 hover:text-slate-600">
                    ✕
                  </button>
                </div>
                <div className="p-4 space-y-3 overflow-y-auto max-h-[60vh]">
                  {previewArtifact.size !== null && (
                    <div className="text-sm">
                      <span className="text-slate-500">Size:</span>{' '}
                      <span className="font-mono">{formatSize(previewArtifact.size)}</span>
                    </div>
                  )}
                  {previewArtifact.riskReason && (
                    <div className="text-sm">
                      <span className="text-slate-500">Risk:</span>{' '}
                      <span className="font-mono">{previewArtifact.riskReason}</span>
                    </div>
                  )}
                  {previewArtifact.hashes && (
                    <div className="space-y-1">
                      <div className="text-xs font-mono uppercase text-slate-500 flex items-center gap-1.5">
                        <Hash size={10} /> Hashes
                      </div>
                      {previewArtifact.hashes.md5 && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 w-12">MD5</span>
                          <code className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                            {previewArtifact.hashes.md5}
                          </code>
                          <CopyButton value={previewArtifact.hashes.md5} />
                        </div>
                      )}
                      {previewArtifact.hashes.sha256 && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 w-12">SHA256</span>
                          <code className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded break-all">
                            {previewArtifact.hashes.sha256}
                          </code>
                          <CopyButton value={previewArtifact.hashes.sha256} />
                        </div>
                      )}
                      {previewArtifact.hashes.sha512 && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 w-12">SHA512</span>
                          <code className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded break-all">
                            {previewArtifact.hashes.sha512}
                          </code>
                          <CopyButton value={previewArtifact.hashes.sha512} />
                        </div>
                      )}
                    </div>
                  )}
                  <div className="text-xs text-slate-400">
                    Artifact preview is for demonstration — full content analysis requires the Open Directory Scanner.
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {!result && !loading && !error && (
        <div className="text-center py-16">
          <Server size={48} className="mx-auto mb-4 text-slate-300 dark:text-slate-600" />
          <p className="text-slate-500">Enter an IP address to see exposed host intelligence</p>
          <p className="text-xs text-slate-400 mt-1">
            Shows open ports, CVEs, hostnames, privacy flags, and artifact inventory
          </p>
        </div>
      )}
    </div>
  );
}
