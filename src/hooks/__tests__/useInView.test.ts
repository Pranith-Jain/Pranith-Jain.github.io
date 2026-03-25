import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useInView } from '../useInView'

describe('useInView', () => {
  let mockObserve: ReturnType<typeof vi.fn>
  let mockDisconnect: ReturnType<typeof vi.fn>
  let mockUnobserve: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockObserve = vi.fn()
    mockDisconnect = vi.fn()
    mockUnobserve = vi.fn()

    ;(globalThis as typeof globalThis & { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver = vi.fn().mockImplementation(() => {
      return {
        observe: mockObserve,
        disconnect: mockDisconnect,
        unobserve: mockUnobserve,
      }
    }) as unknown as typeof IntersectionObserver
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should initialize with isInView as false', () => {
    const { result } = renderHook(() => useInView())
    const [, isInView] = result.current

    expect(isInView).toBe(false)
  })

  it('should return a ref object', () => {
    const { result } = renderHook(() => useInView())
    const [ref] = result.current

    expect(ref).toHaveProperty('current')
  })

  it('should create IntersectionObserver with correct options', () => {
    renderHook(() =>
      useInView({
        threshold: 0.5,
        rootMargin: '10px',
        triggerOnce: false,
      })
    )

    expect((globalThis as typeof globalThis & { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver).toHaveBeenCalledWith(
      expect.any(Function),
      {
        threshold: 0.5,
        rootMargin: '10px',
      }
    )
  })

  it('should use default options when none provided', () => {
    renderHook(() => useInView())

    expect((globalThis as typeof globalThis & { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver).toHaveBeenCalledWith(
      expect.any(Function),
      {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px',
      }
    )
  })

  it('should disconnect observer on unmount', () => {
    const { unmount } = renderHook(() => useInView())

    unmount()

    expect(mockDisconnect).toHaveBeenCalled()
  })

  it('should handle null ref gracefully', () => {
    // Should not throw when ref is null
    expect(() => renderHook(() => useInView())).not.toThrow()
  })
})
