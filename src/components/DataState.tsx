import type { ReactNode } from 'react';
import { AsyncState } from './AsyncState';

export interface DataStateProps {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyLabel?: string;
  rows?: number;
  onRetry?: () => void;
  children?: ReactNode;
}

export function DataState({
  loading,
  error,
  empty,
  emptyLabel,
  rows = 5,
  onRetry,
  children,
}: DataStateProps): JSX.Element {
  return (
    <AsyncState
      loading={loading}
      error={error}
      empty={empty}
      emptyLabel={emptyLabel}
      skeletonRows={rows}
      onRetry={onRetry}
    >
      {children}
    </AsyncState>
  );
}
