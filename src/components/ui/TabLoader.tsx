/**
 * Suspense fallback used inside <Suspense fallback={<TabLoader />}> blocks
 * on pages that lazy-import their tab content.
 *
 * The previous design had each page (ActorDirectory, SourceHealth, …) define
 * its own private TabFallback function — eight identical copies of the same
 * ~6-line spinner. They were unified here.
 */
import { Loader2 } from 'lucide-react';

export function TabLoader() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-slate-400 mr-2" />
      <span className="text-sm font-mono text-slate-500">Loading…</span>
    </div>
  );
}

export default TabLoader;
