interface ScrollProgressProps {
  progress: number;
}

export function ScrollProgress({ progress }: ScrollProgressProps) {
  return (
    <div
      className="fixed top-0 left-0 z-[60] h-1 bg-gradient-to-r from-brand-400 via-brand-600 to-brand-800 dark:from-brand-300 dark:via-brand-500 dark:to-brand-700 shadow-[0_0_10px_rgba(44,62,229,0.5)] dark:shadow-[0_0_10px_rgba(67,94,241,0.3)] transition-all duration-150"
      style={{ width: `${progress}%` }}
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Page scroll progress"
    />
  );
}
