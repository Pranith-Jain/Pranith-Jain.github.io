import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Sparkles, Loader2, AlertTriangle, ExternalLink, Copy, Check, Trash2 } from 'lucide-react';

interface KillChainStep {
  phase: string;
  description: string;
}
interface MitreTechRef {
  id: string;
  name: string;
  rationale: string;
}
interface CampaignDoc {
  campaign_name: string;
  summary: string;
  actor_context: string;
  kill_chain: KillChainStep[];
  mitre_techniques: MitreTechRef[];
  hunting_hypotheses: string[];
  detection_opportunities: string[];
  iocs_to_pivot: string[];
  confidence: 'low' | 'medium' | 'high';
  caveats: string[];
}
interface SavedCampaign {
  id: string;
  saved_at: string;
  generated_at: string;
  model_used: string;
  input: { actor?: string; sector?: string; ttps?: string; notes?: string; iocs?: string[] };
  campaign: CampaignDoc;
}

const PHASE_LABELS: Record<string, string> = {
  recon: 'Reconnaissance',
  weaponization: 'Weaponization',
  delivery: 'Delivery',
  exploitation: 'Exploitation',
  installation: 'Installation',
  c2: 'Command & Control',
  actions: 'Actions on Objectives',
};
const PHASE_ORDER = ['recon', 'weaponization', 'delivery', 'exploitation', 'installation', 'c2', 'actions'];

const CONFIDENCE_COLOR: Record<CampaignDoc['confidence'], string> = {
  high: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  medium: 'text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-500/10',
  low: 'text-rose-600 dark:text-rose-400 border-rose-500/40 bg-rose-500/10',
};

function buildMarkdown(d: CampaignDoc, input: SavedCampaign['input'], model: string, ts: string): string {
  const lines: string[] = [];
  lines.push(`# ${d.campaign_name}`);
  lines.push('');
  lines.push(`**Confidence:** ${d.confidence}  ·  **Model:** ${model}  ·  **Generated:** ${ts}`);
  if (input.actor) lines.push(`**Actor:** ${input.actor}`);
  if (input.sector) lines.push(`**Sector:** ${input.sector}`);
  lines.push('');
  if (d.summary) {
    lines.push('## Summary');
    lines.push(d.summary);
    lines.push('');
  }
  if (d.actor_context) {
    lines.push('## Actor context');
    lines.push(d.actor_context);
    lines.push('');
  }
  if (d.kill_chain.length) {
    lines.push('## Kill chain');
    for (const k of d.kill_chain) lines.push(`- **${PHASE_LABELS[k.phase] ?? k.phase}:** ${k.description}`);
    lines.push('');
  }
  if (d.mitre_techniques.length) {
    lines.push('## MITRE ATT&CK');
    for (const m of d.mitre_techniques) lines.push(`- **${m.id} — ${m.name}** — ${m.rationale}`);
    lines.push('');
  }
  if (d.hunting_hypotheses.length) {
    lines.push('## Hunting hypotheses');
    for (const h of d.hunting_hypotheses) lines.push(`- ${h}`);
    lines.push('');
  }
  if (d.detection_opportunities.length) {
    lines.push('## Detection opportunities');
    for (const det of d.detection_opportunities) lines.push(`- ${det}`);
    lines.push('');
  }
  if (input.iocs && input.iocs.length) {
    lines.push('## Attached IOCs');
    for (const i of input.iocs) lines.push(`- ${i}`);
    lines.push('');
  }
  if (d.iocs_to_pivot.length) {
    lines.push('## IOCs to pivot on');
    for (const i of d.iocs_to_pivot) lines.push(`- ${i}`);
    lines.push('');
  }
  if (d.caveats.length) {
    lines.push('## Caveats');
    for (const c of d.caveats) lines.push(`- ${c}`);
  }
  return lines.join('\n');
}

export default function CampaignDetail(): JSX.Element {
  const { id = '' } = useParams<{ id: string }>();
  const [data, setData] = useState<SavedCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/v1/campaigns/${id}`)
      .then(async (r) => {
        const body = (await r.json()) as SavedCampaign | { error: string };
        if (cancelled) return;
        if (!r.ok || 'error' in body) {
          setError('error' in body ? body.error : `HTTP ${r.status}`);
        } else {
          setData(body);
        }
      })
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleDelete = async () => {
    if (!window.confirm('Delete this campaign? This cannot be undone.')) return;
    try {
      const r = await fetch(`/api/v1/campaigns/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setDeleted(true);
    } catch (e) {
      window.alert(`Delete failed: ${(e as Error).message}`);
    }
  };

  const copyMarkdown = async () => {
    if (!data) return;
    try {
      const md = buildMarkdown(data.campaign, data.input, data.model_used, data.generated_at);
      await navigator.clipboard.writeText(md);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  if (deleted) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-20 text-slate-900 dark:text-slate-100 text-center">
        <Trash2 size={28} className="mx-auto text-slate-400 mb-2" />
        <p className="text-sm font-mono text-slate-500 mb-3">Campaign deleted.</p>
        <Link
          to="/threatintel/campaigns"
          className="text-sm font-mono text-brand-600 dark:text-brand-400 hover:underline"
        >
          ← back to campaigns
        </Link>
      </div>
    );
  }

  const orderedKillChain = data
    ? [...data.campaign.kill_chain].sort((a, b) => PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase))
    : [];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel/campaigns"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back to campaigns
      </Link>

      {loading && (
        <div className="text-sm font-mono text-slate-500 inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Loading campaign…
        </div>
      )}

      {error && (
        <div className="rounded border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950 p-3 text-xs font-mono text-rose-700 dark:text-rose-300 inline-flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {data && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 animate-fade-in-up">
          <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-display font-bold mb-1 flex items-center gap-2">
                <Sparkles size={22} className="text-brand-600 dark:text-brand-400" />
                {data.campaign.campaign_name}
              </h1>
              <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono">
                <span className={`px-1.5 py-0.5 rounded border ${CONFIDENCE_COLOR[data.campaign.confidence]}`}>
                  confidence: {data.campaign.confidence}
                </span>
                <span className="text-slate-500">model: {data.model_used}</span>
                <span className="text-slate-500">saved: {new Date(data.saved_at).toLocaleString()}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void copyMarkdown()}
                className="inline-flex items-center gap-1.5 rounded border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-[11px] font-mono text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:border-brand-500/40"
              >
                {copied ? (
                  <>
                    <Check size={11} /> copied
                  </>
                ) : (
                  <>
                    <Copy size={11} /> copy as markdown
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="inline-flex items-center gap-1.5 rounded border border-rose-300 dark:border-rose-700 px-2.5 py-1 text-[11px] font-mono text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950"
              >
                <Trash2 size={11} /> delete
              </button>
            </div>
          </div>

          {(data.input.actor || data.input.sector) && (
            <div className="flex flex-wrap gap-2 mb-4 text-[11px] font-mono">
              {data.input.actor && (
                <span className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-0.5 text-slate-700 dark:text-slate-300">
                  actor: {data.input.actor}
                </span>
              )}
              {data.input.sector && (
                <span className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-0.5 text-slate-700 dark:text-slate-300">
                  sector: {data.input.sector}
                </span>
              )}
            </div>
          )}

          {data.campaign.summary && (
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-4">{data.campaign.summary}</p>
          )}

          {data.campaign.actor_context && (
            <div className="mb-5">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-1.5">Actor context</h3>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {data.campaign.actor_context}
              </p>
            </div>
          )}

          {orderedKillChain.length > 0 && (
            <div className="mb-5">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">Kill chain</h3>
              <ol className="space-y-2">
                {orderedKillChain.map((k, i) => (
                  <li
                    key={`${k.phase}-${i}`}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3"
                  >
                    <div className="text-[10px] font-mono uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-0.5">
                      {PHASE_LABELS[k.phase] ?? k.phase}
                    </div>
                    <div className="text-sm text-slate-700 dark:text-slate-300">{k.description}</div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {data.campaign.mitre_techniques.length > 0 && (
            <div className="mb-5">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">MITRE ATT&amp;CK</h3>
              <ul className="space-y-1.5">
                {data.campaign.mitre_techniques.map((m) => (
                  <li
                    key={m.id}
                    className="text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5"
                  >
                    <a
                      href={`https://attack.mitre.org/techniques/${m.id.replace('.', '/')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono font-semibold text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
                    >
                      {m.id} <ExternalLink size={9} />
                    </a>{' '}
                    <span className="font-semibold text-slate-800 dark:text-slate-200">— {m.name}</span>
                    <div className="text-[11px] font-mono text-slate-500 mt-0.5">{m.rationale}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.input.iocs && data.input.iocs.length > 0 && (
            <div className="mb-5">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">
                Attached IOCs ({data.input.iocs.length})
              </h3>
              <ul className="space-y-1">
                {data.input.iocs.map((ioc) => (
                  <li
                    key={ioc}
                    className="flex items-center gap-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2 text-sm font-mono"
                  >
                    <span className="flex-1 truncate text-slate-700 dark:text-slate-300" title={ioc}>
                      {ioc}
                    </span>
                    <Link
                      to={`/dfir/ioc-check?indicator=${encodeURIComponent(ioc)}`}
                      className="text-[10px] text-brand-600 dark:text-brand-400 hover:underline shrink-0"
                    >
                      pivot →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.campaign.hunting_hypotheses.length > 0 && (
            <div className="mb-5">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">Hunting hypotheses</h3>
              <ul className="space-y-1.5 list-disc list-inside text-sm text-slate-700 dark:text-slate-300">
                {data.campaign.hunting_hypotheses.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          )}

          {data.campaign.detection_opportunities.length > 0 && (
            <div className="mb-5">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">
                Detection opportunities
              </h3>
              <ul className="space-y-1.5">
                {data.campaign.detection_opportunities.map((d) => (
                  <li
                    key={d}
                    className="text-sm font-mono rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5 text-slate-700 dark:text-slate-300"
                  >
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.campaign.iocs_to_pivot.length > 0 && (
            <div className="mb-5">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">IOCs to pivot on</h3>
              <ul className="space-y-1">
                {data.campaign.iocs_to_pivot.map((i, idx) => (
                  <li
                    key={idx}
                    className="text-sm rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2 text-slate-700 dark:text-slate-300"
                  >
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.campaign.caveats.length > 0 && (
            <div className="rounded border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/40 p-3">
              <h3 className="text-xs font-mono uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2 inline-flex items-center gap-1">
                <AlertTriangle size={11} /> Caveats
              </h3>
              <ul className="space-y-1 list-disc list-inside text-xs font-mono text-amber-900 dark:text-amber-200">
                {data.campaign.caveats.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
