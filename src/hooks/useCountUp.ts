import { useState, useRef, useEffect } from 'react';

export interface UseCountUpOptions {
  from?: number;
  to: number;
  duration?: number;
  easing?: 'linear' | 'ease-out' | 'ease-in-out';
}

function ease(t: number, type: string): number {
  switch (type) {
    case 'ease-out':
      return 1 - Math.pow(1 - t, 3);
    case 'ease-in-out':
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    default:
      return t;
  }
}

export function useCountUp({ from = 0, to, duration = 600, easing: easingType = 'ease-out' }: UseCountUpOptions) {
  // Start at `to` so SSR/prerender shows the final value (no "0" flash).
  // The animation runs only on the client after hydration.
  const [value, setValue] = useState(to);
  const rafRef = useRef(0);

  useEffect(() => {
    // On client mount, jump to `from` then animate to `to`.
    setValue(from);
    const startTime = performance.now();
    function tick(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = ease(t, easingType);
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, duration, easingType]);

  return value;
}
