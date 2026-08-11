import { useState } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import { Modal } from '../components/ui/Modal';
import { Atom, ShieldAlert, BookOpen, CalendarClock } from 'lucide-react';

interface PqcIndex {
  source: string;
  sourceUrl: string;
  license: string;
  replicatedAt: string;
  counts: { algorithms: number; readiness: number; cryptoClasses: number };
  algorithmIndex: Array<{ slug: string; name: string; fips: string; type: string; status: string }>;
  models: string[];
  hndl: { threat: string; summary: string; timeline: string; whoShouldActFirst: string; mitigations: string };
  cryptoClasses: Array<{ class: string; risk: string; action: string }>;
  readiness: Array<{ id: string; question: string; weight: number }>;
}

interface PqcAlgorithmBody {
  slug: string;
  name: string;
  fips: string;
  type: string;
  status: string;
  purpose: string;
  sizes: Record<string, string> | string;
  security: string;
  notes: string;
}

const CARD = 'surface-card';

const RISK_TONE: Record<string, string> = {
  High: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800',
  Medium: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
  Low: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800',
};

function AlgorithmDetail({ body, onClose }: { body: PqcAlgorithmBody; onClose: () => void }) {
  const keySizes =
    typeof body.sizes === 'string'
      ? body.sizes
      : Object.entries(body.sizes)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n');
  return (
    <Modal open onClose={onClose} title={body.name} size="lg">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-micro font-bold px-2 py-0.5 rounded border border-brand-500/40 text-brand-700 dark:text-brand-300 bg-brand-500/10">
            {body.fips}
          </span>
          <span className="font-mono text-micro px-2 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-600 dark:text-slate-300">
            {body.type}
          </span>
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            Purpose
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{body.purpose}</p>
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            Security Levels
          </div>
          <p className="text-sm font-mono text-slate-700 dark:text-slate-200">{body.security}</p>
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            Key / Parameter Sizes
          </div>
          <pre className="text-sm font-mono text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{keySizes}</pre>
        </div>
        {body.notes && (
          <div className="border-l-2 border-violet-500 pl-4 py-2 bg-violet-50 dark:bg-violet-950/20 rounded-r-lg">
            <div className="text-xs font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1">
              Migration Notes
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{body.notes}</p>
          </div>
        )}
        <p className="text-micro text-slate-500 dark:text-slate-500">{body.status}</p>
      </div>
    </Modal>
  );
}

export default function Pqc() {
  const { data: index, loading, error } = useDataFetch<PqcIndex>({ url: '/data/pqc/index.json', ttl: 120_000 });
  const [detailSlug, setDetailSlug] = useState<string | null>(null);

  const { data: detailBody } = useDataFetch<PqcAlgorithmBody>({
    url: detailSlug ? `/data/pqc/algorithms/${detailSlug}.json` : null,
    ttl: 300_000,
  });

  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="DFIR"
      icon={<Atom />}
      title="Post-Quantum Cryptography"
      description={
        <span>
          NIST FIPS 203/204/205/206 reference — {index?.counts.algorithms ?? 5} standardized algorithms, the
          harvest-now-decrypt-later (HNDL) threat model, {index?.counts.cryptoClasses ?? 8} crypto inventory risk
          classes and a {index?.counts.readiness ?? 12}-point readiness assessment.
        </span>
      }
      loading={loading}
      error={error}
      maxWidthClass="max-w-6xl"
    >
      <div className="space-y-6">
        {/* HNDL threat */}
        {index?.hndl && (
          <div className={`${CARD} p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert size={16} className="text-rose-500" />
              <h2 className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">
                {index.hndl.threat}
              </h2>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed mb-3">{index.hndl.summary}</p>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3">
                <div className="text-micro font-mono uppercase tracking-wider text-slate-400 mb-1">
                  <CalendarClock size={11} className="inline mr-1" />
                  Timeline
                </div>
                <p className="text-mini font-mono text-slate-600 dark:text-slate-300 leading-relaxed">
                  {index.hndl.timeline}
                </p>
              </div>
              <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3">
                <div className="text-micro font-mono uppercase tracking-wider text-slate-400 mb-1">Act first</div>
                <p className="text-mini font-mono text-slate-600 dark:text-slate-300 leading-relaxed">
                  {index.hndl.whoShouldActFirst}
                </p>
              </div>
              <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3">
                <div className="text-micro font-mono uppercase tracking-wider text-slate-400 mb-1">Mitigations</div>
                <p className="text-mini font-mono text-slate-600 dark:text-slate-300 leading-relaxed">
                  {index.hndl.mitigations}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Algorithms */}
        <div>
          <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
            Standardized Algorithms
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {index?.algorithmIndex.map((alg) => (
              <button
                key={alg.slug}
                onClick={() => setDetailSlug(alg.slug)}
                className={`${CARD} text-left p-4 transition-colors hover:border-brand-400 dark:hover:border-brand-600 group`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-mono text-micro font-bold text-brand-600 dark:text-brand-400">{alg.fips}</span>
                </div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white mb-1 leading-snug">
                  {alg.name}
                </div>
                <div className="text-micro font-mono text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                  {alg.type}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Crypto classes */}
        <div>
          <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
            Crypto Inventory Risk Classes
          </h2>
          <div className="space-y-2">
            {index?.cryptoClasses.map((c) => (
              <div key={c.class} className={`${CARD} p-3 flex flex-wrap items-center gap-3`}>
                <span
                  className={`font-mono text-micro font-bold px-2 py-0.5 rounded border ${RISK_TONE[c.risk] ?? ''}`}
                >
                  {c.risk}
                </span>
                <span className="font-display font-semibold text-xs text-slate-900 dark:text-slate-100 w-44">
                  {c.class}
                </span>
                <span className="flex-1 text-mini font-mono text-muted leading-relaxed">{c.action}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Readiness */}
        <div>
          <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
            Readiness Assessment ({index?.counts.readiness ?? 12} questions)
          </h2>
          <div className={`${CARD} p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={14} className="text-brand-500" />
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                Weighted inventory of what your org must know before a PQC transition — data-at-rest (HNDL) is the
                forcing function.
              </p>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {index?.readiness.map((r) => (
                <div
                  key={r.id}
                  className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-micro font-bold text-brand-600 dark:text-brand-400">{r.id}</span>
                    <span className="text-micro font-mono text-slate-400">weight {r.weight}</span>
                  </div>
                  <p className="text-mini font-mono text-slate-600 dark:text-slate-300 leading-relaxed">{r.question}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="text-center pt-2 pb-2 text-xs text-slate-500 dark:text-slate-500 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
          Summarized from NIST FIPS 203/204/205/206 + NSA CNSSP-15. Track IETF TLS hybrid drafts before production
          migration.
        </div>
      </div>

      {detailBody && <AlgorithmDetail body={detailBody} onClose={() => setDetailSlug(null)} />}
    </DataPageLayout>
  );
}
