import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Search } from 'lucide-react';
import { ACTOR_KB, type KbActor } from '../../data/dfir/actor-kb';

/**
 * Threat-Actor Knowledge Base — MITRE ATT&CK intrusion-sets, fully
 * client-side (the dataset is built + committed by scripts/build-actor-kb.mjs,
 * no runtime fetch). Search by name / alias / ATT&CK id / technique →
 * actor profile: aliases, description, TTPs grouped by tactic, tooling.
 */

// ATT&CK kill-chain order for grouping techniques.
const TACTIC_ORDER = [
  'reconnaissance',
  'resource-development',
  'initial-access',
  'execution',
  'persistence',
  'privilege-escalation',
  'defense-evasion',
  'credential-access',
  'discovery',
  'lateral-movement',
  'collection',
  'command-and-control',
  'exfiltration',
  'impact',
  'other',
];
const tacticLabel = (t: string) => t.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function ActorKb(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const selectedId = params.get('g');

  const filtered = useMemo<KbActor[]>(() => {
    const s = q.trim().toLowerCase();
    if (!s) return ACTOR_KB;
    return ACTOR_KB.filter(
      (a) =>
        a.name.toLowerCase().includes(s) ||
        a.attackId.toLowerCase().includes(s) ||
        a.aliases.some((al) => al.toLowerCase().includes(s)) ||
        a.software.some((sw) => sw.toLowerCase().includes(s)) ||
        a.techniques.some((t) => t.name.toLowerCase().includes(s) || t.id.toLowerCase().includes(s))
    );
  }, [q]);

  const selected = useMemo(() => ACTOR_KB.find((a) => a.attackId === selectedId) ?? null, [selectedId]);

  const techByTactic = useMemo(() => {
    if (!selected) return [];
    const m = new Map<string, typeof selected.techniques>();
    for (const t of selected.techniques) {
      const arr = m.get(t.tactic) ?? [];
      arr.push(t);
      m.set(t.tactic, arr);
    }
    return [...m.entries()].sort((a, b) => TACTIC_ORDER.indexOf(a[0]) - TACTIC_ORDER.indexOf(b[0]));
  }, [selected]);

  const open = (id: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set('g', id);
        if (q.trim()) n.set('q', q.trim());
        return n;
      },
      { replace: false }
    );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2">Threat-Actor Knowledge Base</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-2xl">
          {ACTOR_KB.length} MITRE ATT&amp;CK intrusion-sets — aliases, tradecraft (TTPs by tactic) and tooling. Built
          from the ATT&amp;CK enterprise bundle and shipped with the page; nothing leaves your browser.
        </p>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search actor, alias, Gxxxx, technique, malware…"
          aria-label="Search threat actors"
          className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
        />
      </div>

      {selected && (
        <section className="mb-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-2xl font-display font-bold">{selected.name}</h2>
            <a
              href={selected.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[12px] font-mono px-1.5 py-0.5 rounded border border-brand-500/30 bg-brand-500/5 text-brand-700 dark:text-brand-300 hover:bg-brand-500/10"
            >
              {selected.attackId} <ExternalLink size={11} />
            </a>
          </div>
          {selected.aliases.length > 0 && (
            <p className="text-[12px] font-mono text-slate-500 mt-1">aka {selected.aliases.join(' · ')}</p>
          )}
          <p className="text-sm text-slate-700 dark:text-slate-300 mt-3 leading-relaxed">{selected.description}</p>

          {selected.software.length > 0 && (
            <div className="mt-4">
              <h3 className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-1.5">
                Tooling / malware ({selected.software.length})
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {selected.software.map((s) => (
                  <span
                    key={s}
                    className="text-[11px] font-mono px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {techByTactic.length > 0 && (
            <div className="mt-4">
              <h3 className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-2">
                Techniques ({selected.techniques.length}) by tactic
              </h3>
              <div className="space-y-3">
                {techByTactic.map(([t, list]) => (
                  <div key={t}>
                    <div className="text-[12px] font-semibold text-brand-700 dark:text-brand-300 mb-1">
                      {tacticLabel(t)}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((tech) => (
                        <a
                          key={tech.id}
                          href={`https://attack.mitre.org/techniques/${tech.id.replace('.', '/')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={tech.name}
                          className="text-[11px] font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
                        >
                          {tech.id} {tech.name}
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <div className="text-[12px] font-mono text-slate-500 mb-2">
        {filtered.length} of {ACTOR_KB.length} actors
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.slice(0, 240).map((a) => (
          <button
            key={a.attackId}
            type="button"
            onClick={() => open(a.attackId)}
            className={`text-left rounded-lg border p-3 transition-colors ${
              a.attackId === selectedId
                ? 'border-brand-500/50 bg-brand-500/5'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-brand-500/40'
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-display font-semibold truncate">{a.name}</span>
              <span className="text-[10px] font-mono text-slate-500 shrink-0">{a.attackId}</span>
            </div>
            {a.aliases.length > 0 && (
              <p className="text-[11px] font-mono text-slate-500 mt-0.5 truncate">{a.aliases.join(' · ')}</p>
            )}
            <p className="text-[11px] text-slate-500 mt-1">
              {a.techniques.length} TTPs · {a.software.length} tools
            </p>
          </button>
        ))}
      </div>
      {filtered.length > 240 && (
        <p className="text-[12px] text-slate-500 mt-3">Showing first 240 — refine the search to narrow.</p>
      )}
    </div>
  );
}
