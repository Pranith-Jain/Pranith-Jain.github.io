/**
 * Reusable UI Component Library
 *
 * Prefer these primitives for new tool pages instead of one-off Tailwind
 * buttons/inputs. Keeps focus rings, sizes, empty states, and copy UX
 * consistent across CRUCIBLE / PANOPTICON / SCOUT.
 */

export { ScrollProgress } from './ScrollProgress';
export { BackToTop } from './BackToTop';

export { EmptyState } from './EmptyState';
export { CopyButton, CopyChip } from './CopyButton';
export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';
export { Spinner } from './Spinner';
export { Modal } from './Modal';
export { TabBar } from './TabBar';
export { DataTable } from './DataTable';
export type { DataTableColumn, DataTableProps } from './DataTable';
export { Skeleton, SkeletonCard, SkeletonTable } from './Skeleton';
export type { SkeletonVariant } from './Skeleton';

export { Kbd } from './Kbd';

export { SeverityBadge, SeverityDot } from '../SeverityBadge';

export { Input, Textarea, Select, Field } from './Input';
