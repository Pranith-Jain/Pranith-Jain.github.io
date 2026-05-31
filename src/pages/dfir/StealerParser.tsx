import { useState, useCallback } from 'react';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Search, Loader2, Bug, FileText, Shield, Globe, Wallet, Monitor, AlertTriangle } from 'lucide-react';
import { CopyButton } from '../../components/dfir/CopyButton';

interface StealerResult {
  parse_id: string;
  detected_stealer: string | null;
  credentials: Array<{ domain: string; username: string; password_length: number; source: string }>;
  emails: string[];
  domains: string[];
  ips: string[];
  crypto_wallets: Array<{ currency: string; address: string }>;
  system_info: { hostname?: string; username?: string; os?: string; hwid?: string; ip?: string; country?: string };
  installed_software: string[];
  stats: { total_credentials: number; unique_domains: number; unique_emails: number; crypto_wallets: number };
  meta: { parsed_at: string; warnings: string[] };
}

const SUPPORTED_STEALERS = ['RedLine', 'Raccoon', 'Vidar', 'Lumma', 'StealC', 'Mystic', 'AzorUlt'];

export default function StealerParser(): JSX.Element {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StealerResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleParse = useCallback(async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/v1/stealer/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input }),
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
  }, [input]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-10">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Bug size={28} className="text-brand-600 dark:text-brand-400" /> Infostealer Log Parser
        </h1>
        <p className="text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
          Extract credentials, IOCs, crypto wallets, and system info from stealer log dumps. Auto-detects format and
          parses client-side where possible.
        </p>
      </div>

      {/* Supported stealers */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {SUPPORTED_STEALERS.map((s) => (
          <span
            key={s}
            className="px-2.5 py-1 rounded-lg text-xs font-mono border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
          >
            {s}
          </span>
        ))}
      </div>

      {/* Input */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5 mb-6">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste stealer log content here…"
          className="w-full h-48 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-4 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400 resize-y font-mono"
        />
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-slate-400 font-mono">
            {input.length > 0 ? `${(input.length / 1024).toFixed(1)} KB` : 'Max 500 KB'}
          </span>
          <button
            onClick={handleParse}
            disabled={loading || !input.trim()}
            className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-sm font-semibold text-white transition-colors flex items-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {loading ? 'Parsing…' : 'Parse Log'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300/70 dark:border-rose-800/60 bg-rose-50/60 dark:bg-rose-950/30 p-4 mb-6 flex items-center gap-3">
          <AlertTriangle size={16} className="text-rose-600 dark:text-rose-400 flex-shrink-0" />
          <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-5 animate-fade-in-up">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Credentials"
              value={result.stats.total_credentials}
              icon={<Shield size={16} />}
              color="text-rose-600 dark:text-rose-400"
            />
            <StatCard
              label="Domains"
              value={result.stats.unique_domains}
              icon={<Globe size={16} />}
              color="text-brand-600 dark:text-brand-400"
            />
            <StatCard
              label="Emails"
              value={result.stats.unique_emails}
              icon={<FileText size={16} />}
              color="text-emerald-600 dark:text-emerald-400"
            />
            <StatCard
              label="Crypto Wallets"
              value={result.stats.crypto_wallets}
              icon={<Wallet size={16} />}
              color="text-amber-600 dark:text-amber-400"
            />
          </div>

          {/* Detected Stealer */}
          {result.detected_stealer && (
            <div className="rounded-lg border border-amber-300/50 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-center gap-3">
              <Bug size={16} className="text-amber-600 dark:text-amber-400" />
              <span className="text-sm text-amber-800 dark:text-amber-200">
                Detected stealer: <strong className="font-mono">{result.detected_stealer}</strong>
              </span>
            </div>
          )}

          {/* System Info */}
          {Object.keys(result.system_info).length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5">
              <h3 className="font-display font-bold text-sm mb-3 flex items-center gap-2">
                <Monitor size={14} className="text-brand-600 dark:text-brand-400" /> System Information
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {result.system_info.hostname && <InfoField label="Hostname" value={result.system_info.hostname} />}
                {result.system_info.username && <InfoField label="Username" value={result.system_info.username} />}
                {result.system_info.os && <InfoField label="OS" value={result.system_info.os} />}
                {result.system_info.ip && <InfoField label="IP" value={result.system_info.ip} />}
                {result.system_info.hwid && <InfoField label="HWID" value={result.system_info.hwid} />}
                {result.system_info.country && <InfoField label="Country" value={result.system_info.country} />}
              </div>
            </div>
          )}

          {/* Credentials */}
          {result.credentials.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-bold text-sm text-rose-600 dark:text-rose-400">
                  Stolen Credentials ({result.credentials.length})
                </h3>
                <CopyButton value={result.credentials.map((c) => `${c.domain}:${c.username}`).join('\n')} />
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] font-mono uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <th scope="col" className="pb-2">
                        Domain
                      </th>
                      <th scope="col" className="pb-2">
                        Username
                      </th>
                      <th scope="col" className="pb-2">
                        Pass Len
                      </th>
                      <th scope="col" className="pb-2">
                        Source
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.credentials.slice(0, 50).map((cred) => (
                      <tr
                        key={`${cred.domain}-${cred.username}-${cred.source}`}
                        className="border-b border-slate-100 dark:border-slate-800/50"
                      >
                        <td className="py-1.5 font-mono text-xs">{cred.domain}</td>
                        <td className="py-1.5 font-mono text-xs">{cred.username}</td>
                        <td className="py-1.5 text-xs text-slate-500">{cred.password_length}</td>
                        <td className="py-1.5 text-xs text-slate-400">{cred.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Crypto Wallets */}
          {result.crypto_wallets.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5">
              <h3 className="font-display font-bold text-sm mb-3">Crypto Wallets ({result.crypto_wallets.length})</h3>
              <div className="space-y-1.5">
                {result.crypto_wallets.map((w) => (
                  <div
                    key={w.address}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2"
                  >
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                      {w.currency}
                    </span>
                    <code className="text-xs text-slate-700 dark:text-slate-300 flex-1 truncate">{w.address}</code>
                    <CopyButton value={w.address} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Emails */}
          {result.emails.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5">
              <h3 className="font-display font-bold text-sm mb-3">Emails ({result.emails.length})</h3>
              <div className="max-h-32 overflow-y-auto flex flex-wrap gap-1">
                {result.emails.map((e) => (
                  <span
                    key={e}
                    className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-600 dark:text-slate-400"
                  >
                    {e}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Installed Software */}
          {result.installed_software.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5">
              <h3 className="font-display font-bold text-sm mb-3">Installed Software</h3>
              <div className="flex flex-wrap gap-1.5">
                {result.installed_software.map((s) => (
                  <span
                    key={s}
                    className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4">
      <div className="flex items-center gap-2 mb-1.5">
        {icon && <span className={color ?? 'text-slate-400'}>{icon}</span>}
        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{label}</span>
      </div>
      <div className={`text-2xl font-display font-bold ${color ?? 'text-slate-900 dark:text-white'}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-sm font-mono text-slate-700 dark:text-slate-300">{value}</div>
    </div>
  );
}
