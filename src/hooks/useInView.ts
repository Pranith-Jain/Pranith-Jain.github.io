import { useState, useEffect, useRef, useCallback } from 'react';

interface UseInViewOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
}

export function useInView<T extends HTMLElement = HTMLDivElement>(
  options: UseInViewOptions = {}
): [React.RefCallback<T>, boolean] {
  const { threshold = 0.1, rootMargin = '0px 0px -50px 0px', triggerOnce = true } = options;
  const [isInView, setIsInView] = useState(false);
  const elRef = useRef<T | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const triggerOnceRef = useRef(triggerOnce);
  triggerOnceRef.current = triggerOnce;

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    if (observerRef.current) observerRef.current.disconnect();

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry!.isIntersecting) {
          setIsInView(true);
          if (triggerOnceRef.current) observer.unobserve(el);
        } else if (!triggerOnceRef.current) {
          setIsInView(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(el);
    observerRef.current = observer;

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin]);

  const ref = useCallback((node: T | null) => {
    elRef.current = node;
  }, []);

  return [ref, isInView];
}
