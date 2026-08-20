import { useState, useMemo } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import { Modal } from '../components/ui/Modal';
import { Shield, Search, ChevronDown, ChevronRight } from 'lucide-react';

interface CloakIndex {
  source: string;
  sourceUrl: string;
  license: string;
  author: string;
  replicatedAt: string;
  counts: { tactics: number; techniques: number; subtechniques: number; procedures: number };
  tacticIndex: Array<{
    id: number;
    name: string;
    techniqueCount: number;
    subtechniqueCount: number;
    procedureCount: number;
  }>;
}

interface CloakTacticBody {
  id: number;
  name: string;
  description: string;
  techniqueCount: number;
  subtechniqueCount: number;
  procedureCount: number;
  techniques: Array<{
    id: number;
    name: string;
    type: string;
    subCount: number;
    procCount: number;
    subIndex: Array<{ id: number; name: string; type: string }>;
  }>;
}

interface CloakTechniqueBody {
  id: number;
  name: string;
  description: string;
  type: string;
  tacticId: number;
  tacticName: string;
  subtechniques: Array<{
    id: number;
    name: string;
    description: string;
    type: string;
    procedures: Array<{ id: string; name: string; description: string }>;
  }>;
  procedures: Array<{ id: string; name: string; description: string }>;
}

const TYPE_TONE: Record<string, string> = {
  Technical: 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800',
  Behavioral:
    'text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40 border-violet-300 dark:border-violet-800',
  Physical:
    'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
};

const CARD = 'surface-card';

function TechniqueDetail({ body, onClose }: { body: CloakTechniqueBody; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={body.name} size="lg">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-micro font-bold px-2 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-600 dark:text-slate-300">
            T{body.id}
          </span>
          <span className="font-mono text-micro px-2 py-0.5 rounded border border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40">
            {body.tacticName}
          </span>
          {body.type && (
            <span className={`font-mono text-micro px-2 py-0.5 rounded border ${TYPE_TONE[body.type] ?? ''}`}>
              {body.type}
            </span>
          )}
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{body.description}</p>

        {body.subtechniques.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Sub-techniques ({body.subtechniques.length})
            </div>
            <div className="space-y-3">
              {body.subtechniques.map((sub) => (
                <div
                  key={sub.id}
                  className="border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg p-3"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-micro font-bold text-slate-500">ST{sub.id}</span>
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{sub.name}</span>
                    {sub.type && (
                      <span
                        className={`font-mono text-micro px-1.5 py-0.5 rounded border ${TYPE_TONE[sub.type] ?? ''}`}
                      >
                        {sub.type}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">{sub.description}</p>
                  {sub.procedures.length > 0 && (
                    <div className="space-y-1">
                      {sub.procedures.map((p) => (
                        <div key={p.id} className="flex items-start gap-2 text-micro">
                          <span className="font-mono text-slate-400 shrink-0">{p.id}</span>
                          <span className="text-slate-600 dark:text-slate-300">{p.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {body.procedures.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Procedures ({body.procedures.length})
            </div>
            <div className="space-y-1">
              {body.procedures.map((p) => (
                <div key={p.id} className="flex items-start gap-2 text-micro">
                  <span className="font-mono text-slate-400 shrink-0">{p.id}</span>
                  <span className="text-slate-600 dark:text-slate-300">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function Cloak() {
  const [q, setQ] = useState('');
  const [expandedTactic, setExpandedTactic] = useState<number | null>(null);
  const [tacticData, setTacticData] = useState<CloakTacticBody | null>(null);
  const [techniqueBody, setTechniqueBody] = useState<CloakTechniqueBody | null>(null);
  const [typeFilter, setTypeFilter] = useState('');

  const { data: index } = useDataFetch<CloakIndex>({ url: '/data/cloak/index.json', ttl: 120_000 });

  const filteredTactics = useMemo(() => {
    if (!index) return [];
    const ql = q.toLowerCase();
    return index.tacticIndex.filter((t) => !ql || t.name.toLowerCase().includes(ql));
  }, [index, q]);

  const loadTactic = async (id: number) => {
    if (expandedTactic === id) {
      setExpandedTactic(null);
      setTacticData(null);
      return;
    }
    setExpandedTactic(id);
    try {
      const res = await fetch(`/data/cloak/tactics/${id}.json`);
      if (res.ok) {
        const data = (await res.json()) as CloakTacticBody;
        setTacticData(data);
      }
    } catch {
      setTacticData(null);
    }
  };

  const loadTechnique = async (id: number) => {
    try {
      const res = await fetch(`/data/cloak/techniques/${id}.json`);
      if (res.ok) {
        const data = (await res.json()) as CloakTechniqueBody;
        setTechniqueBody(data);
      }
    } catch {
      setTechniqueBody(null);
    }
  };

  const filteredTechniques = useMemo(() => {
    if (!tacticData) return [];
    let list = tacticData.techniques;
    if (q) {
      const ql = q.toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(ql));
    }
    if (typeFilter) {
      const tl = typeFilter.toLowerCase();
      list = list.filter((t) => t.type.toLowerCase() === tl);
    }
    return list;
  }, [tacticData, q, typeFilter]);

  const stats = index?.counts;

  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="DFIR"
      icon={<Shield />}
      title="CLOAK — Anonymity Framework"
      description={
        <span>
          Concealment Layers for Online Anonymity and Knowledge — {stats?.tactics ?? 13} tactics,{' '}
          {stats?.techniques ?? 129} techniques, {stats?.subtechniques ?? 751} sub-techniques,{' '}
          {stats?.procedures ?? 367} procedures.{' '}
          <a
            href="https://github.com/Mickinthemiddle/CLOAK"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
          >
            Source (GPL-2.0) ↗
          </a>
        </span>
      }
    >
      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tactics or techniques..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-slate-800 dark:text-slate-200"
        >
          <option value="">All types</option>
          <option value="Technical">Technical</option>
          <option value="Behavioral">Behavioral</option>
          <option value="Physical">Physical</option>
        </select>
      </div>

      <div className="space-y-2">
        {filteredTactics.map((tactic) => (
          <div key={tactic.id} className={`${CARD} overflow-hidden`}>
            <button
              onClick={() => loadTactic(tactic.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-[rgb(var(--hover-100))] transition-colors"
            >
              {expandedTactic === tactic.id ? (
                <ChevronDown size={16} className="text-slate-400 shrink-0" />
              ) : (
                <ChevronRight size={16} className="text-slate-400 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{tactic.name}</div>
                <div className="text-micro text-slate-500">
                  {tactic.techniqueCount} techniques · {tactic.subtechniqueCount} sub-techniques ·{' '}
                  {tactic.procedureCount} procedures
                </div>
              </div>
            </button>

            {expandedTactic === tactic.id && tacticData && (
              <div className="border-t border-slate-200 dark:border-[rgb(var(--border-400))] px-4 py-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{tacticData.description}</p>
                <div className="space-y-1.5">
                  {filteredTechniques.map((tech) => (
                    <button
                      key={tech.id}
                      onClick={() => loadTechnique(tech.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-[rgb(var(--surface-200))] hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] transition-colors text-left"
                    >
                      <span className="font-mono text-micro text-slate-400 shrink-0">T{tech.id}</span>
                      <span className="text-sm text-slate-700 dark:text-slate-200 flex-1">{tech.name}</span>
                      {tech.type && (
                        <span
                          className={`font-mono text-micro px-1.5 py-0.5 rounded border shrink-0 ${TYPE_TONE[tech.type] ?? ''}`}
                        >
                          {tech.type}
                        </span>
                      )}
                      <span className="text-micro text-slate-400 shrink-0">
                        {tech.subCount} sub · {tech.procCount} proc
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {techniqueBody && <TechniqueDetail body={techniqueBody} onClose={() => setTechniqueBody(null)} />}
    </DataPageLayout>
  );
}
