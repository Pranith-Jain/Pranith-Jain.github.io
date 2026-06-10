import { useState, useCallback } from 'react';
import { BackLink } from '../../components/BackLink';
import {
  ArrowLeft,
  FileText,
  Search,
  Loader2,
  ExternalLink,
  AlertTriangle,
  Shield,
  Hash,
  Globe,
  MapPin,
} from 'lucide-react';
import { CopyButton } from '../../components/dfir/CopyButton';
import { adminAuthHeaders } from '../../lib/admin-token';

interface ExtractedReport {
  extraction_id: string;
  input: { type: string; length: number; source_url?: string };
  iocs: {
    ipv4: string[];
    domains: string[];
    urls: string[];
    hashes: { md5: string[]; sha1: string[]; sha256: string[] };
  };
  threat_actors: Array<{ name: string; confidence: string; context?: string }>;
  malware: Array<{ name: string; confidence: string; context?: string }>;
  mitre_techniques: Array<{ id: string; name?: string }>;
  cves: Array<{ id: string }>;
  sectors: string[];
  affected_products: Array<{ vendor?: string; product: string }>;
  summary: string;
  meta: { extracted_at: string; method: string; ai_model?: string; confidence: string };
}

const CONFIDENCE_BADGE: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  low: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
};

export default function ReportParser(): JSX.Element {
  const [mode, setMode] = useState<'text' | 'url'>('text');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractedReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExtract = useCallback(async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body = mode === 'url' ? { url: input } : { text: input };
      const res = await fetch('/api/v1/report/parse', {
        method: 'POST',
        headers: { ...adminAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        let msg = `HTTP ${res.status}`;
        try {
          const p = JSON.parse(errBody) as { error?: string };
          msg = p.error ?? msg;
        } catch {
          /* ok */
        }
        throw new Error(msg);
      }
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) throw new Error('Server returned non-JSON response');
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [input, mode]);

  const totalIocs =
    (result?.iocs.ipv4.length ?? 0) +
    (result?.iocs.domains.length ?? 0) +
    (result?.iocs.urls.length ?? 0) +
    (result?.iocs.hashes.md5.length ?? 0) +
    (result?.iocs.hashes.sha1.length ?? 0) +
    (result?.iocs.hashes.sha256.length ?? 0);

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
          <FileText size={28} className="text-brand-600 dark:text-brand-400" /> Threat Report Parser
        </h1>
        <p className="text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
          Extract IOCs, threat actors, TTPs, and CVEs from threat intelligence reports and blog posts.
        </p>
      </div>

      {/* Input */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-5 mb-6">
        <div className="flex gap-1.5 mb-4">
          <button
            onClick={() => setMode('text')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${mode === 'text' ? 'border-brand-500/60 bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-brand-500/30'}`}
          >
            Paste Text
          </button>
          <button
            onClick={() => setMode('url')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${mode === 'url' ? 'border-brand-500/60 bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-brand-500/30'}`}
          >
            From URL
          </button>
        </div>
        {mode === 'text' ? (
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste threat report, blog post, or incident write-up…"
            className="w-full h-48 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-4 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400 resize-y font-mono"
          />
        ) : (
          <input
            type="url"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://example.com/threat-report.pdf"
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-4 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
        )}
        <button
          onClick={handleExtract}
          disabled={loading || !input.trim()}
          className="mt-3 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-sm font-semibold text-white transition-colors flex items-center gap-2"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {loading ? 'Extracting…' : 'Extract Intelligence'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300/70 dark:border-rose-800/60 bg-rose-50/60 dark:bg-rose-950/30 p-4 mb-6 flex items-center gap-3">
          <AlertTriangle size={16} className="text-rose-600 dark:text-rose-400 flex-shrink-0" />
          <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-5 animate-fade-in-up">
          {/* Summary */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-5">
            <h2 className="font-display font-bold text-sm mb-2 flex items-center gap-2">
              <Shield size={14} className="text-brand-600 dark:text-brand-400" /> Executive Summary
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{result.summary}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="text-micro font-mono px-2 py-0.5 rounded bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300">
                {totalIocs} IOCs
              </span>
              <span className="text-micro font-mono px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                {result.threat_actors.length} Actors
              </span>
              <span className="text-micro font-mono px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300">
                {result.malware.length} Malware
              </span>
              <span className="text-micro font-mono px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                {result.mitre_techniques.length} TTPs
              </span>
              <span className="text-micro font-mono px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                {result.cves.length} CVEs
              </span>
              <span className={`text-micro font-mono px-2 py-0.5 rounded ${CONFIDENCE_BADGE[result.meta.confidence]}`}>
                {result.meta.confidence}
              </span>
            </div>
          </div>

          {/* IOCs Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.iocs.ipv4.length > 0 && (
              <IocSection title="IP Addresses" icon={<Globe size={14} />} items={result.iocs.ipv4} />
            )}
            {result.iocs.domains.length > 0 && (
              <IocSection title="Domains" icon={<MapPin size={14} />} items={result.iocs.domains} />
            )}
            {result.iocs.urls.length > 0 && (
              <IocSection title="URLs" icon={<ExternalLink size={14} />} items={result.iocs.urls} />
            )}
            {result.iocs.hashes.sha256.length + result.iocs.hashes.sha1.length + result.iocs.hashes.md5.length > 0 && (
              <IocSection
                title="File Hashes"
                icon={<Hash size={14} />}
                items={[...result.iocs.hashes.sha256, ...result.iocs.hashes.sha1, ...result.iocs.hashes.md5]}
              />
            )}
          </div>

          {/* Actors & Malware */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.threat_actors.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-5">
                <h3 className="font-display font-bold text-sm mb-3">Threat Actors</h3>
                <div className="space-y-1.5">
                  {result.threat_actors.map((actor) => (
                    <div
                      key={actor.name}
                      className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2"
                    >
                      <span className="text-sm">{actor.name}</span>
                      <span
                        className={`text-micro font-mono px-1.5 py-0.5 rounded ${CONFIDENCE_BADGE[actor.confidence]}`}
                      >
                        {actor.confidence}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {result.malware.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-5">
                <h3 className="font-display font-bold text-sm mb-3">Malware Families</h3>
                <div className="space-y-1.5">
                  {result.malware.map((m) => (
                    <div
                      key={m.name}
                      className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2"
                    >
                      <span className="text-sm">{m.name}</span>
                      <span className={`text-micro font-mono px-1.5 py-0.5 rounded ${CONFIDENCE_BADGE[m.confidence]}`}>
                        {m.confidence}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* MITRE & CVEs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.mitre_techniques.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-5">
                <h3 className="font-display font-bold text-sm mb-3">MITRE ATT&CK</h3>
                <div className="flex flex-wrap gap-1.5">
                  {result.mitre_techniques.map((t) => (
                    <a
                      key={t.id}
                      href={`https://attack.mitre.org/techniques/${t.id.replace('.', '/')}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-micro font-mono px-2 py-0.5 rounded border border-amber-300/50 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 hover:border-amber-500/60 transition-colors"
                    >
                      {t.id}
                      {t.name ? `: ${t.name}` : ''}
                    </a>
                  ))}
                </div>
              </div>
            )}
            {result.cves.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-5">
                <h3 className="font-display font-bold text-sm mb-3">CVEs</h3>
                <div className="flex flex-wrap gap-1.5">
                  {result.cves.map((c) => (
                    <a
                      key={c.id}
                      href={`https://nvd.nist.gov/vuln/detail/${c.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-micro font-mono px-2 py-0.5 rounded border border-amber-300/50 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 hover:border-amber-500/60 transition-colors"
                    >
                      {c.id}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function IocSection({ title, icon, items }: { title: string; icon: React.ReactNode; items: string[] }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-bold text-sm flex items-center gap-2">
          <span className="text-brand-600 dark:text-brand-400">{icon}</span> {title}{' '}
          <span className="text-xs font-mono text-slate-400">({items.length})</span>
        </h3>
        <CopyButton value={items.join('\n')} />
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1">
        {items.map((item) => (
          <div
            key={item}
            className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-1"
          >
            <code className="text-xs text-slate-700 dark:text-slate-300 flex-1 truncate font-mono">{item}</code>
            <CopyButton value={item} />
          </div>
        ))}
      </div>
    </div>
  );
}
