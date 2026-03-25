interface ScrollProgressProps {
  progress: number;
}

export function ScrollProgress({ progress }: ScrollProgressProps) {
  return (
    <div
      className="fixed top-0 left-0 z-[60] h-1 bg-gradient-to-r from-cyan-400 via-brand-500 to-pink-500 shadow-[0_0_10px_rgba(44,62,229,0.5)] transition-all duration-150"
      style={{ width: `${progress}%` }}
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Page scroll progress"
    />
  );
}
