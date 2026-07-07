import { CheckCircle2, AlertCircle, ArrowRightCircle } from 'lucide-react';
import { SECTIONS } from './tool-sections';

/**
 * Standard "what this is / what it isn't / how to use it" panel for any
 * /dfir tool page. Reads the source-of-truth from tool-sections.ts —
 * `useCase`, `cantDo`, `workflow`. Renders only the fields that are set
 * so tools without populated docs don't render an empty panel.
 *
 * Drop in at the top of any tool page right under the back-link / title:
 *
 *     <ToolDocs path="/dfir/ioc-check" />
 *
 * The intent is honesty about each tool's scope — the bigger the toolkit,
 * the more important it is that each individual page tells you what it
 * IS and what it ISN'T, before you spend 10 minutes finding out.
 */
export function ToolDocs({ path }: { path: string }): JSX.Element | null {
  // Flat lookup across all sections. Repeated per render but the SECTIONS
  // tree is small; not worth memoising.
  for (const s of SECTIONS) {
    for (const t of s.tools) {
      if (t.path === path) {
        // Only render the panel if at least one of the docs fields is
        // populated — keeps tools without docs from showing a stub.
        if (!t.useCase && !t.cantDo && !t.workflow) return null;
        return (
          <section
            aria-label={`About ${t.label}`}
            className="mb-6 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200)/0.4)] shadow-e1 p-4"
          >
            <div className="grid gap-3 sm:grid-cols-3 text-tool">
              {t.useCase && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5 text-micro font-mono uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 size={11} aria-hidden="true" /> What it's for
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 leading-snug">{t.useCase}</p>
                </div>
              )}
              {t.cantDo && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5 text-micro font-mono uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">
                    <AlertCircle size={11} aria-hidden="true" /> What it isn't
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 leading-snug">{t.cantDo}</p>
                </div>
              )}
              {t.workflow && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5 text-micro font-mono uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
                    <ArrowRightCircle size={11} aria-hidden="true" /> Typical workflow
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 leading-snug">{t.workflow}</p>
                </div>
              )}
            </div>
          </section>
        );
      }
    }
  }
  return null;
}
