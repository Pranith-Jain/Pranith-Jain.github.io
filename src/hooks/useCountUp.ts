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
  const [value, setValue] = useState(from);
  const prevTo = useRef(from);
  const rafRef = useRef(0);

  useEffect(() => {
    const startFrom = prevTo.current;
    prevTo.current = to;
    if (startFrom === to) {
      setValue(to);
      return;
    }
    const startTime = performance.now();
    function tick(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = ease(t, easingType);
      setValue(Math.round(startFrom + (to - startFrom) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [to, duration, easingType]);

  return value;
}
