import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

const ARGUS_URL = 'https://argus-threat-intel.pages.dev/';

export default function ArgusPage() {
  useEffect(() => {
    window.location.href = ARGUS_URL;
  }, []);

  // Show an explicit redirect affordance instead of a blank page: if the
  // external host is slow or the JS redirect stalls, the user still sees
  // context and a manual link rather than what looks like a dead page.
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="surface-card flex max-w-md flex-col items-center gap-4 p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600 dark:text-brand-400" aria-hidden="true" />
        <div>
          <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">Redirecting to Argus</h1>
          <p className="mt-1 text-tool text-slate-500 dark:text-slate-400" role="status">
            Taking you to the Argus threat-intel app…
          </p>
        </div>
        <a
          href={ARGUS_URL}
          className="text-tool font-medium text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
        >
          Continue manually if you're not redirected
        </a>
      </div>
    </div>
  );
}
