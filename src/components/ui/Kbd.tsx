import type { ReactNode } from 'react';

interface KbdProps {
  /** The key or key combo to display, e.g. "⌘K", "Esc", "Shift+Tab". */
  children: ReactNode;
  className?: string;
}

/**
 * Standardized keyboard hint. Use this instead of hand-rolled <kbd> styles
 * so the key-cap look (border, surface, mono font, micro size) is consistent
 * across the command-palette hint, shortcut lists, and help text.
 *
 * @example
 * <Kbd>⌘K</Kbd>
 * <p>Press <Kbd>Esc</Kbd> to close.</p>
 */
export function Kbd({ children, className = '' }: KbdProps) {
  return <kbd className={`kbd ${className}`}>{children}</kbd>;
}
