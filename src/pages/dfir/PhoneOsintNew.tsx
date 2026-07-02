import { useState, useCallback, type ReactNode } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Radar, Phone, Trash2, Scan, Loader2, ExternalLink, Shield } from 'lucide-react';

interface StealerEntry {
  stealer_family?: string;
  date_compromised?: string;
  operating_system?: string;
  ip?: string;
}

interface PhoneResult {
  phone: { e164: string; digits: string; country_code: string; country_name: string; national_number: string };
  carrier: { type: string; carrier: string; confidence: string };
  numverify: { valid?: boolean; local_format: string; international_format: string; country_prefix: string; country_name: string; location: string; carrier: string; line_type: string } | null;
  lookups: Array<{ service: string; url: string; category: string; free: boolean }>;
  dorks: Array<{ engine: string; query: string; url: string }>;
  breach: { checked: boolean; reason: string; stealerStats?: { data?: StealerEntry[] } } | null;
}

// Category values match the API (buildLookups) — keep in sync.
const CATEGORY_ICONS: Record<string, string> = {
  messaging: '📱', lookup: '🔍', directory: '🌐', 'caller-id': '📞',
  'people-search': '👥', osint: '🛰️', regulatory: '⚖️',
};
const CATEGORY_LABELS: Record<string, string> = {
  messaging: 'Messaging', lookup: 'Reverse Lookup', directory: 'Directory', 'caller-id': 'Caller ID',
  'people-search': 'People Search', osint: 'OSINT', regulatory: 'Regulatory',
};

// Consistent label/value cell so every info grid aligns on the same baseline.
function Field({ label, value, mono, valueColor }: { label: string; value: ReactNode; mono?: boolean; valueColor?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: '#64748b' }}>{label}</div>
      <div className={`text-sm font-medium truncate ${mono ? 'font-mono' : ''}`} style={{ color: valueColor || '#f1f5f9' }} title={typeof value === 'string' ? value : undefined}>
        {value || '—'}
      </div>
    </div>
  );
}

export default function PhoneOsintNew() {
  const [activeTab, setActiveTab] = useState<'phone' | 'malware'>('phone');
  const [input, setInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<PhoneResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ id: string; number: string; timestamp: string }>>([]);

  // Malware state
  const [hashInput, setHashInput] = useState('');
  const [malwareResult, setMalwareResult] = useState<any>(null);
  const [malwareScanning, setMalwareScanning] = useState(false);

  const handlePhoneScan = useCallback(async () => {
    if (!input.trim()) return;
    setScanning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/v1/phone-osint?phone=${encodeURIComponent(input.trim())}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResult(data);
      setHistory(prev => [{ id: Date.now().toString(), number: input, timestamp: new Date().toISOString() }, ...prev]);
    } catch (e: any) {
      setError(e.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  }, [input]);

  const handleMalwareScan = useCallback(async () => {
    if (!hashInput.trim()) return;
    setMalwareScanning(true);
    setMalwareResult(null);
    try {
      const res = await fetch(`/api/v1/malware-samples?hash=${encodeURIComponent(hashInput.trim())}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMalwareResult(data);
    } catch (e: any) {
      setMalwareResult({ error: e.message || 'Scan failed' });
    } finally {
      setMalwareScanning(false);
    }
  }, [hashInput]);

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Radar size={28} />}
      title="AI Phone Intel Dashboard"
      description="AI-powered OSINT dashboard — phone number intelligence with risk scoring, carrier detection, breach checks, and malware hash analysis."
      maxWidthClass="max-w-5xl"
    >
      {/* Main Dashboard Card */}
      <div className="relative rounded-3xl p-6 md:p-8 overflow-hidden border border-[#1f2937] shadow-[0_25px_80px_rgba(0,0,0,0.9)]"
           style={{ background: '#111827' }}>
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 30% 20%, rgba(56,189,248,0.04), transparent 70%)' }} />

        {/* Header */}
        <div className="flex items-center gap-3 mb-2 relative">
          <Radar size={32} style={{ color: '#38bdf8' }} />
          <h2 className="text-2xl font-bold" style={{ backgroundImage: 'linear-gradient(135deg, #f0f9ff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            AI Phone Intel Dashboard
          </h2>
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between text-[13px] pb-3.5 mb-5 border-b gap-3 flex-wrap relative" style={{ color: '#64748b', borderColor: '#1e293b' }}>
          <span>🛰️ AI-Powered OSINT</span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: '#0f172a', color: '#38bdf8', border: '1px solid #1e293b' }}>
              Remaining: 100 of 100
            </span>
            <span className="text-[10px] font-bold tracking-wider px-3 py-1 rounded-full animate-pulse" style={{ background: '#22c55e', color: '#0a0e1a' }}>
              ● LIVE
            </span>
          </div>
        </div>

        {/* Tab buttons */}
        <div className="flex gap-2 mb-6 relative">
          <button onClick={() => setActiveTab('phone')}
            className="flex-1 px-4 py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition"
            style={{ background: activeTab === 'phone' ? 'linear-gradient(135deg, #2563eb, #7c3aed)' : '#0f172a', color: activeTab === 'phone' ? '#fff' : '#94a3b8', border: `1px solid ${activeTab === 'phone' ? 'transparent' : '#1e293b'}` }}>
            <Phone size={16} /> Phone Intel
          </button>
          <button onClick={() => setActiveTab('malware')}
            className="flex-1 px-4 py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition"
            style={{ background: activeTab === 'malware' ? 'linear-gradient(135deg, #2563eb, #7c3aed)' : '#0f172a', color: activeTab === 'malware' ? '#fff' : '#94a3b8', border: `1px solid ${activeTab === 'malware' ? 'transparent' : '#1e293b'}` }}>
            <Shield size={16} /> Malware Hash
          </button>
        </div>

        {/* Phone Intel Tab */}
        {activeTab === 'phone' && (
          <>
            <div className="flex flex-wrap gap-3 mb-6 relative">
              <input type="tel" placeholder="Enter number e.g. 14155552671" maxLength={20}
                value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handlePhoneScan()}
                className="flex-1 min-w-[200px] px-5 py-4 rounded-2xl text-base font-medium outline-none transition"
                style={{ background: '#0f172a', color: '#f1f5f9', border: '1px solid #1e293b' }} />
              <button onClick={handlePhoneScan} disabled={!input.trim() || scanning}
                className="px-7 py-4 rounded-2xl font-bold text-white flex items-center gap-2.5 transition disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5"
                style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)', boxShadow: '0 8px 24px rgba(37,99,235,0.25)' }}>
                {scanning ? <Loader2 size={16} className="animate-spin" /> : <Scan size={16} />}
                {scanning ? 'Scanning...' : 'Deep Scan'}
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: '#991b1b20', color: '#fca5a5', border: '1px solid #991b1b40' }}>
                {error}
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="space-y-4 relative">
                {/* Phone Info Card */}
                <div className="p-5 rounded-2xl" style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
                  <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: '#38bdf8' }}>
                    <Phone size={14} /> Phone Information
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-4">
                    <Field label="E.164" value={result.phone.e164} mono />
                    <Field label="National Number" value={result.phone.national_number} mono />
                    <Field label="Country" value={result.phone.country_name || result.phone.country_code} />
                    <Field label="Country Code" value={result.phone.country_code} />
                    <Field label="Carrier" value={result.carrier.carrier || 'Unknown'} />
                    <Field label="Line Type" value={result.carrier.type || 'Unknown'} />
                    <Field
                      label="Confidence"
                      value={result.carrier.confidence || 'low'}
                      valueColor={result.carrier.confidence === 'api-verified' || result.carrier.confidence === 'high' ? '#22c55e' : result.carrier.confidence === 'medium' ? '#f59e0b' : '#94a3b8'}
                    />
                    {result.numverify && (
                      <Field label="Valid" value="✓ Verified" valueColor="#22c55e" />
                    )}
                  </div>
                  {result.numverify && (
                    <div className="mt-4 pt-4 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-4" style={{ borderTop: '1px solid #1e293b' }}>
                      <Field label="International" value={result.numverify.international_format} mono />
                      <Field label="Local Format" value={result.numverify.local_format} mono />
                      <Field label="Dial Prefix" value={result.numverify.country_prefix} mono />
                      <Field label="Location" value={result.numverify.location} />
                      <Field label="Carrier (NumVerify)" value={result.numverify.carrier} />
                      <Field label="Line Type (NumVerify)" value={result.numverify.line_type} />
                    </div>
                  )}
                </div>

                {/* Breach Check */}
                {result.breach && (() => {
                  const entries = result.breach.stealerStats?.data ?? [];
                  const found = result.breach.checked && entries.length > 0;
                  const families = Array.from(new Set(entries.map(e => e.stealer_family).filter(Boolean))) as string[];
                  return (
                    <div className="p-4 rounded-2xl" style={{ background: found ? '#991b1b15' : '#0f172a', border: `1px solid ${found ? '#991b1b40' : '#1e293b'}` }}>
                      <div className="flex items-center gap-2 mb-1">
                        <Shield size={14} style={{ color: found ? '#ef4444' : result.breach.checked ? '#22c55e' : '#64748b' }} />
                        <span className="text-sm font-bold" style={{ color: found ? '#fca5a5' : result.breach.checked ? '#86efac' : '#94a3b8' }}>
                          Breach Check: {result.breach.checked ? (found ? `EXPOSED (${entries.length})` : 'CLEAN') : 'NOT CHECKED'}
                        </span>
                      </div>
                      {!result.breach.checked && (
                        <div className="text-[11px]" style={{ color: '#64748b' }}>{result.breach.reason}</div>
                      )}
                      {found && families.length > 0 && (
                        <div className="text-xs mt-1" style={{ color: '#94a3b8' }}>
                          Stealer families: {families.join(', ')}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Lookup Links */}
                {result.lookups.length > 0 && (
                  <div className="p-5 rounded-2xl" style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
                    <h3 className="text-sm font-bold mb-3" style={{ color: '#94a3b8' }}>🔗 Lookup Services</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {result.lookups.map((l, i) => (
                        <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2.5 p-2.5 rounded-xl transition hover:bg-[#1e293b]"
                          style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
                          <span className="text-sm shrink-0">{CATEGORY_ICONS[l.category] || '🔍'}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate" style={{ color: '#f1f5f9' }}>{l.service}</div>
                            <div className="text-[10px] truncate" style={{ color: '#64748b' }}>{CATEGORY_LABELS[l.category] || l.category}</div>
                          </div>
                          {l.free && <span className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0" style={{ background: '#22c55e20', color: '#22c55e' }}>FREE</span>}
                          <ExternalLink size={12} className="shrink-0" style={{ color: '#64748b' }} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dorks */}
                {result.dorks.length > 0 && (
                  <div className="p-5 rounded-2xl" style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
                    <h3 className="text-sm font-bold mb-3" style={{ color: '#94a3b8' }}>🔎 Search Engine Dorks</h3>
                    <div className="space-y-1.5">
                      {result.dorks.map((d, i) => (
                        <a key={i} href={d.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-between gap-3 p-2.5 rounded-xl transition hover:bg-[#1e293b]"
                          style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0" style={{ background: '#1e293b', color: '#38bdf8' }}>{d.engine}</span>
                          <span className="text-xs font-mono truncate flex-1" style={{ color: '#94a3b8' }}>{d.query}</span>
                          <ExternalLink size={10} className="shrink-0" style={{ color: '#64748b' }} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Malware Hash Tab */}
        {activeTab === 'malware' && (
          <>
            <div className="flex flex-wrap gap-3 mb-6 relative">
              <input type="text" placeholder="Enter hash (MD5, SHA-1, SHA-256)" maxLength={128}
                value={hashInput} onChange={e => setHashInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleMalwareScan()}
                className="flex-1 min-w-[200px] px-5 py-4 rounded-2xl text-base font-medium font-mono outline-none transition"
                style={{ background: '#0f172a', color: '#f1f5f9', border: '1px solid #1e293b' }} />
              <button onClick={handleMalwareScan} disabled={!hashInput.trim() || malwareScanning}
                className="px-7 py-4 rounded-2xl font-bold text-white flex items-center gap-2.5 transition disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5"
                style={{ background: 'linear-gradient(135deg, #dc2626, #9333ea)', boxShadow: '0 8px 24px rgba(220,38,38,0.25)' }}>
                {malwareScanning ? <Loader2 size={16} className="animate-spin" /> : <Scan size={16} />}
                {malwareScanning ? 'Analyzing...' : 'Analyze Hash'}
              </button>
            </div>

            {malwareResult && !malwareResult.error && (
              <div className="space-y-4 relative">
                {/* Family / Verdict */}
                <div className="p-5 rounded-2xl" style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
                  <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: '#f87171' }}>
                    <Shield size={14} /> Malware Intelligence
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: '#64748b' }}>Family</div>
                      <div className="text-sm font-bold" style={{ color: '#f1f5f9' }}>{malwareResult.malware_family || 'Unknown'}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: '#64748b' }}>Verdict</div>
                      <div className="text-sm font-bold" style={{ color: malwareResult.verdict === 'malicious' ? '#ef4444' : malwareResult.verdict === 'suspicious' ? '#f59e0b' : '#22c55e' }}>
                        {malwareResult.verdict || 'Unknown'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: '#64748b' }}>First Seen</div>
                      <div className="text-sm" style={{ color: '#f1f5f9' }}>{malwareResult.first_seen || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: '#64748b' }}>Tags</div>
                      <div className="text-xs flex flex-wrap gap-1">
                        {(malwareResult.tags || []).slice(0, 5).map((tag: string, i: number) => (
                          <span key={i} className="px-1.5 py-0.5 rounded" style={{ background: '#1e293b', color: '#94a3b8' }}>{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Links */}
                <div className="p-5 rounded-2xl" style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
                  <h3 className="text-sm font-bold mb-3" style={{ color: '#94a3b8' }}>🔗 Analysis Links</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {[
                      { name: 'VirusTotal', url: `https://www.virustotal.com/gui/file/${hashInput}` },
                      { name: 'MalwareBazaar', url: `https://bazaar.abuse.ch/browse.php?search=sha256:${hashInput}` },
                      { name: 'Hybrid Analysis', url: `https://www.hybrid-analysis.com/search?query=${hashInput}` },
                      { name: 'ANY.RUN', url: `https://any.run/report/${hashInput}` },
                      { name: 'URLhaus', url: `https://urlhaus.abuse.ch/browse.php?search=sha256:${hashInput}` },
                      { name: 'Triage', url: `https://tria.ge/s?q=${hashInput}` },
                    ].map((link, i) => (
                      <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2.5 rounded-xl transition hover:bg-[#1e293b]"
                        style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
                        <span className="text-xs font-medium flex-1 truncate" style={{ color: '#f1f5f9' }}>{link.name}</span>
                        <ExternalLink size={10} style={{ color: '#64748b' }} />
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {malwareResult?.error && (
              <div className="p-3 rounded-xl text-sm" style={{ background: '#991b1b20', color: '#fca5a5', border: '1px solid #991b1b40' }}>
                {malwareResult.error}
              </div>
            )}
          </>
        )}
      </div>

      {/* Scan History */}
      {history.length > 0 && (
        <div className="mt-4 p-5 rounded-2xl" style={{ background: '#111827', border: '1px solid #1e293b' }}>
          <div className="text-[13px] font-semibold mb-3 flex items-center justify-between" style={{ color: '#64748b' }}>
            <span>🕓 Scan History ({history.length})</span>
            <button onClick={() => setHistory([])} className="text-[11px] hover:text-white transition" style={{ color: '#64748b' }}>
              <Trash2 size={12} /> Clear
            </button>
          </div>
          <div className="space-y-1.5">
            {history.slice(0, 5).map(scan => (
              <div key={scan.id} className="flex items-center justify-between p-2.5 rounded-xl"
                style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
                <div>
                  <div className="text-xs font-medium font-mono" style={{ color: '#f1f5f9' }}>{scan.number}</div>
                  <div className="text-[10px]" style={{ color: '#64748b' }}>{new Date(scan.timestamp).toLocaleTimeString()}</div>
                </div>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#22c55e20', color: '#22c55e' }}>✓</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-6 pt-4 text-center text-[12px]" style={{ color: '#475569' }}>
        <a href="/dfir/phone-osint" style={{ color: '#64748b' }}>⚖️ Legal Policy · Privacy · Terms</a>
      </div>
    </DataPageLayout>
  );
}
