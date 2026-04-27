import { Component, type ReactNode, type ErrorInfo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetOnChange?: boolean;
  className?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isExpanded: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isExpanded: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({
      error,
      errorInfo,
    });

    // Call onError callback if provided
    this.props.onError?.(error, errorInfo);

    // Log error for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  componentDidUpdate(prevProps: Props): void {
    // Reset error state when children change
    if (this.props.resetOnChange && prevProps.children !== this.props.children) {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
      });
    }
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      isExpanded: false,
    });
  };

  toggleDetails = (): void => {
    this.setState((prev) => ({
      isExpanded: !prev.isExpanded,
    }));
  };

  render(): ReactNode {
    const { hasError, error, errorInfo, isExpanded } = this.state;
    const { children, fallback } = this.props;

    if (hasError && error) {
      if (fallback) {
        return fallback;
      }

      return (
        <ErrorFallback
          error={error}
          errorInfo={errorInfo}
          isExpanded={isExpanded}
          onReset={this.handleReset}
          onToggleDetails={this.toggleDetails}
        />
      );
    }

    return children;
  }
}

interface ErrorFallbackProps {
  error: Error;
  errorInfo: ErrorInfo | null;
  isExpanded: boolean;
  onReset: () => void;
  onToggleDetails: () => void;
}

function ErrorFallback({ error, errorInfo, isExpanded, onReset, onToggleDetails }: ErrorFallbackProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full p-6 rounded-2xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/30"
    >
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-rose-800 dark:text-rose-200 mb-1">Something went wrong</h3>
          <p className="text-sm text-rose-600 dark:text-rose-300 mb-4">
            {error.message || 'An unexpected error occurred. The error has been logged.'}
          </p>

          {/* Error Details (collapsible) */}
          <button
            onClick={onToggleDetails}
            className="flex items-center gap-2 text-xs text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 transition-colors mb-3"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {isExpanded ? 'Hide' : 'Show'} error details
          </button>

          <AnimatePresence>
            {isExpanded && errorInfo && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-3 rounded-lg bg-slate-900 dark:bg-black/50 text-left">
                  <div className="text-[10px] font-mono text-rose-300 mb-2 uppercase tracking-wider">Stack Trace</div>
                  <pre className="text-[10px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
                    {error.stack}
                  </pre>
                  {errorInfo.componentStack && (
                    <>
                      <div className="text-[10px] font-mono text-rose-300 mt-3 mb-2 uppercase tracking-wider">
                        Component Stack
                      </div>
                      <pre className="text-[10px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap break-all max-h-32">
                        {errorInfo.componentStack}
                      </pre>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={onReset}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
            <a
              href="#top"
              onClick={onReset}
              className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Home className="w-4 h-4" />
              Go Home
            </a>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Hook to use error boundary functionality in function components
import { useState, useCallback } from 'react';

export function useErrorBoundary() {
  const [error, setError] = useState<Error | null>(null);

  const resetError = useCallback(() => {
    setError(null);
  }, []);

  const throwError = useCallback((err: Error) => {
    setError(err);
    throw err;
  }, []);

  const ErrorComponent = useCallback(
    ({ children }: { children: ReactNode }) => {
      if (error) {
        return (
          <ErrorFallback
            error={error}
            errorInfo={null}
            isExpanded={false}
            onReset={resetError}
            onToggleDetails={() => {}}
          />
        );
      }
      return <>{children}</>;
    },
    [error, resetError]
  );

  return {
    error,
    throwError,
    resetError,
    ErrorComponent,
  };
}

// Lazy loading wrapper with error boundary
export function withErrorBoundary<P extends object>(WrappedComponent: React.ComponentType<P>, fallback?: ReactNode) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

// Section-specific error boundaries
export function SectionErrorBoundary({ sectionName, children }: { sectionName: string; children: ReactNode }) {
  const handleError = useCallback(
    (error: Error, errorInfo: ErrorInfo) => {
      // Log section-specific errors
      console.error(`Error in ${sectionName}:`, error, errorInfo);
    },
    [sectionName]
  );

  return (
    <ErrorBoundary
      onError={handleError}
      fallback={
        <div className="w-full p-8 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-2">{sectionName} Section</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            This section encountered an error and couldn't load.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">The rest of the page is still functional.</p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
