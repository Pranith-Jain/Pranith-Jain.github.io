import { useEffect, useRef, useCallback } from 'react';

interface UseFocusTrapOptions {
  isActive: boolean;
  onEscape?: () => void;
}

/**
 * Hook to trap focus within a container element (for modals, mobile menus, etc.)
 * Implements proper focus management for accessibility
 */
export function useFocusTrap({ isActive, onEscape }: UseFocusTrapOptions) {
  const containerRef = useRef<HTMLElement | null>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

  const getFocusableElements = useCallback(() => {
    if (!containerRef.current) return [];

    const focusableSelectors = [
      'button:not([disabled])',
      'a[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      'summary',
    ].join(', ');

    return Array.from(containerRef.current.querySelectorAll(focusableSelectors)) as HTMLElement[];
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isActive || !containerRef.current) return;

      // Handle Escape key
      if (e.key === 'Escape' && onEscape) {
        e.preventDefault();
        onEscape();
        return;
      }

      // Handle Tab key for focus trapping
      if (e.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0]!;
      const lastElement = focusableElements[focusableElements.length - 1]!;
      const activeElement = document.activeElement as HTMLElement;

      // Shift + Tab on first element -> move to last
      if (e.shiftKey && activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
      // Tab on last element -> move to first
      else if (!e.shiftKey && activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    },
    [isActive, onEscape, getFocusableElements]
  );

  // Capture + restore focus. Keyed ONLY on isActive (getFocusableElements is a
  // stable useCallback) so a changing `onEscape`/`handleKeyDown` identity — e.g.
  // the inline arrows in Drawer/CommandPalette — can't re-run this effect and
  // yank focus back to the trigger while the overlay is still open.
  useEffect(() => {
    if (!isActive) return;
    previouslyFocusedElement.current = document.activeElement as HTMLElement;
    const focusableElements = getFocusableElements();
    const t = focusableElements.length > 0 ? setTimeout(() => focusableElements[0]?.focus(), 0) : undefined;
    return () => {
      if (t) clearTimeout(t);
      previouslyFocusedElement.current?.focus();
    };
  }, [isActive, getFocusableElements]);

  // Keydown listener is re-attached when handleKeyDown changes, but never
  // touches focus capture/restore — so identity churn is harmless here.
  useEffect(() => {
    if (!isActive) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isActive, handleKeyDown]);

  return containerRef;
}
