import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useScrollProgress } from '../useScrollProgress'

describe('useScrollProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock window properties
    Object.defineProperty(window, 'scrollY', {
      writable: true,
      configurable: true,
      value: 0,
    })
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 800,
    })
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      writable: true,
      configurable: true,
      value: 2000,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should initialize with zero progress', () => {
    const { result } = renderHook(() => useScrollProgress())

    expect(result.current.progress).toBe(0)
    expect(result.current.showBackToTop).toBe(false)
  })

  it('should provide scrollToTop function', () => {
    const { result } = renderHook(() => useScrollProgress())

    expect(typeof result.current.scrollToTop).toBe('function')

    result.current.scrollToTop()

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'smooth',
    })
  })

  it('should handle zero scroll height', () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      writable: true,
      configurable: true,
      value: 800,
    })
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 800,
    })

    const { result } = renderHook(() => useScrollProgress())

    // Should not throw and progress should be 0
    expect(result.current.progress).toBe(0)
  })

  it('should clean up event listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => useScrollProgress())

    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function))
  })

  it('should use passive event listener for better performance', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')

    renderHook(() => useScrollProgress())

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
      { passive: true }
    )
  })
})
