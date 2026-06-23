import { memo, type ReactNode } from 'react';

interface EmptyStateProps {
  /** Icon to display */
  icon?: ReactNode;
  /** Primary message */
  title: string;
  /** Secondary description */
  description?: string;
  /** Action button or link */
  action?: ReactNode;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  className?: string;
}

const SIZE_STYLES = {
  sm: {
    container: 'py-6 px-4',
    icon: 'h-8 w-8 mb-2',
    title: 'text-sm',
    description: 'text-xs',
  },
  md: {
    container: 'py-10 px-6',
    icon: 'h-12 w-12 mb-3',
    title: 'text-base',
    description: 'text-sm',
  },
  lg: {
    container: 'py-16 px-8',
    icon: 'h-16 w-16 mb-4',
    title: 'text-lg',
    description: 'text-base',
  },
};

/**
 * Empty state component for when there's no data to display.
 * Provides a consistent empty state experience across the application.
 *
 * @example
 * <EmptyState
 *   icon={<Search size={48} />}
 *   title="No results found"
 *   description="Try adjusting your search terms"
 *   action={<Button onClick={clearSearch}>Clear search</Button>}
 * />
 */
export const EmptyState = memo(function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'md',
  className = '',
}: EmptyStateProps) {
  const styles = SIZE_STYLES[size];

  return (
    <div className={`text-center ${styles.container} ${className}`} role="status" aria-live="polite">
      {icon && <div className={`mx-auto ${styles.icon} text-slate-300 dark:text-slate-400`}>{icon}</div>}
      <h3 className={`font-medium text-slate-600 dark:text-slate-400 ${styles.title}`}>{title}</h3>
      {description && <p className={`mt-1 text-slate-500 dark:text-slate-500 ${styles.description}`}>{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
});
