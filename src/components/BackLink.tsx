import { Link, useLocation, type LinkProps } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { backCategoryFor } from '../lib/back-link';
import { useInsideDataPageLayout } from './DataPageLayout';

/**
 * Drop-in replacement for `<Link to="/threatintel">` / `<Link to="/dfir">`
 * back-affordances on tool pages. Computes the appropriate category-filtered
 * hub URL from the current pathname (`/threatintel/writeups` → category
 * `knowledge` → `/threatintel/c/knowledge`) and falls back to the explicit
 * `to` prop when no category mapping exists for the current page.
 *
 * Auto-hides when nested inside a `DataPageLayout` to avoid duplicate
 * back buttons (the parent layout already renders one).
 */
export interface BackLinkProps extends Omit<LinkProps, 'to'> {
  /** Hub root used as a fallback when the current page isn't in the
   *  category map. Must be one of the two surface roots so the type
   *  prevents typos. */
  to: '/threatintel' | '/dfir';
}

export function BackLink({ to, className, children, ...rest }: BackLinkProps): JSX.Element | null {
  const insideLayout = useInsideDataPageLayout();
  const { pathname } = useLocation();
  if (insideLayout) return null;
  const target = backCategoryFor(pathname) ?? to;
  return (
    <Link
      to={target}
      className={
        className ??
        'inline-flex items-center gap-1.5 px-3 py-1.5 -ml-3 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[rgb(var(--hover-100))] rounded-lg mb-8 font-mono transition-colors'
      }
      {...rest}
    >
      <ArrowLeft size={14} />
      {children ?? 'back'}
    </Link>
  );
}

export default BackLink;
