import { useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Radar, Phone, Link2, Trash2, Scan } from 'lucide-react';

interface ScanResult {
  id: string;
  number: string;
  timestamp: string;
  type: string;
}

export default function PhoneOsintNew() {
  const [activeTab, setActiveTab] = useState<'phone' | 'url'>('phone');
  const [input, setInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [history, setHistory] = useState<ScanResult[]>([]);

  const handleScan = () => {
    if (!input.trim()) return;
    setScanning(true);
    const result: ScanResult = {
      id: Date.now().toString(),
      number: input,
      timestamp: new Date().toISOString(),
      type: activeTab,
    };
    setTimeout(() => {
      setHistory((prev) => [result, ...prev]);
      setScanning(false);
      setInput('');
    }, 2000);
  };

  const clearHistory = () => setHistory([]);

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Radar size={28} />}
      title="AI Phone Intel"
      description="AI-powered OSINT dashboard for phone number intelligence."
      maxWidthClass="max-w-3xl"
    >
      <div className="relative rounded-[32px] p-8 md:p-10 overflow-hidden border border-[#1f2937] shadow-[0_25px_80px_rgba(0,0,0,0.9)]"
           style={{ background: '#111827' }}>
        {/* Radial glow */}
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
          <button
            onClick={() => setActiveTab('phone')}
            className="flex-1 px-4 py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition"
            style={{
              background: activeTab === 'phone' ? 'linear-gradient(135deg, #2563eb, #7c3aed)' : '#0f172a',
              color: activeTab === 'phone' ? '#fff' : '#94a3b8',
              border: `1px solid ${activeTab === 'phone' ? 'transparent' : '#1e293b'}`,
            }}
          >
            <Phone size={16} /> Phone Intel
          </button>
          <button
            onClick={() => setActiveTab('url')}
            className="flex-1 px-4 py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition"
            style={{
              background: activeTab === 'url' ? 'linear-gradient(135deg, #2563eb, #7c3aed)' : '#0f172a',
              color: activeTab === 'url' ? '#fff' : '#94a3b8',
              border: `1px solid ${activeTab === 'url' ? 'transparent' : '#1e293b'}`,
            }}
          >
            <Link2 size={16} /> URL Scanner
          </button>
        </div>

        {/* Input + buttons */}
        <div className="flex flex-wrap gap-3 mb-6 relative">
          <input
            type="text"
            placeholder={activeTab === 'phone' ? 'Enter number e.g. 14155552671' : 'Enter URL to scan'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleScan()}
            className="flex-1 min-w-[200px] px-5 py-4 rounded-2xl text-base font-medium outline-none transition"
            style={{ background: '#0f172a', color: '#f1f5f9', border: '1px solid #1e293b' }}
          />
          <button
            onClick={handleScan}
            disabled={!input.trim() || scanning}
            className="px-7 py-4 rounded-2xl font-bold text-white flex items-center gap-2.5 transition disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5"
            style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)', boxShadow: '0 8px 24px rgba(37,99,235,0.25)' }}
          >
            <Scan size={16} /> {scanning ? 'Scanning...' : 'Deep Scan'}
          </button>
          <button
            onClick={clearHistory}
            className="px-5 py-4 rounded-2xl font-semibold text-sm flex items-center gap-2 transition"
            style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }}
          >
            <Trash2 size={16} /> Clear
          </button>
        </div>

        {/* Scan History */}
        <div className="mt-6 pt-5 border-t relative" style={{ borderColor: '#1e293b' }}>
          <div className="text-[13px] font-semibold mb-2.5 flex items-center gap-2" style={{ color: '#64748b' }}>
            🕓 Scan History ({history.length})
          </div>
          {history.length === 0 ? (
            <div className="text-sm" style={{ color: '#475569' }}>No scans yet.</div>
          ) : (
            <div className="space-y-2">
              {history.map((scan) => (
                <div key={scan.id} className="flex items-center justify-between p-3 rounded-xl" style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
                  <div>
                    <div className="text-sm font-medium" style={{ color: '#f1f5f9' }}>{scan.number}</div>
                    <div className="text-[11px]" style={{ color: '#64748b' }}>
                      {scan.type === 'phone' ? 'Phone Intel' : 'URL Scan'} · {new Date(scan.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: '#22c55e20', color: '#22c55e' }}>
                    COMPLETE
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 text-center text-[12px]" style={{ borderTop: '1px solid #1e293b', color: '#475569' }}>
          <a href="/dfir/phone-osint" style={{ color: '#64748b' }}>⚖️ Legal Policy · Privacy · Terms</a>
        </div>
      </div>
    </DataPageLayout>
  );
}
