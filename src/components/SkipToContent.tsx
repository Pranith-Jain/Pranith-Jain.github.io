/**
 * Skip-to-main-content link. Hidden until focused (Tab from page load),
 * then visually positioned in the top-left for keyboard users.
 *
 * Pure CSS visibility — no JS state — so browsers that natively focus the
 * link (Safari, screen readers) show it immediately rather than after a
 * stateful Tab handler fires.
 */
export function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="
        sr-only focus:not-sr-only
        focus:fixed focus:top-4 focus:left-4 focus:z-[100]
        focus:px-4 focus:py-2
        focus:bg-brand-600 focus:text-white
        focus:rounded-lg focus:font-medium focus:text-sm
        focus:shadow-lg
        focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2
      "
    >
      Skip to main content
    </a>
  );
}
