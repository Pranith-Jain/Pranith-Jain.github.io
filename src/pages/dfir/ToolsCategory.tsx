import { Link, useParams, Navigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ToolGrid } from '../../components/dfir/ToolGrid';
import { GROUP_META, type ToolGroup } from '../../components/dfir/tool-sections';

const VALID: ToolGroup[] = ['dfir', 'osint', 'aisec', 'datasec', 'grc'];

/**
 * Dedicated, less-overwhelming per-group tool page. Reuses the exact
 * ToolGrid card design (no visual change) — just a single group's
 * sections instead of the full ~50-tool index at /dfir.
 */
export default function ToolsCategory(): JSX.Element {
  const { group } = useParams<{ group: string }>();
  if (!group || !VALID.includes(group as ToolGroup)) {
    return <Navigate to="/dfir" replace />;
  }
  const g = group as ToolGroup;
  const meta = GROUP_META[g];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> all tools
      </Link>

      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100">{meta.label}</h1>
        <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mt-1">{meta.blurb}</p>
      </div>

      {/* Sibling category quick-nav — keeps the new dedicated pages discoverable */}
      <div className="flex flex-wrap items-center gap-2 mb-8 text-[11px] font-mono">
        <span className="text-slate-500">categories:</span>
        {VALID.map((v) => (
          <Link
            key={v}
            to={`/dfir/tools/${v}`}
            className={`px-3 py-1.5 rounded border ${
              v === g
                ? 'border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:border-brand-500/40'
            }`}
          >
            {GROUP_META[v].label}
          </Link>
        ))}
      </div>

      <section className="animate-fade-in-up mb-16">
        <ToolGrid group={g} />
      </section>
    </div>
  );
}
