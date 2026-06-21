/**
 * <TimelineChapter> — the timeline row used by the About page.
 *
 * Renders one entry of the "How I got here" story as a vertical
 * timeline item: a period label, paragraphs of body text, and a row
 * of skill tags. The 3 instances on /about are identical except for
 * the content, so they were a natural refactor target when migrating
 * the page to Panda recipes.
 *
 * Visual contract: identical to the pre-migration inline markup
 * (absolute-positioned rail + dot on the left, period + paragraphs
 * + tags on the right). The styling uses Panda `css()` for the
 * layout-only classes (relative, absolute, pl-8, etc.) — these
 * aren't repeated enough to warrant a recipe.
 */
import type { ReactNode } from 'react';

export interface TimelineChapterProps {
  /** Period label (e.g. "2022 — 2023 / The Foundation") */
  period: string;
  /** Body paragraphs */
  children: ReactNode;
  /** Skill tag chips */
  tags: readonly string[];
}

export function TimelineChapter({ period, children, tags }: TimelineChapterProps) {
  return (
    <div className="relative pl-8 sm:pl-10">
      {/* Vertical rail — the line that visually connects the chapter
          dots. Drawn as an absolute-positioned 1px-wide bar from the
          top of the first child to the bottom of the last. */}
      <div className="absolute left-0 top-1 bottom-0 w-px bg-slate-200 dark:bg-slate-800" />
      {/* Chapter dot — sits on the rail at the top of the entry. */}
      <div className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-brand-500 bg-white dark:bg-slate-900" />
      {/* Period label — eyebrow type (uppercase, mono, tracked). */}
      <div className="text-eyebrow font-mono uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400 mb-3">
        {period}
      </div>
      {/* Body paragraphs. Caller is responsible for `<p>` wrapping
          (or any other element) so the chapter can host mixed
          content in the future without breaking the prop API. */}
      <div className="space-y-4 text-base text-muted leading-relaxed">{children}</div>
      {/* Skill tags — small chip row. Kept as inline markup (not a
          recipe) because the visual is specific to this one site
          section. Migrating to a recipe would add indirection
          without removing duplication. */}
      <div className="mt-4 flex flex-wrap gap-2">
        {tags.map((t) => (
          <span
            key={t}
            className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-2.5 py-1 text-mini font-mono text-slate-500 dark:text-slate-400"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
