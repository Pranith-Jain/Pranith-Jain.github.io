/**
 * Reusable UI Component Library
 *
 * Prefer these primitives for new tool pages instead of one-off Tailwind
 * buttons/inputs. Keeps focus rings, sizes, empty states, and copy UX
 * consistent across CRUCIBLE / PANOPTICON / SCOUT.
 */

export { ScrollProgress } from './ScrollProgress';
export { BackToTop } from './BackToTop';

// (ui/Badge removed — consolidated onto the canonical components/Badge.tsx
//  Badge + SeverityPill, the documented single source of truth.)

export { Skeleton, SkeletonCard, SkeletonTable } from './Skeleton';
export type { SkeletonVariant } from './Skeleton';

export { EmptyState } from './EmptyState';

export { Tooltip } from './Tooltip';

export { CopyButton, CopyChip } from './CopyButton';

export { StatusIndicator } from './StatusIndicator';
export type { Status } from './StatusIndicator';

export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { TextField } from './TextField';
export { SearchInput } from './SearchInput';
export { Spinner } from './Spinner';
export { Modal } from './Modal';
export { TabBar } from './TabBar';
export { Tabs } from './Tabs';
export type { Toast } from './Toast';
export { ToastProvider, useToast } from './Toast';
export { FilterBar } from './FilterBar';
