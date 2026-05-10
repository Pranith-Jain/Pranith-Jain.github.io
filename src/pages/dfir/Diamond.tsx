import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Diamond as DiamondIcon, RotateCcw, Download, ExternalLink } from 'lucide-react';
import {
  DIAMOND_VERTICES,
  META_FEATURES,
  EXTENDED_AXES,
  SAMPLE_EVENT,
  type EventForm,
  type VertexId,
} from '../../data/diamond';

const STORAGE_KEY = 'dfir.diamond.event';
const EMPTY_EVENT: EventForm = {
  adversary: '',
  capability: '',
  infrastructure: '',
  victim: '',
  timestamp: '',
  phase: '',
  result: '',
  direction: '',
  methodology: '',
  resources: '',
  socioPolitical: '',
  technology: '',
};

function loadEvent(): EventForm {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_EVENT;
    const parsed = JSON.parse(raw);
    return { ...EMPTY_EVENT, ...parsed };
  } catch {
    return EMPTY_EVENT;
  }
}

function buildMarkdown(e: EventForm): string {
  const has = (s: string) => s.trim().length > 0;
  const lines: string[] = ['# Diamond Model — Intrusion Event', ''];
  lines.push('## Core features', '');
  if (has(e.adversary)) lines.push(`- **Adversary:** ${e.adversary}`);
  if (has(e.capability)) lines.push(`- **Capability:** ${e.capability}`);
  if (has(e.infrastructure)) lines.push(`- **Infrastructure:** ${e.infrastructure}`);
  if (has(e.victim)) lines.push(`- **Victim:** ${e.victim}`);
  lines.push('', '## Meta-features', '');
  if (has(e.timestamp)) lines.push(`- **Timestamp:** ${e.timestamp}`);
  if (has(e.phase)) lines.push(`- **Phase:** ${e.phase}`);
  if (has(e.result)) lines.push(`- **Result:** ${e.result}`);
  if (has(e.direction)) lines.push(`- **Direction:** ${e.direction}`);
  if (has(e.methodology)) lines.push(`- **Methodology:** ${e.methodology}`);
  if (has(e.resources)) lines.push(`- **Resources:** ${e.resources}`);
  lines.push('', '## Extended', '');
  if (has(e.socioPolitical)) lines.push(`- **Socio-political:** ${e.socioPolitical}`);
  if (has(e.technology)) lines.push(`- **Technology:** ${e.technology}`);
  return lines.join('\n');
}

const VERTEX_KEY: Record<VertexId, keyof EventForm> = {
  adversary: 'adversary',
  capability: 'capability',
  infrastructure: 'infrastructure',
  victim: 'victim',
};

const VERTEX_POS: Record<VertexId, { x: number; y: number }> = {
  adversary: { x: 200, y: 24 },
  capability: { x: 376, y: 200 },
  victim: { x: 200, y: 376 },
  infrastructure: { x: 24, y: 200 },
};

function Diamond(): JSX.Element {
  const [event, setEvent] = useState<EventForm>(EMPTY_EVENT);
  const [active, setActive] = useState<VertexId | null>(null);

  useEffect(() => {
    setEvent(loadEvent());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(event));
    } catch {
      /* quota / private mode — non-fatal */
    }
  }, [event]);

  const filledCore = useMemo(() => DIAMOND_VERTICES.filter((v) => event[VERTEX_KEY[v.id]].trim()).length, [event]);

  const update = (k: keyof EventForm, v: string) => setEvent((e) => ({ ...e, [k]: v }));
  const reset = () => setEvent(EMPTY_EVENT);
  const loadSample = () => setEvent(SAMPLE_EVENT);

  const exportMd = () => {
    const md = buildMarkdown(event);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diamond-event.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /dfir
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <DiamondIcon size={28} className="text-brand-600 dark:text-brand-400" /> Diamond Model
        </h1>
        <p className="text-slate-600 dark:text-slate-400 font-mono mb-2">
          Caltagirone, Pendergast &amp; Betz, 2013. Every intrusion event is a connected diamond of Adversary,
          Capability, Infrastructure and Victim, plus meta-features describing the event itself.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-8">
          Pairs with the{' '}
          <Link to="/dfir/kill-chain" className="text-brand-600 dark:text-brand-400 hover:underline">
            Cyber Kill Chain
          </Link>{' '}
          (where in the timeline) and{' '}
          <Link to="/threatintel/mitre" className="text-brand-600 dark:text-brand-400 hover:underline">
            MITRE ATT&amp;CK
          </Link>{' '}
          (which TTPs).
        </p>
      </div>

      {/* Diagram + tabs */}
      <div className="grid gap-6 lg:grid-cols-[400px_1fr] mb-8">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center justify-center">
          <svg viewBox="0 0 400 400" className="w-full h-auto max-w-[360px]" role="img" aria-label="Diamond model">
            {/* Connecting edges */}
            <polygon
              points="200,40 360,200 200,360 40,200"
              fill="none"
              className="stroke-slate-300 dark:stroke-slate-700"
              strokeWidth="2"
            />
            {/* Diagonals */}
            <line
              x1="200"
              y1="40"
              x2="200"
              y2="360"
              className="stroke-slate-300 dark:stroke-slate-700"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <line
              x1="40"
              y1="200"
              x2="360"
              y2="200"
              className="stroke-slate-300 dark:stroke-slate-700"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            {DIAMOND_VERTICES.map((v) => {
              const pos = VERTEX_POS[v.id];
              const isActive = active === v.id;
              const isFilled = event[VERTEX_KEY[v.id]].trim().length > 0;
              return (
                <g
                  key={v.id}
                  className="cursor-pointer"
                  onMouseEnter={() => setActive(v.id)}
                  onMouseLeave={() => setActive(null)}
                  onClick={() => setActive(v.id)}
                >
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={isActive ? 50 : 44}
                    className={`transition-all ${
                      isFilled
                        ? 'fill-brand-500/20 stroke-brand-500'
                        : isActive
                          ? 'fill-slate-200 dark:fill-slate-800 stroke-slate-400'
                          : 'fill-white dark:fill-slate-900 stroke-slate-300 dark:stroke-slate-700'
                    }`}
                    strokeWidth="2"
                  />
                  <text
                    x={pos.x}
                    y={pos.y - 4}
                    textAnchor="middle"
                    className="font-display font-semibold fill-slate-900 dark:fill-slate-100"
                    style={{ fontSize: 13 }}
                  >
                    {v.name}
                  </text>
                  <text
                    x={pos.x}
                    y={pos.y + 14}
                    textAnchor="middle"
                    className="font-mono fill-slate-500 dark:fill-slate-500"
                    style={{ fontSize: 9 }}
                  >
                    {isFilled ? '● filled' : '○ empty'}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono">
              {active ? `${DIAMOND_VERTICES.find((v) => v.id === active)?.name}` : 'Vertices'}
            </h2>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-500">
              {filledCore} / {DIAMOND_VERTICES.length} filled
            </span>
          </div>
          {active ? (
            (() => {
              const v = DIAMOND_VERTICES.find((x) => x.id === active)!;
              return (
                <div className="space-y-3 text-sm font-mono text-slate-700 dark:text-slate-300">
                  <p>{v.description}</p>
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500 mb-1">
                      Pivot points
                    </h3>
                    <ul className="space-y-1 text-[12px] list-disc pl-4">
                      {v.pivots.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500 mb-1">
                      Tools
                    </h3>
                    <p className="text-[12px]">{v.tools.join(' · ')}</p>
                  </div>
                </div>
              );
            })()
          ) : (
            <ul className="space-y-2 text-sm font-mono text-slate-600 dark:text-slate-400">
              {DIAMOND_VERTICES.map((v) => (
                <li key={v.id} className="flex items-baseline gap-2">
                  <span className="text-brand-600 dark:text-brand-400 font-semibold">{v.name}</span>
                  <span className="text-xs">— {v.short}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Event editor */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono">
            Intrusion event
          </h2>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={loadSample}
              className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
            >
              Load sample
            </button>
            <button
              onClick={exportMd}
              className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1"
            >
              <Download size={11} /> Export markdown
            </button>
            <button
              onClick={reset}
              className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400 inline-flex items-center gap-1"
            >
              <RotateCcw size={11} /> Reset
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {DIAMOND_VERTICES.map((v) => {
            const k = VERTEX_KEY[v.id];
            return (
              <label key={v.id} className="block">
                <span className="text-xs font-mono text-slate-700 dark:text-slate-300 mb-1 block">
                  {v.name} <span className="text-slate-400 dark:text-slate-500">— {v.short}</span>
                </span>
                <textarea
                  value={event[k]}
                  onChange={(e) => update(k, e.target.value)}
                  rows={3}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 font-mono text-xs text-slate-900 dark:text-slate-100 focus:border-brand-500/60 focus:outline-none"
                  placeholder={v.examples[0]}
                />
              </label>
            );
          })}
        </div>
      </section>

      {/* Meta-features */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
          Meta-features
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {META_FEATURES.map((m) => {
            const k = m.id as keyof EventForm;
            return (
              <label key={m.id} className="block">
                <span className="text-xs font-mono text-slate-700 dark:text-slate-300 mb-1 block">{m.name}</span>
                <input
                  type="text"
                  value={event[k]}
                  onChange={(e) => update(k, e.target.value)}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 font-mono text-xs text-slate-900 dark:text-slate-100 focus:border-brand-500/60 focus:outline-none"
                  placeholder={m.description}
                />
              </label>
            );
          })}
        </div>
      </section>

      {/* Extended axes */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
          Extended axes
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {EXTENDED_AXES.map((a) => {
            const k = a.id === 'social-political' ? 'socioPolitical' : 'technology';
            return (
              <div key={a.id}>
                <label className="block">
                  <span className="text-xs font-mono text-slate-700 dark:text-slate-300 mb-1 block">{a.name}</span>
                  <textarea
                    value={event[k as keyof EventForm]}
                    onChange={(e) => update(k as keyof EventForm, e.target.value)}
                    rows={3}
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 font-mono text-xs text-slate-900 dark:text-slate-100 focus:border-brand-500/60 focus:outline-none"
                    placeholder={a.description}
                  />
                </label>
                <ul className="mt-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-500 space-y-0.5 list-disc pl-4">
                  {a.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
          References
        </h2>
        <ul className="space-y-1.5 text-sm font-mono text-slate-600 dark:text-slate-400">
          <li>
            <a
              href="https://apps.dtic.mil/sti/citations/ADA586960"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              Caltagirone, Pendergast &amp; Betz — The Diamond Model of Intrusion Analysis (2013)
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
          <li>
            <a
              href="https://www.activeresponse.org/the-diamond-model/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              ActiveResponse — Diamond Model overview &amp; examples
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}

export default Diamond;
