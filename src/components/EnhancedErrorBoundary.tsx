import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, AlertCircle, ExternalLink } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  sectionName?: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class EnhancedErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error(`ErrorBoundary [${this.props.sectionName || 'Unknown'}]:`, error, errorInfo.componentStack);
    this.props.onError?.(error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[200px] flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center">
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-900/30 mb-4">
                <AlertTriangle className="w-8 h-8 text-rose-600 dark:text-rose-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                {this.props.sectionName ? `${this.props.sectionName} encountered an error` : 'Something went wrong'}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                We apologize for the inconvenience. This section encountered an error.
              </p>
              {this.state.error && (
                <details className="text-left mt-4 p-4 rounded-lg bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10">
                  <summary className="text-xs font-semibold text-slate-500 dark:text-slate-400 cursor-pointer">
                    Error Details
                  </summary>
                  <pre className="mt-2 text-xs text-rose-600 dark:text-rose-400 whitespace-pre-wrap break-words font-mono">
                    {this.state.error.message}
                  </pre>
                </details>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-500 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
              <a
                href="https://github.com/Pranith-Jain/Pranith-Jain.github.io/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <AlertCircle className="w-4 h-4" />
                Report Issue
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  sectionName: string,
  onError?: (error: Error, errorInfo: ErrorInfo) => void
) {
  return function WrappedComponent(props: P) {
    return (
      <EnhancedErrorBoundary sectionName={sectionName} onError={onError}>
        <Component {...props} />
      </EnhancedErrorBoundary>
    );
  };
}
