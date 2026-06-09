import { useState, useEffect, useRef, type RefObject } from 'react';

interface UseInViewOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
}

export function useInView<T extends HTMLElement = HTMLDivElement>(
  options: UseInViewOptions = {}
): [RefObject<T | null>, boolean] {
  const { threshold = 0.1, rootMargin = '0px 0px -50px 0px', triggerOnce = true } = options;
  const [isInView, setIsInView] = useState(false);
  const ref = useRef<T>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const triggerOnceRef = useRef(triggerOnce);
  triggerOnceRef.current = triggerOnce;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (observerRef.current) observerRef.current.disconnect();

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
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

  return [ref, isInView];
}
