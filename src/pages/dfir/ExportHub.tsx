import { useState } from 'react';
import { Download, FileCode, FileText, Shield, Copy, Check, Loader2, type LucideIcon } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';

type ExportFormat = 'stix' | 'misp' | 'sigma' | 'yara' | 'snort' | 'suricata' | 'csv' | 'pfsense';

const FORMATS: Array<{ id: ExportFormat; label: string; desc: string; icon: LucideIcon }> = [
  { id: 'stix', label: 'STIX 2.1', desc: 'Structured Threat Information eXpression bundle', icon: Shield },
  { id: 'misp', label: 'MISP Event', desc: 'MISP event format for sharing platforms', icon: FileCode },
  { id: 'sigma', label: 'Sigma Rule', desc: 'Generic SIEM detection rule format', icon: FileCode },
  { id: 'yara', label: 'YARA Rule', desc: 'Malware pattern matching rule', icon: FileCode },
  { id: 'snort', label: 'Snort Rule', desc: 'Network intrusion detection rule', icon: Shield },
  { id: 'suricata', label: 'Suricata Rule', desc: 'Next-gen IDS/IPS rule', icon: Shield },
  { id: 'csv', label: 'CSV', desc: 'Spreadsheet-compatible IOC list', icon: FileText },
  { id: 'pfsense', label: 'pfSense Alias', desc: 'IP blocklist for pfSense firewall', icon: Shield },
];

export default function ExportHub(): JSX.Element {
  const [selected, setSelected] = useState<ExportFormat>('stix');
  const [iocInput, setIocInput] = useState('');
  const [eventName, setEventName] = useState('IOC Export');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const parseIOCs = () => {
    const lines = iocInput
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    return lines.map((line) => {
      const parts = line.split(',').map((p) => p.trim());
      const value = parts[0];
      const type = parts[1] ?? detectType(value);
      return {
        value,
        type,
        confidence: Number(parts[2] ?? 50),
        first_seen: parts[3] ?? new Date().toISOString(),
        last_seen: parts[4] ?? new Date().toISOString(),
        tags: (parts[5] ?? '').split(';').filter(Boolean),
        source: parts[6] ?? 'manual',
      };
    });
  };

  const detectType = (v: string): string => {
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(v)) return 'ip';
    if (/^[a-f0-9]{32}$/i.test(v)) return 'hash-md5';
    if (/^[a-f0-9]{40}$/i.test(v)) return 'hash-sha1';
    if (/^[a-f0-9]{64}$/i.test(v)) return 'hash-sha256';
    if (/^https?:\/\//.test(v)) return 'url';
    if (/@/.test(v)) return 'email';
    if (/\./.test(v)) return 'domain';
    return 'ip';
  };

  const exportData = async () => {
    setLoading(true);
    try {
      const iocs = parseIOCs();
      const body =
        selected === 'misp'
          ? { iocs, event_name: eventName }
          : selected === 'sigma'
            ? { name: eventName, description: 'Exported IOCs', iocs }
            : selected === 'yara'
              ? {
                  name: eventName,
                  description: 'Exported rules',
                  hash_iocs: iocs.filter((i) => i.type.startsWith('hash')).map((i) => i.value),
                  string_iocs: [],
                }
              : selected === 'snort' || selected === 'suricata'
                ? { name: eventName, ip_iocs: iocs.filter((i) => i.type === 'ip').map((i) => i.value) }
                : iocs;
      const res = await fetch(`/api/v1/export/${selected}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      setResult(text);
    } catch (e) {
      setResult(`Error: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const copyResult = async () => {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="back to DFIR"
      icon={<Download size={28} />}
      title="Export Hub"
      maxWidthClass="max-w-6xl"
      description="Export IOCs to standard formats — STIX, MISP, Sigma, YARA, Snort, Suricata, CSV, pfSense"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-semibold uppercase text-slate-500 mb-3">Format</h2>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {FORMATS.map((f) => {
              const Icon = f.icon;
              return (
                <button
                  key={f.id}
                  onClick={() => setSelected(f.id)}
                  className={`text-left p-3 rounded-lg border text-sm ${selected === f.id ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/20' : 'border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon size={14} /> <span className="font-medium">{f.label}</span>
                  </div>
                  <p className="text-micro text-slate-500">{f.desc}</p>
                </button>
              );
            })}
          </div>
          <div className="mb-4">
            <span className="block text-xs font-medium text-slate-500 mb-1">Export Name</span>
            <input
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-300))] text-sm"
            />
          </div>
          <div className="mb-4">
            <span className="block text-xs font-medium text-slate-500 mb-1">
              IOCs (one per line, optional: value,type,confidence)
            </span>
            <textarea
              value={iocInput}
              onChange={(e) => setIocInput(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-300))] text-sm font-mono text-xs"
              placeholder={'1.2.3.4\nmalware.com\nabc123def456...,hash-sha256,80'}
            />
          </div>
          <button
            onClick={exportData}
            disabled={loading || !iocInput.trim()}
            className="w-full px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Export
          </button>
        </div>
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase text-slate-500">Output</h2>
            {result && (
              <button
                onClick={copyResult}
                className="text-xs text-slate-500 hover:text-brand-600 inline-flex items-center gap-1"
              >
                {copied ? (
                  <>
                    <Check size={12} className="text-emerald-500" /> Copied
                  </>
                ) : (
                  <>
                    <Copy size={12} /> Copy
                  </>
                )}
              </button>
            )}
          </div>
          <pre className="p-4 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] text-xs font-mono whitespace-pre-wrap break-all min-h-[400px] max-h-[600px] overflow-auto">
            {result || 'Export output will appear here...'}
          </pre>
        </div>
      </div>
    </DataPageLayout>
  );
}
