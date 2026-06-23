import { useMemo, useState } from 'react';
import React from 'react';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';

interface StixObject {
  type: string;
  id: string;
  name?: string;
  description?: string;
  pattern?: string;
  pattern_type?: string;
  valid_from?: string;
  labels?: string[];
  external_references?: Array<{ source_name?: string; external_id?: string; url?: string }>;
  created?: string;
  modified?: string;
  relationship_type?: string;
  source_ref?: string;
  target_ref?: string;
  object_refs?: string[];
}

export interface StixBundle {
  type: string;
  id: string;
  objects: StixObject[];
}

const TYPE_COLORS: Record<string, { badge: string; bg: string }> = {
  vulnerability: { badge: 'border-rose-500/40 text-rose-600', bg: 'bg-rose-500/5' },
  indicator: { badge: 'border-amber-500/40 text-amber-600', bg: 'bg-amber-500/5' },
  'attack-pattern': { badge: 'border-violet-500/40 text-violet-600', bg: 'bg-violet-500/5' },
  'threat-actor': { badge: 'border-rose-500/40 text-rose-600', bg: 'bg-rose-500/5' },
  malware: { badge: 'border-orange-500/40 text-orange-600', bg: 'bg-orange-500/5' },
  relationship: { badge: 'border-slate-500/40 text-slate-500', bg: 'bg-slate-500/5' },
  report: { badge: 'border-brand-500/40 text-brand-600', bg: 'bg-brand-500/5' },
  campaign: { badge: 'border-emerald-500/40 text-emerald-600', bg: 'bg-emerald-500/5' },
};

function getObjectName(obj: StixObject): string {
  if (obj.name) return obj.name;
  if (obj.relationship_type && obj.source_ref && obj.target_ref) {
    const src = obj.source_ref.split('--')[0]?.replace(/-/g, ' ') ?? '';
    const tgt = obj.target_ref.split('--')[0]?.replace(/-/g, ' ') ?? '';
    return `${src} →${obj.relationship_type}→ ${tgt}`;
  }
  return obj.id;
}

/** Extract STIX bundle from report text. Handles ```stix and ```json blocks. */
// eslint-disable-next-line react-refresh/only-export-components -- utility co-located with the viewer component
export function extractStixBundle(report: string): StixBundle | null {
  // Try ```stix block first
  const stixMatch = report.match(/```stix\s*\n([\s\S]*?)```/);
  const raw = stixMatch?.[1]?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.type === 'bundle' && Array.isArray(parsed.objects)) return parsed as StixBundle;
    } catch {
      /* not valid JSON */
    }
  }
  // Try ```json block with "type":"bundle"
  const jsonMatch = report.match(/```json\s*\n(\{[\s\S]*?"type"\s*:\s*"bundle"[\s\S]*?\})\s*\n```/);
  const jsonRaw = jsonMatch?.[1]?.trim();
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw);
      if (parsed.type === 'bundle' && Array.isArray(parsed.objects)) return parsed as StixBundle;
    } catch {
      /* not valid JSON */
    }
  }
  return null;
}

/** Render STIX relationships as an inline graph summary within the report. */
function StixRelationshipGraphImpl({ bundle }: { bundle: StixBundle }): JSX.Element | null {
  // Build a lookup map for object names — memoized so we don't re-allocate
  // on every re-render of the parent (e.g. when the user toggles the
  // stakeholder filter chip). MUST be called before any conditional return
  // so React hooks are always invoked in the same order.
  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const obj of bundle.objects) {
      m.set(obj.id, obj.name ?? obj.id.split('--')[0] ?? obj.id);
    }
    return m;
  }, [bundle.objects]);

  const relationships = bundle.objects.filter((o) => o.type === 'relationship');
  if (relationships.length === 0) return null;

  return (
    <div className="mt-4 mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-300 mb-3 flex items-center gap-2">
        Intelligence Graph — {relationships.length} relationship{relationships.length !== 1 ? 's' : ''}
      </div>
      <div className="space-y-1.5">
        {relationships.map((r) => {
          const srcName = nameMap.get(r.source_ref ?? '') ?? r.source_ref?.split('--')[0] ?? '?';
          const tgtName = nameMap.get(r.target_ref ?? '') ?? r.target_ref?.split('--')[0] ?? '?';
          const srcType = r.source_ref?.split('--')[0] ?? '';
          const tgtType = r.target_ref?.split('--')[0] ?? '';
          const srcColor = TYPE_COLORS[srcType]?.badge ?? 'border-slate-400 text-slate-600';
          const tgtColor = TYPE_COLORS[tgtType]?.badge ?? 'border-slate-400 text-slate-600';

          return (
            <div key={r.id} className="flex items-center gap-2 text-xs font-mono">
              <span className={`px-1.5 py-0.5 rounded border ${srcColor}`}>{srcName}</span>
              <span className="text-slate-400">→{r.relationship_type}→</span>
              <span className={`px-1.5 py-0.5 rounded border ${tgtColor}`}>{tgtName}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Memoize the relationship graph so toggling stakeholder filter chips or
// other parent state changes don't re-walk every relationship.
export const StixRelationshipGraph = React.memo(StixRelationshipGraphImpl);

/** Render STIX objects grouped by type with expandable details. */
function StixObjectTableImpl({ bundle }: { bundle: StixBundle }): JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const objectsByType = useMemo(() => {
    const m = new Map<string, StixObject[]>();
    for (const obj of bundle.objects) {
      const arr = m.get(obj.type) ?? [];
      arr.push(obj);
      m.set(obj.type, arr);
    }
    return m;
  }, [bundle.objects]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyBundle = () => {
    navigator.clipboard.writeText(JSON.stringify(bundle, null, 2)).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const stats = Array.from(objectsByType.entries())
    .filter(([t]) => t !== 'relationship')
    .map(([type, objs]) => ({ type, count: objs.length }));

  return (
    <div className="mt-4 mb-4 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">STIX 2.1 Objects</span>
        <span className="text-micro font-mono text-slate-500">{bundle.objects.length} total</span>
        <div className="flex gap-1.5 flex-wrap">
          {stats.map(({ type, count }) => (
            <span
              key={type}
              className={`text-micro font-mono px-1.5 py-0.5 rounded border ${TYPE_COLORS[type]?.badge ?? 'border-slate-400 text-slate-500'}`}
            >
              {count} {type.replace(/-/g, ' ')}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={copyBundle}
          className="ml-auto text-micro font-mono px-2 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 text-slate-500"
        >
          {copied ? <Check size={10} className="inline" /> : <Copy size={10} className="inline" />} Copy JSON
        </button>
      </div>

      {Array.from(objectsByType.entries())
        .filter(([t]) => t !== 'relationship')
        .map(([type, objects]) => (
          <div key={type} className="mb-3">
            <div className="text-micro font-mono font-bold uppercase tracking-wider text-slate-500 mb-1">
              {type.replace(/-/g, ' ')} ({objects.length})
            </div>
            <div className="space-y-1">
              {objects.map((obj) => (
                <div
                  key={obj.id}
                  className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggle(obj.id)}
                    className="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-50/60 dark:hover:bg-[rgb(var(--input-200)/0.4)] text-left"
                  >
                    <span
                      className={`text-micro font-mono px-1.5 py-0.5 rounded border ${TYPE_COLORS[type]?.badge ?? 'border-slate-400 text-slate-500'}`}
                    >
                      {type}
                    </span>
                    <span className="text-xs font-mono truncate flex-1">{getObjectName(obj)}</span>
                    {expanded.has(obj.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                  {expanded.has(obj.id) && (
                    <div className="px-3 pb-3 border-t border-slate-200 dark:border-[rgb(var(--border-400))] space-y-1.5 bg-slate-50/40 dark:bg-[rgb(var(--input-200)/0.4)]">
                      <div className="text-micro font-mono text-slate-500 break-all">ID: {obj.id}</div>
                      {obj.description && (
                        <div className="text-micro font-mono text-slate-700 dark:text-slate-300">{obj.description}</div>
                      )}
                      {obj.pattern && (
                        <div className="text-micro font-mono text-amber-700 dark:text-amber-300 bg-amber-500/5 p-1.5 rounded break-all">
                          {obj.pattern}
                        </div>
                      )}
                      {obj.external_references && obj.external_references.length > 0 && (
                        <div className="text-micro font-mono space-y-0.5">
                          {obj.external_references.map((ref, i) => (
                            <div key={i}>
                              {ref.url ? (
                                <a
                                  href={ref.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-brand-600 hover:underline"
                                >
                                  {ref.source_name}:{ref.external_id}
                                </a>
                              ) : (
                                <span>
                                  {ref.source_name}:{ref.external_id}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

// Memoize the object table — same reason as the relationship graph: avoid
// re-grouping hundreds of objects when the parent re-renders for unrelated
// reasons.
export const StixObjectTable = React.memo(StixObjectTableImpl);
