import { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  /**
   * No decorative background layer here, on purpose.
   *
   * This used to render its own pair of blurred brand blobs (a 500px pool
   * off the top-left, a 400px pool off the right edge) inside an
   * `overflow-x-clip` wrapper, and that was wrong three ways:
   *
   * 1. LIGHT MODE WAS NOT FLAT WHITE. `DESIGN.md` states the light canvas
   *    is deliberately flat white because a brand-tinted radial "read as an
   *    AI-slop ambient spotlight", and `BackgroundLayer` returns `null`
   *    when `!isDark` for exactly that reason. These two blobs had no
   *    `dark:` guard on the light half, so they painted a 10%-opacity
   *    brand wash over white anyway - a 500px pool bleeding in from the
   *    left edge and a 400px one from the right. The documented decision
   *    had been silently undone by a second component.
   *
   * 2. IT WAS THE THIRD POOL. `BackgroundLayer` already renders one
   *    dark-only pool at the top-left for the portfolio path, and the
   *    comment in that file is explicit: "One pool, one color, one corner.
   *    No second indigo pool, no noise overlay, no mesh." Between the two
   *    components the portfolio was painting three, which is the
   *    stage-light mesh the remove-ai-slop audit banned.
   *
   * 3. THE BLUR WAS NUKED ON MOBILE, turning a soft wash into a hard disc.
   *    `index.css` drops `filter` for `.blur-[120px]` / `.blur-[100px]`
   *    under 640px to save compositor time - a sensible intent, but on a
   *    500px `bg-brand-500/10` disc it means mobile renders a crisp-edged
   *    pale-blue circle straight through the hero headline instead of a
   *    soft falloff. Removing the blobs fixes the cause rather than
   *    pretending the disc is intentional.
   *
   * Ambient depth is now owned in one place: `BackgroundLayer`, dark mode
   * only, single pool. Nothing here needs clipping, so the `overflow-x-clip`
   * wrapper went with it and the document keeps its natural horizontal
   * scrolling for legitimately wide children (wide tables, long URLs, code
   * blocks).
   */
  return (
    <div className="min-h-screen relative" style={{ zIndex: 2 }}>
      {/* Content layer - no overflow rule, no per-layout page fill.
          The page bg comes from the html.dark body, so every Layout instance
          inherits the same navy page surface (--bg-base #070b1c + top glow)
          without re-stamping it. Children that legitimately exceed the viewport (wide tables,
          code blocks, long inline strings) trigger the document's native
          horizontal scroll on mobile so the user can pan to read them. */}
      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-10 sm:pt-14 sm:px-6">
        {/* Extra padding on mobile for bottom nav - AppShell has pb-16 but portfolio
      routes (Home, About, etc.) don't use AppShell so they need their own. */}
        <div className="pb-14 md:pb-0">{children}</div>
      </div>
    </div>
  );
}
