import { Link, useLocation, type LinkProps } from 'react-router-dom';
import { backCategoryFor } from '../lib/back-link';

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
 */
export interface BackLinkProps extends Omit<LinkProps, 'to'> {
  /** Hub root used as a fallback when the current page isn't in the
   *  category map. Must be one of the two surface roots so the type
   *  prevents typos. */
  to: '/threatintel' | '/dfir';
}

export function BackLink({ to, ...rest }: BackLinkProps): JSX.Element {
  const { pathname } = useLocation();
  const target = backCategoryFor(pathname) ?? to;
  return <Link to={target} {...rest} />;
}

export default BackLink;
