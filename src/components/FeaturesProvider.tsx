import { useEffect, useState, type ReactNode } from 'react';
import { FeaturesContext, DEFAULT_FEATURES, type Features } from '../lib/features';

/**
 * Probes `GET /api/v1/features` once on mount and publishes the result
 * through `FeaturesContext`. Mounted near the app root so every route
 * (and the global command palette) can hide dormant self-hosted tools.
 * See `lib/features.ts` for the context, hook, and rationale.
 */
export function FeaturesProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState(DEFAULT_FEATURES);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/features')
      .then((r) => (r.ok ? (r.json() as Promise<Partial<Features>>) : null))
      .then((data) => {
        if (cancelled) return;
        // `samples` is always-on server-side (no secret) but defaults to
        // false here until the probe resolves, so dormant-gated tools and
        // always-on tools both flash the same "loading" UX and reveal
        // themselves only after the probe settles.
        setState({
          samples: Boolean(data?.samples),
          loaded: true,
        });
      })
      .catch(() => {
        // Network/parse failure: leave flags dormant but mark loaded so
        // page guards can act (a misconfigured probe shouldn't strand the
        // dormant pages as visible forever).
        if (!cancelled) setState((s) => ({ ...s, loaded: true }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <FeaturesContext value={state}>{children}</FeaturesContext>;
}
