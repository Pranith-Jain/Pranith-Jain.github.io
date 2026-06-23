import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';

interface TooltipProps {
  /** Tooltip content */
  content: ReactNode;
  /** Child element to attach tooltip to */
  children: ReactNode;
  /** Tooltip position */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Delay before showing (ms) */
  delay?: number;
  /** Additional CSS classes for tooltip */
  className?: string;
}

const POSITION_STYLES = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

/**
 * Accessible tooltip component.
 * Shows additional information on hover/focus with proper ARIA attributes.
 *
 * @example
 * <Tooltip content="This is a tooltip">
 *   <button>Hover me</button>
 * </Tooltip>
 */
export function Tooltip({ content, children, position = 'top', delay = 200, className = '' }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tooltipId = useRef(`tooltip-${Math.random().toString(36).slice(2, 9)}`);

  const showTooltip = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  }, [delay]);

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // WCAG 1.4.13: hover/focus content must be dismissible without moving the
  // pointer or focus. Allow Escape to clear a visible tooltip.
  useEffect(() => {
    if (!isVisible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hideTooltip();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isVisible, hideTooltip]);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      <div aria-describedby={isVisible ? tooltipId.current : undefined}>{children}</div>
      {isVisible && (
        <div
          id={tooltipId.current}
          role="tooltip"
          className={`
            absolute z-50 px-2 py-1 text-xs font-medium text-white
            bg-slate-900 dark:bg-slate-700 rounded-md shadow-e2
            whitespace-nowrap pointer-events-none
            animate-pop-in
            ${POSITION_STYLES[position]}
            ${className}
          `}
        >
          {content}
          <div
            className={`
              absolute w-2 h-2 bg-slate-900 dark:bg-slate-700 rotate-45
              ${position === 'top' ? 'bottom-[-4px] left-1/2 -translate-x-1/2' : ''}
              ${position === 'bottom' ? 'top-[-4px] left-1/2 -translate-x-1/2' : ''}
              ${position === 'left' ? 'right-[-4px] top-1/2 -translate-y-1/2' : ''}
              ${position === 'right' ? 'left-[-4px] top-1/2 -translate-y-1/2' : ''}
            `}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}
