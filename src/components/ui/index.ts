/**
 * Reusable UI Component Library
 *
 * Production-ready components with:
 * - Full accessibility (ARIA attributes, keyboard navigation)
 * - Responsive design
 * - Dark mode support
 * - Loading states and edge cases
 * - Memoized for performance
 */

// Existing components
export { ScrollProgress } from './ScrollProgress';
export { BackToTop } from './BackToTop';

// New reusable components
// (ui/Badge removed — consolidated onto the canonical components/Badge.tsx
//  Badge + SeverityPill, the documented single source of truth.)

export { Skeleton, SkeletonCard, SkeletonTable } from './Skeleton';
export type { SkeletonVariant } from './Skeleton';

export { EmptyState } from './EmptyState';

export { Tooltip } from './Tooltip';

export { CopyButton } from './CopyButton';

export { StatusIndicator } from './StatusIndicator';
export type { Status } from './StatusIndicator';
