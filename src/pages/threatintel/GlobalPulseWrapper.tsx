import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Globe, RefreshCw, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class GlobalPulseErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('GlobalPulse error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[rgb(var(--surface-100))]">
          <div className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-600 flex items-center justify-center">
                  <Globe size={20} className="text-white" />
                </div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Global Pulse</h1>
              </div>
            </div>
          </div>
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 text-center">
            <AlertTriangle size={48} className="text-amber-400 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-2">Global Pulse is loading...</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              The 3D globe component encountered an error during rendering.
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-6">
              This is a known issue with the globe.gl 3D renderer. Try the 2D map view or refresh the page.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 flex items-center gap-2"
              >
                <RefreshCw size={14} /> Try Again
              </button>
              <Link
                to="/threatintel"
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50"
              >
                Threat Intel Home
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import { lazy, Suspense } from 'react';

const OriginalGlobalPulse = lazy(() => import('./GlobalPulse'));

export default function GlobalPulseWrapper() {
  return (
    <GlobalPulseErrorBoundary>
      <Suspense
        fallback={
          <div className="min-h-screen bg-[rgb(var(--surface-100))] flex items-center justify-center">
            <RefreshCw size={24} className="animate-spin text-slate-400" />
          </div>
        }
      >
        <OriginalGlobalPulse />
      </Suspense>
    </GlobalPulseErrorBoundary>
  );
}
