import { type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ExternalLink as ExternalLinkIcon } from 'lucide-react';

export interface LinkProps {
  children: ReactNode;
  className?: string;
  to?: string;
  href?: string;
}

export function Link({ children, className = '', to, href }: LinkProps) {
  const base =
    'inline-flex items-center gap-1 font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-400 transition-colors';

  if (to) {
    return (
      <RouterLink to={to} className={`${base} ${className}`}>
        {children}
      </RouterLink>
    );
  }

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={`${base} ${className}`}>
        {children}
        <ExternalLinkIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
      </a>
    );
  }

  return <span className={`${base} ${className}`}>{children}</span>;
}
