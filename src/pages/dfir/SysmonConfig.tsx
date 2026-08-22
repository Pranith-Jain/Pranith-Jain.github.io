import { useMemo, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { TerminalSquare, Copy, Check, Download, RefreshCw } from 'lucide-react';

/**
 * Sysmon v15.x config generator — focuses on the events that matter for
 * detection (1,3,7,8,11,22,23) with level-tuned exclusions, in the spirit
 * of the Sysmon-Modular community approach.
 */
interface SliderConfig {
  id: 'proc' | 'net' | 'dns' | 'file' | 'imgload';
  label: string;
}

const SLIDERS: SliderConfig[] = [
  { id: 'proc', label: 'Process creation' },
  { id: 'net', label: 'Network connections' },
  { id: 'dns', label: 'DNS queries' },
  { id: 'file', label: 'File creation' },
  { id: 'imgload', label: 'Image loads' },
];

type SysmonLevel = 'verbose' | 'baseline' | 'lean';
type SysmonMode = 'verbose' | 'baseline' | 'lean';

const PRESETS: Record<SysmonMode, Record<SliderConfig['id'], SysmonLevel>> = {
  verbose: { proc: 'verbose', net: 'verbose', dns: 'verbose', file: 'verbose', imgload: 'verbose' },
  baseline: { proc: 'verbose', net: 'baseline', dns: 'baseline', file: 'baseline', imgload: 'baseline' },
  lean: { proc: 'baseline', net: 'lean', dns: 'lean', file: 'lean', imgload: 'lean' },
};

export default function SysmonConfig() {
  const [mode, setMode] = useState<SysmonMode>('baseline');
  const [level, setLevel] = useState<Record<SliderConfig['id'], SysmonLevel>>(PRESETS.baseline);
  const [name, setName] = useState<string>('sysmon-config-baseline.xml');
  const [showSchTask, setShowSchTask] = useState(false);
  const [showClipboard, setShowClipboard] = useState(false);
  const [copied, setCopied] = useState(false);

  const applyPreset = (p: SysmonMode) => {
    setMode(p);
    setLevel(PRESETS[p]);
  };

  // Build XML via string assembly so users see exactly what ships.
  const xml = useMemo(() => {
    const { proc: pLvl, net: nLvl, dns: dLvl, file: fLvl, imgload: iLvl } = level;

    const eventBlocks: string[] = [];
    const addEvent = (id: number, match: string, rule: string) =>
      eventBlocks.push(`          <Event ID="${id}" onmatch="${match}">\n${rule}          </Event>`);

    addEvent(
      1,
      'exclude',
      pLvl === 'verbose' ? '' : '            <Image condition="is">C:\\Windows\\System32\\svchost.exe</Image>\n'
    );
    addEvent(2, 'exclude', '');
    addEvent(
      3,
      'exclude',
      nLvl === 'verbose' ? '' : '            <DestinationIp condition="is">127.0.0.1</DestinationIp>\n'
    );
    addEvent(4, 'exclude', '');
    addEvent(6, 'exclude', '');
    addEvent(
      7,
      'exclude',
      iLvl === 'verbose'
        ? ''
        : '            <ImageLoaded condition="is">C:\\Windows\\System32\\advapi32.dll</ImageLoaded>\n'
    );
    addEvent(8, 'exclude', '');
    addEvent(9, 'exclude', '');
    addEvent(10, 'exclude', '');
    addEvent(
      11,
      'exclude',
      fLvl === 'verbose' ? '' : '            <TargetFilename condition="is">C:\\Windows\\Temp</TargetFilename>\n'
    );
    addEvent(12, 'exclude', '');
    addEvent(13, 'exclude', '');
    addEvent(14, 'exclude', '');
    addEvent(17, 'exclude', '');
    addEvent(18, 'exclude', '');
    addEvent(19, 'exclude', '');
    addEvent(
      22,
      'exclude',
      dLvl === 'lean' ? '            <QueryName condition="end with">.microsoft.com</QueryName>\n' : ''
    );
    addEvent(23, 'exclude', '');

    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(`<Sysmon schemaversion="4.90">\n  <EventFiltering>`);
    lines.push(eventBlocks.join('\n'));
    lines.push('    </EventFiltering>\n</Sysmon>');
    return lines.join('\n');
  }, [level]);

  const copy = () => {
    navigator.clipboard?.writeText(xml).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => undefined
    );
  };

  const download = () => {
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name.endsWith('.xml') ? name : `${name}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<TerminalSquare />}
      title="Sysmon Config Generator"
      description="Generate a working sysmon v15.x configuration tuned for detection value (proc, network initiator, DNS, image loads, file/hash) without generating alert noise."
      maxWidthClass="max-w-5xl"
    >
      <div className="space-y-6">
        <section className="surface-card p-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-micro font-mono uppercase tracking-wider text-slate-400">Preset:</span>
            {(['verbose', 'baseline', 'lean'] as const).map((p) => (
              <button
                key={p}
                onClick={() => applyPreset(p)}
                className={`text-xs font-mono px-2.5 py-1 rounded-full border transition-colors ${
                  mode === p
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                    : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-slate-400'
                }`}
              >
                {p}
              </button>
            ))}
            <div className="flex flex-wrap items-center gap-3 ml-auto">
              <label className="flex items-center gap-1.5 text-xs font-mono text-muted">
                <input type="checkbox" checked={showSchTask} onChange={(e) => setShowSchTask(e.target.checked)} />
                Scheduled-task prompt collection
              </label>
              <label className="flex items-center gap-1.5 text-xs font-mono text-muted">
                <input type="checkbox" checked={showClipboard} onChange={(e) => setShowClipboard(e.target.checked)} />
                Clipboard capture
              </label>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {SLIDERS.map((s) => (
              <label key={s.id} className="flex flex-col gap-1">
                <span className="text-micro font-mono text-slate-400">{s.label}</span>
                <select
                  value={level[s.id]}
                  onChange={(e) => {
                    setLevel((l) => ({ ...l, [s.id]: e.target.value as SysmonLevel }));
                  }}
                  className="px-2 py-1.5 rounded-lg text-xs font-mono bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] focus:outline-none focus:border-brand-500"
                >
                  <option value="verbose">verbose</option>
                  <option value="baseline">baseline</option>
                  <option value="lean">lean</option>
                </select>
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 min-w-[180px] max-w-xs px-2.5 py-1.5 rounded-lg text-xs font-mono bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] focus:outline-none focus:border-brand-500"
              placeholder="config file name"
            />
            <button
              onClick={copy}
              className="inline-flex items-center gap-1.5 text-sm font-mono px-3 py-1.5 rounded border border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:bg-brand-500/20 transition-colors"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'copied' : 'copy XML'}
            </button>
            <button
              onClick={download}
              className="inline-flex items-center gap-1.5 text-sm font-mono px-3 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40 transition-colors"
            >
              <Download size={13} /> download
            </button>
          </div>
        </section>

        <section className="surface-card p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-muted font-mono">Generated config</h2>
            <button
              onClick={() => {
                setLevel(PRESETS.baseline);
                setMode('baseline');
              }}
              className="inline-flex items-center gap-1 text-micro font-mono text-muted hover:text-brand-500"
            >
              <RefreshCw size={11} /> reset to baseline
            </button>
          </div>
          <pre className="font-mono text-mini leading-relaxed text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded p-4 overflow-x-auto max-h-[480px] whitespace-pre">
            {xml}
          </pre>
        </section>

        <div className="text-center pt-2 pb-2 text-xs text-slate-500 dark:text-slate-500 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
          Test in a VM first — Sysmon schema evolves (current 4.90 at v15.x). Pair with event ID 22 for DNS hunting and
          the{' '}
          <a href="/dfir/siem-library" className="text-brand-600 dark:text-brand-400 hover:underline">
            SIEM Use-Case Library
          </a>{' '}
          for what to query.
        </div>
      </div>
    </DataPageLayout>
  );
}
