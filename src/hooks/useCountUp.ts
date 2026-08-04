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

export function useCountUp({ from, to, duration = 600, easing: easingType = 'ease-out' }: UseCountUpOptions) {
  // Start at `to` so SSR/prerender shows the final value (no "0" flash).
  // The animation runs only on the client after hydration.
  const [value, setValue] = useState(to);
  const rafRef = useRef(0);
  // Track the previous target so a refresh (e.g. Global Pulse's 60s poll)
  // animates from the OLD value to the NEW value, not from 0. Without this,
  // every data refresh re-animates the KPI from 0 → new total, which reads as
  // a jarring reset rather than a small delta.
  const prevToRef = useRef(to);

  useEffect(() => {
    // On client mount, jump to `from` then animate to `to`. On subsequent
    // updates (to changed), animate from the previous `to` so the count
    // rolls smoothly toward the new value.
    const start = from ?? prevToRef.current;
    setValue(start);
    const startTime = performance.now();
    function tick(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = ease(t, easingType);
      setValue(Math.round(start + (to - start) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    prevToRef.current = to;
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, duration, easingType]);

  return value;
}
