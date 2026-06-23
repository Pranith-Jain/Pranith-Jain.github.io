import { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  /**
   * Two siblings instead of nested. The decorative blobs are positioned
   * `absolute` with translate values that push past the viewport's right
   * edge, so they need clipping to stop them from creating document-level
   * horizontal scroll. The actual page content should NOT be clipped —
   * if a child (a wide table, a long URL, a code block) overflows the
   * viewport on mobile, the user must be able to scroll horizontally to
   * see it.
   *
   * Previous version put both blobs and content inside one wrapper with
   * `overflow-x-clip`. That clipped the blobs (correct) AND silently
   * clipped any legitimately-wide content (bug — user reported "can't
   * see right side of the page on mobile"). Now the clip is scoped to
   * just the blob layer, and the content sits as a sibling without
   * any horizontal-overflow rule, so the document's natural scrolling
   * applies if needed.
   */
  return (
    <div className="min-h-screen relative" style={{ zIndex: 2 }}>
      {/* Blob layer — its own overflow-x-clip so the absolutely-positioned
          blobs that translate past the viewport don't trigger document
          scroll. Pointer-events-none so this layer never catches input. */}
      <div className="pointer-events-none absolute inset-0 overflow-x-clip">
        <div className="pointer-events-none absolute left-0 top-0 -z-10 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/10 blur-[120px] dark:bg-brand-500/5"></div>
        <div className="pointer-events-none absolute right-0 top-1/4 -z-10 h-[400px] w-[400px] translate-x-1/2 rounded-full bg-brand-600/10 blur-[100px] dark:bg-brand-600/5"></div>
      </div>

      {/* Content layer — no overflow rule, no per-layout page fill.
          The page bg comes from the html.dark body, so every Layout instance
          inherits the same Geist page surface (#0a0a0f) without re-stamping
          it. Children that legitimately exceed the viewport (wide tables,
          code blocks, long inline strings) trigger the document's native
          horizontal scroll on mobile so the user can pan to read them. */}
      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-10 sm:pt-14 sm:px-6">
  {/* Extra padding on mobile for bottom nav — AppShell has pb-16 but portfolio
      routes (Home, About, etc.) don't use AppShell so they need their own. */}
  <div className="pb-14 md:pb-0">{children}</div>
</div>
    </div>
  );
}
