/**
 * Suspense fallback used inside <Suspense fallback={<TabLoader />}> blocks
 * on pages that lazy-import their tab content.
 *
 * The previous design had each page (ActorDirectory, SourceHealth, …) define
 * its own private TabFallback function - eight identical copies of the same
 * ~6-line spinner. They were unified here.
 */
import { Loader2 } from 'lucide-react';

export function TabLoader() {
  return (
    // `min-h-[22rem]` reserves roughly the height of a rendered table so the
    // Suspense boundary does not collapse to a 96px spinner and then push the
    // whole page down when the lazy chunk lands. That collapse-then-expand was
    // the largest remaining layout shift on tabbed pages — the card below the
    // tabpanel (and everything below that) moved every time a tab resolved.
    // The spinner is centred inside the reserved box rather than the box
    // growing around it, so the reservation is what holds, not the content.
    <div className="flex items-center justify-center min-h-[22rem] py-12">
      <Loader2 size={20} className="animate-spin text-muted mr-2" />
      <span className="text-sm font-mono text-muted">Loading…</span>
    </div>
  );
}

export default TabLoader;
