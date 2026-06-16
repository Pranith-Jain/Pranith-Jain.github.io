import { Link, useLocation, type LinkProps } from 'react-router-dom';
import { backCategoryFor } from '../lib/back-link';
import { useInsideDataPageLayout } from './DataPageLayout';

/**
 * Drop-in replacement for `<Link to="/threatintel">` / `<Link to="/dfir">`
 * back-affordances on tool pages. Computes the appropriate category-filtered
 * hub URL from the current pathname (`/threatintel/writeups` → category
 * `knowledge` → `/threatintel/c/knowledge`) and falls back to the explicit
 * `to` prop when no category mapping exists for the current page.
 *
 * Every other Link prop (className, children, aria-label…) is forwarded
 * verbatim so individual pages keep their existing styling — the only thing
 * that changes is the destination URL.
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

export function BackLink({ to, ...rest }: BackLinkProps): JSX.Element | null {
  const insideLayout = useInsideDataPageLayout();
  const { pathname } = useLocation();
  if (insideLayout) return null;
  const target = backCategoryFor(pathname) ?? to;
  return <Link to={target} {...rest} />;
}

export default BackLink;
