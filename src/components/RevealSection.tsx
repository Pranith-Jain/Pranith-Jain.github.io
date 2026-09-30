import { useInView } from '../hooks/useInView';

/**
 * Fade/slide-up wrapper that animates its children in the first time they
 * scroll into view. Shared by the portfolio home and the tools home so the
 * two surfaces scroll identically.
 */
export function RevealSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const [ref, inView] = useInView({ threshold: 0.1 });
  return (
    <div
      ref={ref}
      className={`transition-all duration-500 ease-out motion-reduce:transition-none ${
        inView
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-6 motion-reduce:opacity-100 motion-reduce:translate-y-0'
      } ${className}`}
    >
      {children}
    </div>
  );
}
