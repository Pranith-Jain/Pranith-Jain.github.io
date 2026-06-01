import { Suspense, type ReactNode } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

function SectionLoader() {
  return (
    <div className="min-h-[200px] flex items-center justify-center" aria-hidden="true">
      <div className="w-8 h-8 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
    </div>
  );
}

export function LazyRoute({ children }: { children: ReactNode }): JSX.Element {
  return (
    <ErrorBoundary>
      <Suspense fallback={<SectionLoader />}>{children}</Suspense>
    </ErrorBoundary>
  );
}
