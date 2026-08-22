/**
 * ShareReportView — public branded report renderer (Fleet-parity
 * "Branded Reports" / "Artifact Sharing").
 *
 * Reached via capability-token links (/share/report/:token). No auth — the
 * unguessable token IS the credential. Renders the saved investigation with
 * MSSP branding: org identity, classification banner, accent color, footer.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldAlert, Bug, Crosshair, FileWarning, Building2, Clock, ExternalLink, Lock } from 'lucide-react';

interface Branding {
  orgName?: string;
  logoUrl?: string;
  accent?: string;
  footer?: string;
  classification?: string;
}

interface SharedPayload {
  title: string;
  source_url?: string | null;
  report: {
    summary?: string;
    iocs?: {
      ipv4?: string[];
      ipv6?: string[];
      domains?: string[];
      urls?: string[];
      hashes?: { md5?: string[]; sha1?: string[]; sha256?: string[] };
    };
    threat_actors?: Array<{ name: string; confidence?: string; context?: string }>;
    malware?: Array<{ name: string; confidence?: string; context?: string }>;
    mitre_techniques?: Array<{ id: string; name?: string; context?: string }>;
    cves?: Array<{ id: string; context?: string }>;
    sectors?: string[];
    affected_products?: Array<{ vendor?: string; product: string }>;
  } | null;
  branding: Branding | null;
  counts: { iocs: number; ttps: number; cves: number; textLength: number };
  created_at?: string;
  shared_at?: string;
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  'TLP:CLEAR': 'bg-emerald-600',
  'TLP:GREEN': 'bg-emerald-700',
  'TLP:AMBER': 'bg-amber-500 text-black',
  'TLP:RED': 'bg-rose-600',
};

function Chip({ children, tone = 'slate' }: { children: React.ReactNode; tone?: string }): JSX.Element {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
    red: 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300',
    amber: 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
    violet: 'bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300',
    sky: 'bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300',
  };
  return (
    <span className={`inline-block rounded px-2 py-0.5 font-mono text-xs ${tones[tone] ?? tones.slate}`}>
      {children}
    </span>
  );
}

function IocSection({ label, values, tone }: { label: string; values?: string[]; tone?: string }): JSX.Element | null {
  if (!values || values.length === 0) return null;
  return (
    <div>
      <h4 className="mb-1.5 text-xs font-mono font-semibold uppercase tracking-wider text-slate-500">
        {label} <span className="text-slate-400">({values.length})</span>
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {values.slice(0, 60).map((v) => (
          <Chip key={v} tone={tone}>
            {v}
          </Chip>
        ))}
      </div>
    </div>
  );
}

export default function ShareReportView(): JSX.Element {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/v1/public/report/${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok)
          throw new Error(r.status === 404 ? 'This share link is invalid or has been revoked.' : `HTTP ${r.status}`);
        return r.json() as Promise<SharedPayload>;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p className="animate-pulse font-mono text-sm text-slate-500">loading shared report…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-[rgb(var(--surface-100))]">
          <Lock className="mx-auto mb-3 text-slate-400" size={28} />
          <h1 className="mb-2 text-lg font-semibold">Report unavailable</h1>
          <p className="text-sm text-slate-500">{error || 'Unknown error'}</p>
        </div>
      </div>
    );
  }

  const b = data.branding ?? {};
  const accent = /^#[0-9a-fA-F]{6}$/.test(b.accent ?? '') ? (b.accent as string) : '#4f46e5';
  const r = data.report;
  const cls = b.classification?.toUpperCase().replace(/\s/g, '') ?? '';
  const clsColor =
    Object.entries(CLASSIFICATION_COLORS).find(([k]) => cls.startsWith(k.replace('TLP:', '')))?.[1] ??
    (cls ? 'bg-slate-600' : '');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Classification banner */}
      {b.classification && (
        <div className={`${clsColor} py-1 text-center font-mono text-xs font-bold uppercase tracking-widest`}>
          {b.classification}
        </div>
      )}

      {/* Branded header */}
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-[rgb(var(--surface-100))]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            {b.logoUrl && /^https:\/\//.test(b.logoUrl) && (
              <img src={b.logoUrl} alt="" className="h-9 w-9 rounded object-contain" referrerPolicy="no-referrer" />
            )}
            <div>
              {b.orgName && (
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <Building2 size={14} style={{ color: accent }} /> {b.orgName}
                </div>
              )}
              <div className="text-xs text-slate-500">Threat Investigation Report</div>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
            <Clock size={12} />
            {data.created_at ? new Date(data.created_at).toISOString().slice(0, 10) : ''}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        {/* Title + counts */}
        <section>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ borderLeft: `4px solid ${accent}`, paddingLeft: '0.75rem' }}
          >
            {data.title}
          </h1>
          {data.source_url && (
            <a
              href={data.source_url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-flex items-center gap-1 break-all text-xs text-slate-500 hover:underline"
            >
              <ExternalLink size={11} /> {data.source_url}
            </a>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip tone="red">{data.counts.iocs} IOCs</Chip>
            <Chip tone="violet">{data.counts.ttps} TTPs</Chip>
            <Chip tone="amber">{data.counts.cves} CVEs</Chip>
            {data.counts.textLength > 0 && <Chip>{Math.round(data.counts.textLength / 1000)}k chars analyzed</Chip>}
          </div>
        </section>

        {/* Executive summary */}
        {r?.summary && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[rgb(var(--surface-100))]">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500">
              <FileWarning size={15} style={{ color: accent }} /> Executive Summary
            </h2>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{r.summary}</p>
          </section>
        )}

        {/* Actors + malware */}
        {r?.threat_actors?.length || r?.malware?.length ? (
          <section className="grid gap-4 md:grid-cols-2">
            {r.threat_actors && r.threat_actors.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[rgb(var(--surface-100))]">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500">
                  <ShieldAlert size={15} style={{ color: accent }} /> Threat Actors
                </h2>
                <ul className="space-y-2">
                  {r.threat_actors.map((a) => (
                    <li key={a.name}>
                      <span className="font-medium">{a.name}</span>{' '}
                      {a.confidence && (
                        <Chip tone={a.confidence === 'high' ? 'red' : a.confidence === 'medium' ? 'amber' : 'slate'}>
                          {a.confidence}
                        </Chip>
                      )}
                      {a.context && <p className="text-xs text-slate-500">{a.context}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {r.malware && r.malware.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[rgb(var(--surface-100))]">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500">
                  <Bug size={15} style={{ color: accent }} /> Malware
                </h2>
                <ul className="space-y-2">
                  {r.malware.map((m) => (
                    <li key={m.name}>
                      <span className="font-medium">{m.name}</span>{' '}
                      {m.confidence && <Chip tone={m.confidence === 'high' ? 'red' : 'amber'}>{m.confidence}</Chip>}
                      {m.context && <p className="text-xs text-slate-500">{m.context}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ) : null}

        {/* MITRE techniques */}
        {r?.mitre_techniques && r.mitre_techniques.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[rgb(var(--surface-100))]">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500">
              <Crosshair size={15} style={{ color: accent }} /> MITRE ATT&CK Techniques
            </h2>
            <ul className="space-y-1.5">
              {r.mitre_techniques.map((t) => (
                <li key={t.id} className="font-mono text-sm">
                  <span className="text-indigo-500">{t.id}</span> {t.name ?? ''}
                  {t.context && <span className="ml-2 text-xs text-slate-500">— {t.context.slice(0, 120)}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* CVEs */}
        {r?.cves && r.cves.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[rgb(var(--surface-100))]">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">CVEs</h2>
            <div className="flex flex-wrap gap-1.5">
              {r.cves.map((c) => (
                <Chip key={c.id} tone="amber">
                  {c.id}
                </Chip>
              ))}
            </div>
          </section>
        )}

        {/* IOC block */}
        {r?.iocs && (
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[rgb(var(--surface-100))]">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Indicators of Compromise</h2>
            <IocSection label="IPv4" values={r.iocs.ipv4} />
            <IocSection label="IPv6" values={r.iocs.ipv6} />
            <IocSection label="Domains" values={r.iocs.domains} tone="sky" />
            <IocSection label="URLs" values={r.iocs.urls} tone="sky" />
            {r.iocs.hashes && (
              <>
                <IocSection label="SHA-256" values={r.iocs.hashes.sha256} tone="red" />
                <IocSection label="SHA-1" values={r.iocs.hashes.sha1} />
                <IocSection label="MD5" values={r.iocs.hashes.md5} />
              </>
            )}
          </section>
        )}

        {/* Sectors + products */}
        {((r?.sectors?.length ?? 0) > 0 || (r?.affected_products?.length ?? 0) > 0) && (
          <section className="grid gap-4 md:grid-cols-2">
            {(r?.sectors?.length ?? 0) > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[rgb(var(--surface-100))]">
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500">Targeted Sectors</h2>
                <div className="flex flex-wrap gap-1.5">
                  {(r?.sectors ?? []).map((s) => (
                    <Chip key={s}>{s}</Chip>
                  ))}
                </div>
              </div>
            )}
            {(r?.affected_products?.length ?? 0) > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[rgb(var(--surface-100))]">
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500">Affected Products</h2>
                <div className="flex flex-wrap gap-1.5">
                  {(r?.affected_products ?? []).map((p, i) => (
                    <Chip key={i}>{[p.vendor, p.product].filter(Boolean).join(' ')}</Chip>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Footer */}
        <footer className="border-t border-slate-200 pt-4 text-center text-xs text-slate-400 dark:border-slate-800">
          {b.footer || 'Shared via capability link — do not redistribute without authorization.'}
        </footer>
      </main>
    </div>
  );
}
