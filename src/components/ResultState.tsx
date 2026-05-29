import type { ReactNode } from 'react';
import { AsyncState } from './AsyncState';

export interface ResultStateProps {
  submitted: boolean;
  loading?: boolean;
  error?: string | null;
  hasResult?: boolean;
  idle?: ReactNode;
  emptyLabel?: string;
  rows?: number;
  onRetry?: () => void;
  children: ReactNode;
}

export function ResultState({
  submitted,
  loading,
  error,
  hasResult,
  idle,
  emptyLabel,
  rows = 5,
  onRetry,
  children,
}: ResultStateProps): JSX.Element {
  return (
    <AsyncState
      idle={!submitted}
      idleContent={idle}
      loading={loading}
      error={error}
      empty={submitted && !loading && !error && hasResult === false}
      emptyLabel={emptyLabel}
      skeletonRows={rows}
      onRetry={onRetry}
    >
      {children}
    </AsyncState>
  );
}
