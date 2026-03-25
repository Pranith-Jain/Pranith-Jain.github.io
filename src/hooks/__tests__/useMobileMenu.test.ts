import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMobileMenu } from '../useMobileMenu'

describe('useMobileMenu', () => {
  beforeEach(() => {
    document.body.style.overflow = ''
  })

  afterEach(() => {
    document.body.style.overflow = ''
    vi.clearAllMocks()
  })

  it('should initialize with menu closed', () => {
    const { result } = renderHook(() => useMobileMenu())

    expect(result.current.isOpen).toBe(false)
  })

  it('should toggle menu open', () => {
    const { result } = renderHook(() => useMobileMenu())

    act(() => {
      result.current.toggle()
    })

    expect(result.current.isOpen).toBe(true)
  })

  it('should toggle menu closed when open', () => {
    const { result } = renderHook(() => useMobileMenu())

    act(() => {
      result.current.toggle()
    })
    expect(result.current.isOpen).toBe(true)

    act(() => {
      result.current.toggle()
    })
    expect(result.current.isOpen).toBe(false)
  })

  it('should close menu', () => {
    const { result } = renderHook(() => useMobileMenu())

    act(() => {
      result.current.toggle()
    })
    expect(result.current.isOpen).toBe(true)

    act(() => {
      result.current.close()
    })
    expect(result.current.isOpen).toBe(false)
  })

  it('should prevent body scroll when menu is open', () => {
    const { result } = renderHook(() => useMobileMenu())

    act(() => {
      result.current.toggle()
    })

    expect(document.body.style.overflow).toBe('hidden')
  })

  it('should restore body scroll when menu is closed', () => {
    const { result } = renderHook(() => useMobileMenu())

    act(() => {
      result.current.toggle()
    })
    expect(document.body.style.overflow).toBe('hidden')

    act(() => {
      result.current.close()
    })
    expect(document.body.style.overflow).toBe('')
  })

  it('should close menu on escape key', () => {
    const { result } = renderHook(() => useMobileMenu())

    act(() => {
      result.current.toggle()
    })
    expect(result.current.isOpen).toBe(true)

    act(() => {
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' })
      document.dispatchEvent(escapeEvent)
    })

    expect(result.current.isOpen).toBe(false)
  })

  it('should clean up event listener and body style on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')

    const { result, unmount } = renderHook(() => useMobileMenu())

    act(() => {
      result.current.toggle()
    })

    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(document.body.style.overflow).toBe('')
  })

  it('should not close on escape when menu is closed', () => {
    const { result } = renderHook(() => useMobileMenu())

    expect(result.current.isOpen).toBe(false)

    act(() => {
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' })
      document.dispatchEvent(escapeEvent)
    })

    expect(result.current.isOpen).toBe(false)
  })
})
