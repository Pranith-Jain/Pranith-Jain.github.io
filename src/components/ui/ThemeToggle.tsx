interface ThemeToggleProps {
  isDark: boolean;
  onToggle: () => void;
}

/**
 * Editorial theme toggle — a "Light / Dark" pair where the active mode is
 * rendered in the accent ink-blue and the inactive one is muted ink-3.
 * Single button so screen readers and keyboard users get one focusable
 * target; the visual treatment is two side-by-side spans.
 *
 * Per docs/superpowers/specs/2026-05-12-portfolio-editorial-redesign-design.md
 * (Header section). Replaces the previous Sun/Moon icon button.
 */
export function ThemeToggle({ isDark, onToggle }: ThemeToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-baseline gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span className={isDark ? 'text-ink-3' : 'text-accent'}>Light</span>
      <span aria-hidden="true" className="text-ink-3">
        /
      </span>
      <span className={isDark ? 'text-accent' : 'text-ink-3'}>Dark</span>
    </button>
  );
}
