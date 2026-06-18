import { Fragment, type JSX } from 'react';
import { FileDown, FileText, ShieldAlert } from 'lucide-react';
import type { Report, Tlp } from '../../lib/threatintel/report-client';

const TLP_CLASS: Record<Tlp, string> = {
  CLEAR: 'bg-slate-500 text-white',
  GREEN: 'bg-emerald-600 text-white',
  AMBER: 'bg-amber-500 text-black',
  RED: 'bg-rose-600 text-white',
};

const CONF_CLASS: Record<string, string> = {
  High: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  Medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  Low: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
};

/** Render inline markdown: `**bold**` runs and `[n]` citation links. */
function renderInline(text: string): JSX.Element {
  const parts = text.split(/(\*\*[^*]+\*\*|\[\d+\])/g);
  return (
    <>
      {parts.map((p, i) => {
        const cite = /^\[(\d+)\]$/.exec(p);
        if (cite) {
          return (
            <a
              key={i}
              href={`#report-src-${cite[1]}`}
              className="text-brand-600 dark:text-brand-400 hover:underline align-super text-micro"
            >
              [{cite[1]}]
            </a>
          );
        }
        const bold = /^\*\*([^*]+)\*\*$/.exec(p);
        if (bold) return <strong key={i}>{bold[1]}</strong>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

/** Render a markdown body as blocks: `- `/`* ` → bullet list, `#` → bold line, else paragraphs. */
function renderBody(md: string): JSX.Element {
  const lines = md.split('\n');
  const blocks: JSX.Element[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      const items = bullets;
      blocks.push(
        <ul key={`u${blocks.length}`} className="list-disc pl-5 space-y-1 my-1.5">
          {items.map((b, i) => (
            <li key={i}>{renderInline(b)}</li>
          ))}
        </ul>
      );
      bullets = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flush();
    const heading = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        <p key={`h${blocks.length}`} className="font-semibold text-slate-800 dark:text-slate-200 mt-2">
          {renderInline(heading[1])}
        </p>
      );
      continue;
    }
    blocks.push(
      <p key={`p${blocks.length}`} className="my-1.5">
        {renderInline(line)}
      </p>
    );
  }
  flush();
  return <>{blocks}</>;
}

interface Props {
  report: Report;
  onExportPdf: () => void;
  onExportMd?: () => void;
}

export function ReportView({ report, onExportPdf, onExportMd }: Props): JSX.Element {
  const tlp = report.cover.tlp;
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const shareTitle = report.cover.title;
  return (
    <div className="space-y-5">
      {/* Cover */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className={`px-4 py-1.5 text-mini font-mono font-semibold tracking-wide ${TLP_CLASS[tlp]}`}>TLP:{tlp}</div>
        <div className="p-5">
          <h1 className="font-display font-bold text-xl text-slate-900 dark:text-slate-100">{report.cover.title}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{report.cover.subtitle}</p>
          <div className="flex flex-wrap items-center gap-2 mt-3 text-mini font-mono text-slate-500 dark:text-slate-400">
            <span>generated {report.cover.generated_at}</span>
            {report.cover.subject_badges.map((b) => (
              <span key={b} className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700">
                {b}
              </span>
            ))}
            {report.confidence.admiralty?.label && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                <ShieldAlert size={11} /> {report.confidence.admiralty.label}
              </span>
            )}
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={onExportPdf}
              className="inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/50"
            >
              <FileDown size={13} /> Export PDF
            </button>
            {onExportMd && (
              <button
                onClick={onExportMd}
                className="inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/50"
              >
                <FileText size={13} /> .md
              </button>
            )}
          </div>
          <div className="flex gap-2 mt-2">
            <a
              href={`https://x.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(shareUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/50"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              X
            </a>
            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/50"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
              LinkedIn
            </a>
          </div>
        </div>
      </div>

      {/* Executive summary */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <h2 className="font-display font-semibold text-lg mb-2">Executive Summary</h2>
        <div className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          {renderBody(report.executive_summary)}
        </div>
      </section>

      {/* Key findings */}
      {report.key_findings.length > 0 && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <h2 className="font-display font-semibold text-lg mb-2">Key Findings</h2>
          <ul className="space-y-2">
            {report.key_findings.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                <span
                  className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-micro font-mono ${CONF_CLASS[f.confidence] ?? ''}`}
                >
                  {f.confidence}
                </span>
                <span>{renderInline(f.text)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Sections */}
      {report.sections.map((sec) => (
        <section
          key={sec.id}
          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
        >
          <h2 className="font-display font-semibold text-lg mb-2">{sec.heading}</h2>
          <div className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{renderBody(sec.body_md)}</div>
        </section>
      ))}

      {/* Conflicts */}
      {report.appendices.conflicts.length > 0 && (
        <section className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-5">
          <h2 className="font-display font-semibold text-lg mb-2 text-amber-800 dark:text-amber-300">
            Sources Conflict
          </h2>
          <ul className="space-y-1 text-sm text-amber-900 dark:text-amber-200">
            {report.appendices.conflicts.map((c, i) => (
              <li key={i}>
                <strong>{c.claim}</strong>: {c.positions.join(' vs ')}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Appendices: tables */}
      {report.appendices.iocs.length > 0 && (
        <AppendixTable
          title="Appendix A — Indicators"
          head={['Type', 'Value']}
          rows={report.appendices.iocs.map((i) => [i.type, i.value])}
        />
      )}
      {report.appendices.mitre.length > 0 && (
        <AppendixTable
          title="Appendix B — MITRE ATT&CK"
          head={['Technique', 'Name', 'Tactic']}
          rows={report.appendices.mitre.map((m) => [m.technique_id, m.technique_name, m.tactic])}
        />
      )}
      {report.appendices.cves.length > 0 && (
        <AppendixTable
          title="Appendix C — CVEs"
          head={['CVE', 'CVSS', 'EPSS', 'KEV']}
          rows={report.appendices.cves.map((c) => [
            c.id,
            String(c.cvss ?? ''),
            String(c.epss ?? ''),
            c.kev ? 'yes' : '',
          ])}
        />
      )}

      {/* Sources appendix (with Admiralty badges + anchor targets for citations) */}
      {report.appendices.sources.length > 0 && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <h2 className="font-display font-semibold text-lg mb-3">Appendix D — Sources</h2>
          <ul className="space-y-1.5">
            {report.appendices.sources.map((s) => (
              <li
                key={s.ref}
                id={`report-src-${s.ref}`}
                className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"
              >
                <span className="font-mono text-xs text-slate-400">[{s.ref}]</span>
                <span
                  className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800"
                  title="NATO Admiralty reliability"
                >
                  {s.authority}
                </span>
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    {s.name}
                  </a>
                ) : (
                  <span>{s.name}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function AppendixTable({ title, head, rows }: { title: string; head: string[]; rows: string[][] }): JSX.Element {
  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 overflow-x-auto">
      <h2 className="font-display font-semibold text-lg mb-3">{title}</h2>
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="text-left text-slate-400 border-b border-slate-200 dark:border-slate-800">
            {head.map((h) => (
              <th key={h} className="py-1 pr-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 dark:border-slate-800/50">
              {r.map((cell, j) => (
                <td key={j} className="py-1 pr-3 text-slate-700 dark:text-slate-300 break-all">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
