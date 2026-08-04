import type { ReactNode } from 'react';
import { AsyncState } from './AsyncState';

export interface DataStateProps {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyLabel?: string;
  /** Optional icon for the empty state (defaults to Inbox). */
  emptyIcon?: ReactNode;
  /** Optional CTA rendered below the empty label. */
  emptyAction?: ReactNode;
  /** Optional hint shown below the error message (root-cause context). */
  errorHint?: string;
  rows?: number;
  /** Skeleton shape variant — matches the content layout so loading previews structure. */
  skeletonVariant?: 'list' | 'table' | 'cards';
  onRetry?: () => void;
  children?: ReactNode;
}

export function DataState({
  loading,
  error,
  empty,
  emptyLabel,
  emptyIcon,
  emptyAction,
  errorHint,
  rows = 5,
  skeletonVariant = 'list',
  onRetry,
  children,
}: DataStateProps): JSX.Element {
  return (
    <AsyncState
      loading={loading}
      error={error}
      empty={empty}
      emptyLabel={emptyLabel}
      emptyIcon={emptyIcon}
      emptyAction={emptyAction}
      errorHint={errorHint}
      skeletonRows={rows}
      skeletonVariant={skeletonVariant}
      onRetry={onRetry}
    >
      {children}
    </AsyncState>
  );
}
