import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Radar } from 'lucide-react';
import type { ExposureScanResponse } from '../../lib/dfir/types';
import { SubdomainTree } from '../../components/dfir/SubdomainTree';
import { recordHistory } from '../../lib/dfir/history';

const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

export default function Exposure(): JSX.Element {
  const [searchParams] = useSearchParams();
  const initialInput = searchParams.get('domain') ?? '';
  const [input, setInput] = useState(initialInput);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExposureScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valid = DOMAIN_RE.test(input.trim());

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const r = await fetch(`/api/v1/exposure/scan?domain=${encodeURIComponent(input.trim())}`);
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `${r.status}`);
      }
      const r2 = (await r.json()) as ExposureScanResponse;
      setResult(r2);
      recordHistory({ tool: 'exposure', indicator: r2.domain, verdict: r2.verdict, score: r2.score });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'scan failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa]">
      <div className="max-w-5xl mx-auto px-8 py-12">
        <Link
          to="/dfir"
          className="inline-flex items-center gap-2 text-sm text-[#a1a1aa] hover:text-[#00fff9] mb-8 font-mono"
        >
          <ArrowLeft size={14} /> /dfir
        </Link>
        <h1 className="text-4xl font-display font-bold mb-2">Exposure Scanner</h1>
        <p className="text-[#a1a1aa] mb-8 max-w-2xl">
          Subdomains seen in Certificate Transparency logs, resolved to IPs, with optional Shodan host info (when
          SHODAN_API_KEY is set).
        </p>

        <form onSubmit={onSubmit} className="mb-10">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="example.com"
              className="flex-1 px-4 py-3 bg-[#111113] border border-[#1f1f23] rounded-lg font-mono text-[#fafafa] placeholder:text-[#71717a] focus:outline-none focus:border-[#00fff9]/50"
            />
            <button
              type="submit"
              disabled={!valid || loading}
              className="px-5 py-3 bg-[#00fff9] text-[#0a0a0a] font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-[#22d3ee]"
            >
              <Radar size={16} className="inline mr-2" /> Scan
            </button>
          </div>
        </form>

        {loading && <p className="font-mono text-[#a1a1aa]">Scanning…</p>}
        {error && <p className="font-mono text-[#ef4444]">error: {error}</p>}

        {result && (
          <div className="space-y-6">
            <section className="rounded-2xl border border-[#1f1f23] bg-[#111113] p-6">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display font-bold text-2xl">{result.domain}</h2>
                <span className="font-mono text-sm">
                  exposure: <span className="text-[#fafafa]">{result.score}/100</span>{' '}
                  <span
                    className={
                      result.verdict === 'low'
                        ? 'text-[#10b981]'
                        : result.verdict === 'medium'
                          ? 'text-[#f59e0b]'
                          : 'text-[#ef4444]'
                    }
                  >
                    ({result.verdict})
                  </span>
                </span>
              </div>
              <p className="mt-2 font-mono text-sm text-[#a1a1aa]">
                {result.subdomains.length} of {result.total_subdomains_seen} subdomains shown · Shodan:{' '}
                {result.shodan_enabled ? 'enabled' : 'disabled (no SHODAN_API_KEY)'}
              </p>
            </section>
            <section className="rounded-2xl border border-[#1f1f23] bg-[#111113] p-6">
              <h3 className="font-display font-bold text-lg mb-3">Subdomains seen in CT logs</h3>
              <SubdomainTree subdomains={result.subdomains} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
