import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook } from '@testing-library/react';
import { createElement, useEffect } from 'react';
import { useInView } from '../useInView';

/**
 * `useInView` only constructs an IntersectionObserver when its ref is attached to a
 * real DOM element. `renderHook` doesn't render any DOM, so we wrap the hook in a
 * tiny component that mounts a div with the ref to exercise the effect.
 */
function HarnessFactory(opts?: Parameters<typeof useInView>[0]) {
  return function Harness() {
    const [ref] = useInView(opts);
    useEffect(() => {
      // No-op: just ensure the effect runs; ref is attached via the JSX below.
    }, []);
    return createElement('div', { ref });
  };
}

describe('useInView', () => {
  let mockObserve: ReturnType<typeof vi.fn>;
  let mockDisconnect: ReturnType<typeof vi.fn>;
  let mockUnobserve: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockObserve = vi.fn();
    mockDisconnect = vi.fn();
    mockUnobserve = vi.fn();

    // Must be a *constructable* function — the hook calls `new IntersectionObserver(...)`,
    // and arrow functions can't be used with `new` (vitest v4/tinyspy throws "not a constructor").
    (globalThis as typeof globalThis & { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
      vi.fn(function (this: {
        observe: typeof mockObserve;
        disconnect: typeof mockDisconnect;
        unobserve: typeof mockUnobserve;
      }) {
        this.observe = mockObserve;
        this.disconnect = mockDisconnect;
        this.unobserve = mockUnobserve;
      }) as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with isInView as false', () => {
    const { result } = renderHook(() => useInView());
    const [, isInView] = result.current;
    expect(isInView).toBe(false);
  });

  it('should return a ref callback', () => {
    // The hook returns [refCallback, isInView]. The ref is a function
    // (React's callback-ref API) that, when invoked, attaches the node.
    const { result } = renderHook(() => useInView());
    const [ref] = result.current;
    expect(typeof ref).toBe('function');
    // Calling the ref with a node should not throw and should make the
    // node available to the IntersectionObserver (asserted by the
    // "should create IntersectionObserver with correct options" test).
    expect(() => ref(document.createElement('div'))).not.toThrow();
  });

  it('should create IntersectionObserver with correct options', () => {
    const Harness = HarnessFactory({ threshold: 0.5, rootMargin: '10px', triggerOnce: false });
    render(createElement(Harness));
    expect(
      (globalThis as typeof globalThis & { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver
    ).toHaveBeenCalledWith(expect.any(Function), { threshold: 0.5, rootMargin: '10px' });
  });

  it('should use default options when none provided', () => {
    const Harness = HarnessFactory();
    render(createElement(Harness));
    expect(
      (globalThis as typeof globalThis & { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver
    ).toHaveBeenCalledWith(expect.any(Function), { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
  });

  it('should disconnect observer on unmount', () => {
    const Harness = HarnessFactory();
    const { unmount } = render(createElement(Harness));
    unmount();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('should handle null ref gracefully', () => {
    expect(() => renderHook(() => useInView())).not.toThrow();
  });
});
