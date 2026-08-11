import { useMemo, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Fingerprint, Plus, Trash2, Download, RefreshCw } from 'lucide-react';

interface CustodyRecord {
  id: string;
  date: string;
  time: string;
  handler: string;
  role: string;
  action: string;
  evidenceId: string;
  notes: string;
}

interface EvidenceItem {
  id: string;
  description: string;
  hash: string;
  location: string;
}

const EMPTY_RECORD = (): CustodyRecord => ({
  id: crypto.randomUUID(),
  date: new Date().toISOString().slice(0, 10),
  time: new Date().toTimeString().slice(0, 5),
  handler: '',
  role: '',
  action: 'Transferred custody',
  evidenceId: '',
  notes: '',
});

const ACTIONS = [
  'Collected / seized',
  'Transferred custody',
  'Received custody',
  'Imaged (forensic copy)',
  'Analyzed (read-only)',
  'Returned',
  'Released per order',
];

function toLocalTime(dateStr: string, timeStr: string): string {
  const [y, m, d] = (dateStr || '').split('-').map(Number);
  const [hh, mm] = (timeStr || '').split(':').map(Number);
  const dt = new Date(y || 0, (m || 1) - 1, d || 1, hh || 0, mm || 0);
  return Number.isNaN(dt.getTime()) ? `${dateStr} ${timeStr}` : dt.toLocaleString(undefined, { timeZoneName: 'short' });
}

function md(value: string): string {
  return value.replace(/\|/g, '/');
}

export default function CoCGenerator() {
  const [evidence, setEvidence] = useState<EvidenceItem[]>([
    { id: 'EVID-001', description: 'Suspect workstation (evidence unit)', hash: '', location: '' },
  ]);
  const [records, setRecords] = useState<CustodyRecord[]>([]);

  const addRecord = () => setRecords((r) => [...r, EMPTY_RECORD()]);
  const removeRecord = (id: string) => setRecords((r) => r.filter((x) => x.id !== id));
  const patchRecord = (id: string, patch: Partial<CustodyRecord>) =>
    setRecords((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const addEvidence = () =>
    setEvidence((e) => [
      ...e,
      { id: `EVID-${String(e.length + 1).padStart(3, '0')}`, description: '', hash: '', location: '' },
    ]);
  const removeEvidence = (id: string) => setEvidence((e) => e.filter((x) => x.id !== id));
  const patchEvidence = (id: string, patch: Partial<EvidenceItem>) =>
    setEvidence((e) => e.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const gaps = useMemo(() => {
    const missing: string[] = [];
    if (records.length === 0) return ['No custody records yet — add the first transfer.'];
    records.forEach((r, i) => {
      if (!r.handler.trim()) missing.push(`Record ${i + 1}: handler name missing`);
      if (!r.evidenceId.trim()) missing.push(`Record ${i + 1}: evidence ID missing`);
    });
    const lastTime = records.reduce((acc, r) => Math.max(acc, new Date(`${r.date}T${r.time}`).getTime()), 0);
    if (lastTime > Date.now() + 60_000) missing.push('A custody timestamp is in the future.');
    return missing;
  }, [records]);

  const exportMd = () => {
    const lines: string[] = [
      '# Chain of Custody Log',
      '',
      `Generated: ${new Date().toLocaleString(undefined, { timeZoneName: 'short' })}`,
      '',
      '## Evidence inventory',
      '',
      '| ID | Description | Hash (SHA-256) | Location |',
      '|---|---|---|---|',
      ...evidence.map((e) => `| ${e.id} | ${md(e.description)} | ${md(e.hash)} | ${md(e.location)} |`),
      '',
      '## Custody timeline',
      '',
      '| When | Handler | Role | Action | Evidence | Notes |',
      '|---|---|---|---|---|---|',
      ...records.map(
        (r) =>
          `| ${toLocalTime(r.date, r.time)} | ${md(r.handler)} | ${md(r.role)} | ${md(r.action)} | ${md(r.evidenceId)} | ${md(r.notes)} |`
      ),
      '',
      '## Integrity notes',
      '',
      '- Every transfer must be signed (wet signature or certified digital signature).',
      '- Hash the evidence at acquisition and before every analysis session.',
      '- Analysis is read-only against the forensic image; never the original.',
      '- This log is generated client-side — archive a copy in the case file.',
      '',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'chain-of-custody.md';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Fingerprint />}
      title="Chain of Custody Generator"
      description="Build a defensible custody timeline: evidence inventory with hashes, transfer-by-transfer handlers, roles and timestamps — exported as markdown for the case file."
      maxWidthClass="max-w-5xl"
    >
      <div className="space-y-6">
        {/* Evidence inventory */}
        <section className="surface-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono">
              Evidence Inventory
            </h2>
            <button
              onClick={addEvidence}
              className="inline-flex items-center gap-1 text-xs font-mono px-2.5 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40 transition-colors"
            >
              <Plus size={12} /> Add item
            </button>
          </div>
          <div className="space-y-2">
            {evidence.map((e) => (
              <div
                key={e.id}
                className="grid gap-2 sm:grid-cols-[110px_1fr_1fr_36px] items-center rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-2.5"
              >
                <input
                  value={e.id}
                  onChange={(ev) => patchEvidence(e.id, { id: ev.target.value })}
                  className="px-2 py-1 rounded text-xs font-mono bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] focus:outline-none focus:border-brand-500"
                />
                <input
                  value={e.description}
                  onChange={(ev) => patchEvidence(e.id, { description: ev.target.value })}
                  placeholder="Description"
                  className="px-2 py-1 rounded text-xs bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] focus:outline-none focus:border-brand-500"
                />
                <div className="flex gap-2">
                  <input
                    value={e.hash}
                    onChange={(ev) => patchEvidence(e.id, { hash: ev.target.value })}
                    placeholder="SHA-256"
                    className="flex-1 px-2 py-1 rounded text-xs font-mono bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] focus:outline-none focus:border-brand-500"
                  />
                  <input
                    value={e.location}
                    onChange={(ev) => patchEvidence(e.id, { location: ev.target.value })}
                    placeholder="Location"
                    className="w-24 px-2 py-1 rounded text-xs font-mono bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] focus:outline-none focus:border-brand-500"
                  />
                </div>
                <button
                  onClick={() => removeEvidence(e.id)}
                  className="text-slate-400 hover:text-rose-500 transition-colors"
                  aria-label="Remove evidence item"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Custody timeline */}
        <section className="surface-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono">
              Custody Timeline
            </h2>
            <button
              onClick={addRecord}
              className="inline-flex items-center gap-1 text-xs font-mono px-2.5 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40 transition-colors"
            >
              <Plus size={12} /> Add transfer
            </button>
          </div>

          {records.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 font-mono py-6 text-center">
              No transfers yet — start with the acquisition/handling event.
            </p>
          ) : (
            <div className="space-y-2">
              {records.map((r, i) => (
                <div
                  key={r.id}
                  className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-2.5"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-micro font-bold text-brand-600 dark:text-brand-400">#{i + 1}</span>
                    <span className="text-micro font-mono text-slate-400">{toLocalTime(r.date, r.time)}</span>
                    <button
                      onClick={() => removeRecord(r.id)}
                      className="ml-auto text-slate-400 hover:text-rose-500 transition-colors"
                      aria-label="Remove record"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={r.date}
                        onChange={(ev) => patchRecord(r.id, { date: ev.target.value })}
                        className="flex-1 px-2 py-1 rounded text-xs font-mono bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] focus:outline-none focus:border-brand-500"
                      />
                      <input
                        type="time"
                        value={r.time}
                        onChange={(ev) => patchRecord(r.id, { time: ev.target.value })}
                        className="px-2 py-1 rounded text-xs font-mono bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] focus:outline-none focus:border-brand-500"
                      />
                    </div>
                    <input
                      value={r.handler}
                      onChange={(ev) => patchRecord(r.id, { handler: ev.target.value })}
                      placeholder="Handler name"
                      className="px-2 py-1 rounded text-xs bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] focus:outline-none focus:border-brand-500"
                    />
                    <input
                      value={r.role}
                      onChange={(ev) => patchRecord(r.id, { role: ev.target.value })}
                      placeholder="Role (e.g. Lead Examiner)"
                      className="px-2 py-1 rounded text-xs bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] focus:outline-none focus:border-brand-500"
                    />
                    <select
                      value={r.action}
                      onChange={(ev) => patchRecord(r.id, { action: ev.target.value })}
                      className="px-2 py-1 rounded text-xs bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] focus:outline-none focus:border-brand-500"
                    >
                      {ACTIONS.map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                    <input
                      value={r.evidenceId}
                      onChange={(ev) => patchRecord(r.id, { evidenceId: ev.target.value })}
                      placeholder="Evidence ID"
                      className="px-2 py-1 rounded text-xs font-mono bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] focus:outline-none focus:border-brand-500"
                    />
                    <input
                      value={r.notes}
                      onChange={(ev) => patchRecord(r.id, { notes: ev.target.value })}
                      placeholder="Notes (seal #, transfer method...)"
                      className="px-2 py-1 rounded text-xs bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {gaps.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3">
              <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">
                Integrity check
              </div>
              <ul className="space-y-0.5 text-mini font-mono text-amber-700 dark:text-amber-300">
                {gaps.map((g, i) => (
                  <li key={i}>• {g}</li>
                ))}
                {evidence.some((e) => !e.description.trim()) && <li>• An evidence item has no description.</li>}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={exportMd}
              className="inline-flex items-center gap-1.5 text-sm font-mono px-3 py-1.5 rounded border border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:bg-brand-500/20 transition-colors"
            >
              <Download size={13} /> Export markdown
            </button>
            <button
              onClick={() => {
                if (typeof window !== 'undefined' && confirm('Clear all custody records and evidence?')) {
                  setRecords([]);
                  setEvidence([]);
                }
              }}
              className="inline-flex items-center gap-1.5 text-sm font-mono px-3 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
            >
              <RefreshCw size={13} /> Reset
            </button>
          </div>
        </section>

        <div className="text-center pt-2 pb-2 text-xs text-slate-500 dark:text-slate-500 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
          Pairs with the{' '}
          <a href="/dfir/dfir-ref?section=evidence" className="text-brand-600 dark:text-brand-400 hover:underline">
            DFIR Reference
          </a>{' '}
          evidence phases. Signatures must be applied outside this tool — it produces the working log, not the notarized
          record.
        </div>
      </div>
    </DataPageLayout>
  );
}
