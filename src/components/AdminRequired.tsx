import { Lock } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Clean "admin access required" state for operator-only pages whose data API is
 * gated behind the admin token (observable-db, watches, investigations, etc.).
 * Render this instead of a scary "Failed to load" when `readAdminToken()` is
 * null, so a non-admin visitor gets a clear, intentional message + a way in.
 */
export function AdminRequired({ tool }: { tool: string }) {
  return (
    <div className="mx-auto max-w-lg px-6 py-20 text-center">
      <div
        className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800/60"
        aria-hidden="true"
      >
        <Lock className="h-6 w-6 text-slate-400" />
      </div>
      <h1 className="text-xl font-semibold text-slate-100">Admin access required</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        {tool} is an operator tool — its data is private to the platform admin. Sign in with your admin token to use it.
      </p>
      <Link
        to="/admin"
        className="mt-6 inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        Go to admin sign-in
      </Link>
    </div>
  );
}
