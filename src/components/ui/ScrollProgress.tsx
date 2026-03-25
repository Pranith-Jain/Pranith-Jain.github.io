interface ScrollProgressProps {
  progress: number;
}

export function ScrollProgress({ progress }: ScrollProgressProps) {
  return (
    <div
      className="fixed top-0 left-0 z-[60] h-1 bg-gradient-to-r from-neon-cyan via-brand-500 to-neon-pink shadow-glow-cyan transition-all duration-150"
      style={{ width: `${progress}%` }}
      aria-hidden="true"
    />
  );
}
