import { Globe, ExternalLink } from 'lucide-react';

export default function ArgusPage() {
  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4">
      <div className="mx-auto max-w-lg text-center">
        <div className="mb-6 flex justify-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-rose-500/10">
            <Globe className="h-8 w-8 text-rose-600" />
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">ARGUS</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Nation-State Threat Intelligence Dashboard</p>
        <p className="mt-6 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          ARGUS is a standalone threat intelligence dashboard with 3D globe visualization, actor dossiers, D3
          relationship graphs, and live threat feeds.
        </p>
        <a
          href="/threatnexus"
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700"
        >
          Open ARGUS
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
