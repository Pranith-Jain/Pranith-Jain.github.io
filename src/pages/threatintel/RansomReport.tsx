import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileDown, Loader2, Search, ShieldAlert } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { ClusterTabs, RANSOMWARE_TABS } from '../../components/threatintel/ClusterTabs';
import { sanitizeUrl } from '../../lib/sanitize-url';
import { SEVERITY_TONE, type Severity } from '../../components/severity';

/**
 * Ransomware Intel Report — a per-threat-group CTI report assembled from the
 * ransomware.live PRO API (reused via the /api/v1/rl proxy). Mirrors the
 * RansomCTI tool's report (Overview, MITRE TTPs, Tools, Exploited CVEs,
 * infrastructure/IOCs, YARA) but renders in-app with a print-to-PDF export
 * instead of an Excel workbook.
 */

interface Technique {
  technique_id?: string;
  technique_name?: string;
  technique_details?: string;
}
interface Ttp {
  tactic_id?: string;
  tactic_name?: string;
  techniques?: Technique[];
}
interface Vuln {
  Vendor?: string;
  Product?: string;
  CVE?: string;
  CVSS?: number;
  severity?: string;
}
interface RlLocation {
  fqdn?: string;
  title?: string;
  slug?: string;
  type?: string;
}
interface RlVictim {
  victim?: string;
  group?: string;
  country?: string;
  activity?: string;
  discovered?: string;
  attackdate?: string;
}
interface GroupProfile {
  group?: string;
  description?: string;
  added_date?: string;
  victims?: number;
  firstseen?: string;
  lastseen?: string;
  ttps?: Ttp[];
  vulnerabilities?: Vuln[];
  tools?: Record<string, string[]>;
  locations?: RlLocation[];
  has_negotiations?: boolean;
  negotiation_count?: number;
  has_ransomnote?: boolean;
  ransomnotes_count?: number;
  url?: string;
}
interface RlEnvelope<T> {
  resource: string;
  arg: string | null;
  fetched_at: string;
  data: T;
}
interface GroupListItem {
  group: string;
  altname?: string | null;
  victims?: number;
}

function normSeverity(raw?: string): Severity {
  const s = (raw ?? '').toLowerCase().trim();
  if (s === 'critical' || s === 'high' || s === 'medium' || s === 'low' || s === 'info') return s;
  if (s === 'informational') return 'info';
  return 'low'; // none / unknown / unrated → neutral
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="mb-6 break-inside-avoid">
      <h2 className="text-xs font-mono uppercase tracking-wider text-brand-600 dark:text-brand-400 border-b border-slate-200 dark:border-[rgb(var(--border-400))] pb-1.5 mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function RansomReport(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [groups, setGroups] = useState<GroupListItem[]>([]);
  const [selected, setSelected] = useState(searchParams.get('group') ?? '');
  const [input, setInput] = useState(searchParams.get('group') ?? '');
  const [profile, setProfile] = useState<GroupProfile | null>(null);
  const [yaraCount, setYaraCount] = useState<number | null>(null);
  const [yaraText, setYaraText] = useState<string | null>(null);
  const [victims, setVictims] = useState<RlVictim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  // Group list for the picker (347 groups) — cached upstream 6h.
  useEffect(() => {
    fetch('/api/v1/rl/groups')
      .then((r) => (r.ok ? (r.json() as Promise<RlEnvelope<{ groups?: GroupListItem[] }>>) : null))
      .then((d) => setGroups(d?.data.groups ?? []))
      .catch(() => setGroups([]));
  }, []);

  useEffect(() => {
    const g = selected.trim().toLowerCase();
    if (!g) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotConfigured(false);
    setProfile(null);
    setYaraCount(null);
    setYaraText(null);
    setPdfError(null);
    setVictims([]);

    const profileReq = fetch(`/api/v1/rl/group/${encodeURIComponent(g)}`).then(async (r) => {
      if (r.status === 503) {
        throw new Error('__not_configured__');
      }
      if (!r.ok) throw new Error(`Couldn't load group profile (HTTP ${r.status}).`);
      return (await r.json()) as RlEnvelope<GroupProfile>;
    });

    // YARA is best-effort — a missing ruleset shouldn't fail the report.
    const yaraReq = fetch(`/api/v1/rl/yara/${encodeURIComponent(g)}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

    // Recent victims: groupvictims/searchvictims return null on this key, so
    // pull the recent-100 feed and filter to this group. Best-effort.
    const victimsReq = fetch('/api/v1/rl/victims-recent')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

    Promise.all([profileReq, yaraReq, victimsReq])
      .then(([p, y, vr]) => {
        if (cancelled) return;
        setProfile(p.data);
        const yd = (y as RlEnvelope<unknown> | null)?.data;
        if (Array.isArray(yd)) setYaraCount(yd.length);
        else if (typeof yd === 'string') {
          setYaraText(yd);
          setYaraCount(yd ? (yd.match(/^\s*rule\s/gim)?.length ?? null) : 0);
        } else if (yd && typeof yd === 'object') {
          const rules = (yd as { rules?: unknown }).rules;
          if (Array.isArray(rules)) setYaraCount(rules.length);
        }
        const allVictims = (vr as RlEnvelope<{ victims?: RlVictim[] }> | null)?.data?.victims ?? [];
        setVictims(allVictims.filter((v) => (v.group ?? '').toLowerCase() === g));
      })
      .catch((e: Error) => {
        if (cancelled) return;
        if (e.message === '__not_configured__') setNotConfigured(true);
        else setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const g = input.trim();
    setSelected(g);
    setSearchParams(g ? { group: g } : {}, { replace: true });
  };

  const ttps = useMemo(() => (profile?.ttps ?? []).filter((t) => (t.techniques?.length ?? 0) > 0), [profile]);
  const vulns = profile?.vulnerabilities ?? [];
  const toolCats = useMemo(() => Object.entries(profile?.tools ?? {}).filter(([, v]) => v.length > 0), [profile]);
  const locations = profile?.locations ?? [];

  // One-click PDF download. jsPDF + autotable are dynamically imported so they
  // stay out of the initial bundle (loaded only when the operator exports).
  const downloadPdf = async () => {
    if (!profile) return;
    setPdfError(null);
    setPdfBusy(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 40;
      const maxW = pageW - margin * 2;
      let y = margin;

      const ensure = (h: number) => {
        if (y + h > pageH - margin) {
          doc.addPage();
          y = margin;
        }
      };
      const heading = (t: string) => {
        ensure(30);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(30);
        doc.text(t.toUpperCase(), margin, y);
        y += 5;
        doc.setDrawColor(200);
        doc.line(margin, y, pageW - margin, y);
        y += 14;
      };
      const para = (t: string, size = 9, color = 80) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(size);
        doc.setTextColor(color);
        for (const line of doc.splitTextToSize(t, maxW) as string[]) {
          ensure(size + 4);
          doc.text(line, margin, y);
          y += size + 4;
        }
      };

      const name = (profile.group ?? selected).toUpperCase();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text('RANSOMWARE THREAT INTELLIGENCE REPORT', margin, y);
      y += 20;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(20);
      doc.text(name, margin, y);
      y += 16;
      const meta = [
        profile.firstseen && `First seen: ${profile.firstseen.slice(0, 10)}`,
        profile.lastseen && `Last seen: ${profile.lastseen.slice(0, 10)}`,
        typeof profile.victims === 'number' && `Victims: ${profile.victims}`,
        profile.negotiation_count ? `Negotiations: ${profile.negotiation_count}` : '',
      ]
        .filter(Boolean)
        .join('    ');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(110);
      doc.text(meta, margin, y);
      y += 20;

      if (profile.description) {
        heading('Overview');
        para(profile.description);
        y += 8;
      }

      if (ttps.length > 0) {
        heading('MITRE ATT&CK TTPs');
        for (const t of ttps) {
          ensure(16);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor(40);
          doc.text(`${t.tactic_id ?? ''} ${t.tactic_name ?? ''}`.trim(), margin, y);
          y += 12;
          for (const tech of t.techniques ?? []) {
            para(
              `- ${tech.technique_id ?? ''} ${tech.technique_name ?? ''}${tech.technique_details ? ` — ${tech.technique_details}` : ''}`,
              8.5,
              90
            );
          }
          y += 4;
        }
      }

      if (vulns.length > 0) {
        heading(`Exploited Vulnerabilities (${vulns.length})`);
        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [['CVE', 'Severity', 'CVSS', 'Vendor', 'Product']],
          body: vulns.map((v) => [
            v.CVE ?? '',
            v.severity ?? '',
            String(v.CVSS ?? ''),
            v.Vendor ?? '',
            v.Product ?? '',
          ]),
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: { fillColor: [30, 41, 59] },
          theme: 'striped',
        });
        y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
        y += 16;
      }

      if (toolCats.length > 0) {
        heading('Tools & Utilities');
        for (const [cat, tools] of toolCats) para(`${cat}: ${tools.join(', ')}`, 8.5, 80);
        y += 8;
      }

      if (locations.length > 0) {
        heading(`Leak-site Infrastructure / IOCs (${locations.length})`);
        for (const l of locations) {
          para(`[${l.type ?? 'site'}] ${l.fqdn ?? l.slug ?? ''}${l.title ? ` — ${l.title}` : ''}`, 8, 90);
        }
        y += 8;
      }

      if (victims.length > 0) {
        heading(`Recent Victims (${victims.length})`);
        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [['Victim', 'Country', 'Sector', 'Disclosed']],
          body: victims.map((v) => [
            v.victim ?? '',
            v.country ?? '',
            v.activity ?? '',
            (v.discovered ?? v.attackdate ?? '').slice(0, 10),
          ]),
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: { fillColor: [30, 41, 59] },
          theme: 'striped',
        });
        y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
        y += 16;
      }

      heading('YARA Detection');
      para(
        yaraCount && yaraCount > 0
          ? `${yaraCount} YARA rule(s) published for this group on ransomware.live.`
          : 'No YARA rules published for this group on ransomware.live.'
      );

      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(`Source: ransomware.live · pranithjain.qzz.io · page ${i}/${pages}`, margin, pageH - 20);
      }
      doc.save(`ransom-report-${(profile.group ?? selected).replace(/[^a-z0-9]/gi, '_')}.pdf`);
    } catch {
      setPdfError("Couldn't generate the PDF — the export library failed to load. Check your connection and retry.");
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<ShieldAlert size={28} />}
      title="Ransomware intel report"
      description={
        <>
          Per-group CTI report — overview, MITRE ATT&amp;CK TTPs, exploited CVEs, tooling, leak-site infrastructure, and
          YARA — assembled from{' '}
          <a
            href="https://www.ransomware.live"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            ransomware.live
          </a>
          . Export to PDF for SOC / detection-engineering handoff.
        </>
      }
      headerExtra={
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{groups.length || 347} tracked groups.</p>
      }
      loading={loading && !profile}
      error={error}
      empty={!profile && !loading && !!selected}
      emptyMessage={`No ransomware.live profile for "${selected}".`}
      maxWidthClass="max-w-4xl"
    >
      {/* Scoped print CSS — print only the report card as a clean PDF. */}
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #ransom-report, #ransom-report * { visibility: visible !important; }
        #ransom-report { position: absolute; left: 0; top: 0; width: 100%; padding: 0 12px; }
        .no-print { display: none !important; }
        a { color: #000 !important; text-decoration: none !important; }
      }`}</style>

      <div className="no-print">
        <div className="mb-6">
          <ClusterTabs tabs={RANSOMWARE_TABS} ariaLabel="Ransomware intel" />
        </div>

        <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              list="rl-groups"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="threat group — e.g. lockbit3, akira, qilin"
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
              aria-label="Threat group"
            />
            <datalist id="rl-groups">
              {groups.map((g) => (
                <option key={g.group} value={g.group}>
                  {g.victims ? `${g.victims} victims` : ''}
                </option>
              ))}
            </datalist>
          </div>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex items-center justify-center gap-1.5 text-xs font-mono px-4 py-2 rounded border border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:border-brand-500/70 disabled:opacity-50"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <ShieldAlert size={13} />} build report
          </button>
          {profile && (
            <button
              type="button"
              onClick={() => void downloadPdf()}
              disabled={pdfBusy}
              className="inline-flex items-center justify-center gap-1.5 text-xs font-mono px-4 py-2 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 disabled:opacity-50"
            >
              {pdfBusy ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}{' '}
              {pdfBusy ? 'building…' : 'PDF'}
            </button>
          )}
        </form>

        {pdfError && <p className="text-xs font-mono text-rose-600 dark:text-rose-400 -mt-3 mb-3">{pdfError}</p>}

        {notConfigured && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-amber-800 dark:text-amber-200">
            <strong className="font-semibold">ransomware.live not configured.</strong> This report needs the
            operator&apos;s ransomware.live PRO key (<code className="font-mono text-xs">RANSOMWARELIVE_API_KEY</code>).
          </div>
        )}
      </div>

      {!notConfigured && profile && (
        <div id="ransom-report">
          {/* Report header */}
          <div className="mb-6 pb-4 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
            <div className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-1">
              Ransomware Threat Intelligence Report
            </div>
            <h2 className="text-2xl font-display font-bold capitalize">{profile.group ?? selected}</h2>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-meta font-mono text-slate-500">
              {profile.firstseen && <span>first seen: {profile.firstseen.slice(0, 10)}</span>}
              {profile.lastseen && <span>last seen: {profile.lastseen.slice(0, 10)}</span>}
              {typeof profile.victims === 'number' && <span>victims: {profile.victims.toLocaleString()}</span>}
              {profile.negotiation_count ? <span>negotiations: {profile.negotiation_count}</span> : null}
            </div>
          </div>

          {profile.description && (
            <Section title="Overview">
              <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                {profile.description}
              </p>
            </Section>
          )}

          {ttps.length > 0 && (
            <Section title="MITRE ATT&CK TTPs">
              <div className="space-y-3">
                {ttps.map((t) => (
                  <div key={t.tactic_id ?? t.tactic_name}>
                    <div className="text-meta font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {t.tactic_id} · {t.tactic_name}
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {(t.techniques ?? []).map((tech, i) => (
                        <li key={`${tech.technique_id}-${i}`} className="text-meta text-muted">
                          <span className="font-mono text-slate-700 dark:text-slate-300">{tech.technique_id}</span>{' '}
                          {tech.technique_name}
                          {tech.technique_details ? ` — ${tech.technique_details}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {vulns.length > 0 && (
            <Section title={`Exploited vulnerabilities (${vulns.length})`}>
              <div className="overflow-x-auto rounded border border-slate-200 dark:border-[rgb(var(--border-400))]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-[rgb(var(--surface-200))] text-left">
                      {['CVE', 'Severity', 'CVSS', 'Vendor', 'Product'].map((h) => (
                        <th
                          key={h}
                          className="px-3 py-1.5 font-mono text-mini uppercase tracking-wider text-slate-500 whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {vulns.map((v, i) => (
                      <tr
                        key={`${v.CVE}-${i}`}
                        className="border-t border-slate-100 dark:border-[rgb(var(--border-400))]/70"
                      >
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <a
                            href={sanitizeUrl(`https://nvd.nist.gov/vuln/detail/${v.CVE}`) || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-meta text-brand-600 dark:text-brand-400 hover:underline"
                          >
                            {v.CVE}
                          </a>
                        </td>
                        <td className="px-3 py-1.5">
                          <span
                            className={`text-mini font-mono px-2 py-0.5 rounded border ${SEVERITY_TONE[normSeverity(v.severity)]}`}
                          >
                            {v.severity ?? '—'}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-meta tabular-nums text-muted">{v.CVSS ?? '—'}</td>
                        <td className="px-3 py-1.5 text-meta text-muted">{v.Vendor ?? '—'}</td>
                        <td className="px-3 py-1.5 text-meta text-muted">{v.Product ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {toolCats.length > 0 && (
            <Section title="Tools & utilities">
              <div className="space-y-2">
                {toolCats.map(([cat, tools]) => (
                  <div key={cat}>
                    <span className="text-mini font-mono font-semibold text-slate-700 dark:text-slate-300">
                      {cat}:{' '}
                    </span>
                    <span className="text-meta text-muted">{tools.join(', ')}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {locations.length > 0 && (
            <Section title={`Leak-site infrastructure / IOCs (${locations.length})`}>
              <ul className="space-y-1 font-mono text-mini">
                {locations.map((l, i) => (
                  <li key={`${l.fqdn}-${i}`} className="break-all text-muted">
                    <span className="text-slate-400">[{l.type ?? 'site'}]</span> {l.fqdn ?? l.slug}
                    {l.title ? ` — ${l.title}` : ''}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {victims.length > 0 && (
            <Section title={`Recent victims (${victims.length})`}>
              <p className="text-micro font-mono text-slate-400 mb-2">
                From the latest 100 disclosures on ransomware.live.
              </p>
              <div className="overflow-x-auto rounded border border-slate-200 dark:border-[rgb(var(--border-400))]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-[rgb(var(--surface-200))] text-left">
                      {['Victim', 'Country', 'Sector', 'Disclosed'].map((h) => (
                        <th
                          key={h}
                          className="px-3 py-1.5 font-mono text-mini uppercase tracking-wider text-slate-500 whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {victims.map((v, i) => (
                      <tr
                        key={`${v.victim}-${i}`}
                        className="border-t border-slate-100 dark:border-[rgb(var(--border-400))]/70"
                      >
                        <td className="px-3 py-1.5 text-meta text-slate-700 dark:text-slate-300 break-all">
                          {v.victim ?? '—'}
                        </td>
                        <td className="px-3 py-1.5 text-meta text-muted">{v.country ?? '—'}</td>
                        <td className="px-3 py-1.5 text-meta text-muted">{v.activity ?? '—'}</td>
                        <td className="px-3 py-1.5 font-mono text-mini text-slate-500 whitespace-nowrap">
                          {(v.discovered ?? v.attackdate ?? '').slice(0, 10) || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          <Section title="YARA detection">
            <p className="text-meta text-muted">
              {yaraCount && yaraCount > 0
                ? `${yaraCount} YARA rule${yaraCount === 1 ? '' : 's'} published for this group on ransomware.live.`
                : 'No YARA rules published for this group on ransomware.live.'}
            </p>
            {yaraText && (
              <pre className="mt-2 max-h-72 overflow-auto rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3 text-mini font-mono whitespace-pre-wrap">
                {yaraText.slice(0, 20000)}
              </pre>
            )}
          </Section>

          <p className="mt-6 pt-3 border-t border-slate-200 dark:border-[rgb(var(--border-400))] text-micro font-mono text-slate-400">
            Source: ransomware.live · generated by pranithjain.qzz.io threat-intel platform
          </p>
        </div>
      )}
    </DataPageLayout>
  );
}
