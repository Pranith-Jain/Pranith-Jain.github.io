import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DataPageLayout } from '../../components/DataPageLayout';
import {
  Sparkles,
  Loader2,
  AlertTriangle,
  Target,
  Wand2,
  Copy,
  Check,
  ExternalLink,
  Save,
  FolderOpen,
} from 'lucide-react';
import { adminAuthHeaders } from '../../lib/admin-token';

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
interface CampaignResponse {
  campaign: CampaignDoc;
  model_used: string;
  generated_at: string;
}
interface CampaignError {
  error: string;
  detail?: string;
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

const SAMPLES: Array<{
  label: string;
  actor: string;
  sector: string;
  ttps: string;
  iocs: string;
  notes: string;
}> = [
  {
    label: 'Mid-market ransomware (LockBit-style)',
    actor: 'Suspected LockBit affiliate',
    sector: 'Manufacturing, North America',
    ttps: 'Initial access via Citrix NetScaler exploit (CVE-2023-4966 session hijack), Cobalt Strike beacon, Mimikatz on DC, scheduled task persistence, exfil via rclone to Mega.nz, then LockBit 3.0 deployment via GPO.',
    iocs: '185.220.101.45\n185.220.101.46\nlockbit3-payload.exe\nrclone.exe\n9cf5b1d6e0d57a0b1c0c8c8c8c8c8c8c',
    notes: 'Backups offline within 30 minutes of beacon — suggests credentialed access to ESXi.',
  },
  {
    label: 'Phishing → infostealer → ULP sale',
    actor: 'Unattributed initial-access broker',
    sector: 'SaaS / B2B, EU',
    ttps: 'Bing-ad malvertising for MFA-bypass tooling, drops Lumma stealer via signed MSI, harvests browser creds, RDP creds, and SSO session cookies, then lists on a Telegram ULP shop within 24h.',
    iocs: 'lumma-c2.cyou\nlmma-api.online\n91.92.244.10\nbright-mfa-fix.com',
    notes: 'Telegram channel timestamp of victim listing matches stealer beacon time-of-day — likely automated.',
  },
];

function buildMarkdown(d: CampaignDoc, model: string, ts: string): string {
  const lines: string[] = [];
  lines.push(`# ${d.campaign_name}`);
  lines.push('');
  lines.push(`**Confidence:** ${d.confidence}  ·  **Model:** ${model}  ·  **Generated:** ${ts}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(d.summary);
  if (d.actor_context) {
    lines.push('');
    lines.push('## Actor context');
    lines.push(d.actor_context);
  }
  if (d.kill_chain.length > 0) {
    lines.push('');
    lines.push('## Kill chain');
    for (const k of d.kill_chain) {
      lines.push(`- **${PHASE_LABELS[k.phase] ?? k.phase}:** ${k.description}`);
    }
  }
  if (d.mitre_techniques.length > 0) {
    lines.push('');
    lines.push('## MITRE ATT&CK');
    for (const m of d.mitre_techniques) {
      lines.push(`- **${m.id} — ${m.name}** — ${m.rationale}`);
    }
  }
  if (d.hunting_hypotheses.length > 0) {
    lines.push('');
    lines.push('## Hunting hypotheses');
    for (const h of d.hunting_hypotheses) lines.push(`- ${h}`);
  }
  if (d.detection_opportunities.length > 0) {
    lines.push('');
    lines.push('## Detection opportunities');
    for (const det of d.detection_opportunities) lines.push(`- ${det}`);
  }
  if (d.iocs_to_pivot.length > 0) {
    lines.push('');
    lines.push('## IOCs to pivot on');
    for (const i of d.iocs_to_pivot) lines.push(`- ${i}`);
  }
  if (d.caveats.length > 0) {
    lines.push('');
    lines.push('## Caveats');
    for (const c of d.caveats) lines.push(`- ${c}`);
  }
  return lines.join('\n');
}

export default function CampaignGenerator(): JSX.Element {
  const [actor, setActor] = useState('');
  const [sector, setSector] = useState('');
  const [ttps, setTtps] = useState('');
  const [iocs, setIocs] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CampaignResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const navigate = useNavigate();

  const iocList = useMemo(
    () =>
      iocs
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    [iocs]
  );

  const totalLen = actor.length + sector.length + ttps.length + iocs.length + notes.length;
  const tooLong = totalLen > 8_000;
  const empty = totalLen === 0;

  // LLM calls can take 20–30s on cold colos; a 60s timeout absorbs
  // tail latency without hanging the page forever on a stuck upstream.
  const GENERATE_TIMEOUT_MS = 60_000;

  const generate = async () => {
    if (empty || tooLong) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch('/api/v1/campaign-generator', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          input: {
            actor: actor.trim() || undefined,
            sector: sector.trim() || undefined,
            ttps: ttps.trim() || undefined,
            notes: notes.trim() || undefined,
            iocs: iocList,
          },
        }),
        signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
      });
      const data = (await r.json().catch(() => null)) as CampaignResponse | CampaignError | null;
      if (!r.ok || !data || 'error' in data) {
        // User-friendly translation for the common error modes. Raw
        // upstream messages ("model returned no parseable JSON",
        // "rate_limited", "AI rate limited — try again in a few
        // minutes") are confusing in an analyst UI; surface a clean
        // explanation + the technical detail as a one-liner.
        let msg: string;
        if (r.status === 429) {
          msg = 'Rate-limited. Generation is capped per minute to keep the LLM bill bounded — wait ~30s and try again.';
        } else if (r.status === 502) {
          msg =
            'The LLM returned an unparseable response. Re-running usually succeeds; the model can occasionally emit text outside the JSON schema.';
        } else if (data && 'error' in data) {
          msg = data.error + (data.detail ? ` — ${data.detail}` : '');
        } else {
          msg = `HTTP ${r.status}`;
        }
        setError(msg);
      } else {
        setResult(data);
      }
    } catch (e) {
      const err = e as Error;
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        setError(
          `The LLM took longer than ${GENERATE_TIMEOUT_MS / 1000}s to respond. Try again — the call usually succeeds on a warm colo.`
        );
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadSample = (s: (typeof SAMPLES)[number]) => {
    setActor(s.actor);
    setSector(s.sector);
    setTtps(s.ttps);
    setIocs(s.iocs);
    setNotes(s.notes);
    setResult(null);
    setError(null);
  };

  const copyMarkdown = async () => {
    if (!result) return;
    try {
      const md = buildMarkdown(result.campaign, result.model_used, result.generated_at);
      await navigator.clipboard.writeText(md);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — silent; user can still read the page */
    }
  };

  const saveCampaign = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const r = await fetch('/api/v1/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify({
          campaign: result.campaign,
          input: {
            actor: actor.trim() || undefined,
            sector: sector.trim() || undefined,
            ttps: ttps.trim() || undefined,
            notes: notes.trim() || undefined,
            iocs: iocList,
          },
          generated_at: result.generated_at,
          model_used: result.model_used,
        }),
      });
      const data = (await r.json()) as { id?: string; error?: string };
      if (!r.ok || !data.id) {
        setError(data.error ?? `Save failed: HTTP ${r.status}`);
      } else {
        setSavedId(data.id);
        // Jump to the saved view so the analyst lands on the canonical record.
        navigate(`/threatintel/campaigns/${data.id}`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const orderedKillChain = result
    ? [...result.campaign.kill_chain].sort((a, b) => PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase))
    : [];

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Sparkles size={28} />}
      title="Campaign Generator"
      headerExtra={
        <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/30">
          AI
        </span>
      }
      description={
        <span className="font-mono">
          Turn an analyst brief — actor, sector, observed TTPs, IOCs — into a structured campaign hypothesis with
          kill-chain mapping, MITRE techniques, hunting hypotheses, and detection ideas. The model is constrained to
          your inputs and explicitly flags confidence + caveats. Not an attribution engine — a draft to pressure-test.
        </span>
      }
      maxWidthClass="max-w-5xl"
    >
      <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-5 mb-6">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <h2 className="text-sm font-display font-semibold inline-flex items-center gap-2">
            <Target size={14} className="text-brand-600 dark:text-brand-400" /> Analyst brief
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-micro font-mono uppercase tracking-wider text-slate-500">samples:</span>
            {SAMPLES.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => loadSample(s)}
                className="text-mini font-mono rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-0.5 text-muted hover:text-brand-600 dark:hover:text-brand-400 hover:border-brand-500/40"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label
              htmlFor="cg-actor"
              className="block text-xs font-mono uppercase tracking-wider text-slate-500 mb-1.5"
            >
              Suspected actor
            </label>
            <input
              id="cg-actor"
              type="text"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              placeholder="e.g. Suspected LockBit affiliate"
              className="w-full rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="cg-sector"
              className="block text-xs font-mono uppercase tracking-wider text-slate-500 mb-1.5"
            >
              Targeted sector / region
            </label>
            <input
              id="cg-sector"
              type="text"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              placeholder="e.g. Manufacturing, North America"
              className="w-full rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="cg-ttps" className="block text-xs font-mono uppercase tracking-wider text-slate-500 mb-1.5">
            Observed TTPs / behaviour
          </label>
          <textarea
            id="cg-ttps"
            value={ttps}
            onChange={(e) => setTtps(e.target.value)}
            placeholder="Free-form description of what was seen — entry vector, lateral movement, persistence, exfil, etc."
            rows={5}
            className="w-full rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="cg-iocs" className="block text-xs font-mono uppercase tracking-wider text-slate-500 mb-1.5">
              IOCs (one per line)
            </label>
            <textarea
              id="cg-iocs"
              value={iocs}
              onChange={(e) => setIocs(e.target.value)}
              placeholder="185.220.101.45&#10;c2.bad-domain.com&#10;9cf5b1…"
              rows={5}
              className="w-full rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none"
            />
            <div className="text-micro font-mono text-slate-400 mt-1">{iocList.length} parsed · max 30</div>
          </div>
          <div>
            <label
              htmlFor="cg-notes"
              className="block text-xs font-mono uppercase tracking-wider text-slate-500 mb-1.5"
            >
              Notes / context
            </label>
            <textarea
              id="cg-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything else — timeline anomalies, relationships, the gut-feel angle."
              rows={5}
              className="w-full rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
          <div className="text-micro font-mono text-slate-400">
            {totalLen}/8000 chars {tooLong && <span className="text-rose-500 font-bold">— too long</span>}
          </div>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={empty || tooLong || loading}
            className="inline-flex items-center justify-center gap-1.5 rounded bg-brand-600 px-4 py-2 text-xs font-mono font-semibold text-white hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 size={12} className="animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Wand2 size={12} /> Generate campaign
              </>
            )}
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950 p-3 text-xs font-mono text-rose-700 dark:text-rose-300 mb-4 inline-flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {result && (
        <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-6 mb-6 animate-fade-in-up">
          <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
            <div>
              <h2 className="text-2xl font-display font-bold mb-1">{result.campaign.campaign_name}</h2>
              <div className="flex items-center gap-2 flex-wrap text-micro font-mono">
                <span className={`px-1.5 py-0.5 rounded border ${CONFIDENCE_COLOR[result.campaign.confidence]}`}>
                  confidence: {result.campaign.confidence}
                </span>
                <span className="text-slate-500">model: {result.model_used}</span>
                <span className="text-slate-500">generated: {new Date(result.generated_at).toLocaleString()}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => void copyMarkdown()}
                className="inline-flex items-center gap-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2.5 py-1 text-mini font-mono text-muted hover:text-brand-600 dark:hover:text-brand-400 hover:border-brand-500/40"
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
              {savedId ? (
                <Link
                  to={`/threatintel/campaigns/${savedId}`}
                  className="inline-flex items-center gap-1.5 rounded border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950 px-2.5 py-1 text-mini font-mono text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900"
                >
                  <Check size={11} /> saved · open
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => void saveCampaign()}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded bg-brand-600 px-2.5 py-1 text-mini font-mono font-semibold text-white hover:bg-brand-500 disabled:opacity-40"
                >
                  {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                  {saving ? 'saving' : 'save campaign'}
                </button>
              )}
              <Link
                to="/threatintel/catalog?cat=campaigns"
                className="inline-flex items-center gap-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2.5 py-1 text-mini font-mono text-muted hover:text-brand-600 dark:hover:text-brand-400 hover:border-brand-500/40"
                title="Browse saved campaigns"
              >
                <FolderOpen size={11} /> browse
              </Link>
            </div>
          </div>

          {result.campaign.summary && (
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-4">{result.campaign.summary}</p>
          )}

          {result.campaign.actor_context && (
            <div className="mb-5">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-1.5">Actor context</h3>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {result.campaign.actor_context}
              </p>
            </div>
          )}

          {orderedKillChain.length > 0 && (
            <div className="mb-5">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">Kill chain</h3>
              <ol className="space-y-2">
                {orderedKillChain.map((k) => (
                  <li
                    key={k.phase}
                    className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3"
                  >
                    <div className="text-micro font-mono uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-0.5">
                      {PHASE_LABELS[k.phase] ?? k.phase}
                    </div>
                    <div className="text-sm text-slate-700 dark:text-slate-300">{k.description}</div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {result.campaign.mitre_techniques.length > 0 && (
            <div className="mb-5">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">MITRE ATT&amp;CK</h3>
              <ul className="space-y-1.5">
                {result.campaign.mitre_techniques.map((m) => (
                  <li
                    key={m.id}
                    className="text-sm rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-2.5"
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
                    <div className="text-mini font-mono text-slate-500 mt-0.5">{m.rationale}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.campaign.hunting_hypotheses.length > 0 && (
            <div className="mb-5">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">Hunting hypotheses</h3>
              <ul className="space-y-1.5 list-disc list-inside text-sm text-slate-700 dark:text-slate-300">
                {result.campaign.hunting_hypotheses.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          )}

          {result.campaign.detection_opportunities.length > 0 && (
            <div className="mb-5">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">
                Detection opportunities
              </h3>
              <ul className="space-y-1.5">
                {result.campaign.detection_opportunities.map((d) => (
                  <li
                    key={d}
                    className="text-sm font-mono rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-2.5 text-slate-700 dark:text-slate-300"
                  >
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.campaign.iocs_to_pivot.length > 0 && (
            <div className="mb-5">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">IOCs to pivot on</h3>
              <ul className="space-y-1">
                {result.campaign.iocs_to_pivot.map((ioc) => {
                  const fragment = ioc.split(/[\s—:-]/)[0] ?? ioc;
                  return (
                    <li
                      key={ioc}
                      className="text-sm flex items-start gap-2 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-2"
                    >
                      <span className="flex-1 text-slate-700 dark:text-slate-300">{ioc}</span>
                      <Link
                        to={`/dfir/ioc-check?indicator=${encodeURIComponent(fragment)}`}
                        className="text-micro font-mono text-brand-600 dark:text-brand-400 hover:underline shrink-0"
                      >
                        pivot →
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {result.campaign.caveats.length > 0 && (
            <div className="rounded border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/40 p-3">
              <h3 className="text-xs font-mono uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2 inline-flex items-center gap-1">
                <AlertTriangle size={11} /> Caveats
              </h3>
              <ul className="space-y-1 list-disc list-inside text-xs font-mono text-amber-900 dark:text-amber-200">
                {result.campaign.caveats.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </DataPageLayout>
  );
}
