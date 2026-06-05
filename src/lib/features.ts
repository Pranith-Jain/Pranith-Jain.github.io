import { createContext, useContext } from 'react';

/**
 * Deployment feature flags for optional, self-hosted bridges.
 *
 * Some tools (the CAPE malware sandbox, the recon CLI bridge) only work
 * once an operator stands up their own backend and sets the matching
 * `*_BRIDGE_URL` secret on the Worker. Until then the routes return a
 * 503 setup hint — so there's no point advertising the tool in nav or
 * search. `FeaturesProvider` probes `GET /api/v1/features` once on load
 * and feeds the result through this context so the UI can hide dormant
 * tools.
 *
 * The probe returns only booleans (never the URLs/tokens), so it's safe
 * to call unauthenticated.
 *
 * The Provider component lives in `components/FeaturesProvider.tsx`; this
 * module stays component-free so Fast Refresh / react-refresh stays happy
 * (same split rationale as `components/dfir/tool-sections.ts`).
 */

export type FeatureFlag = 'cape' | 'recon' | 'samples';
export type Features = Record<FeatureFlag, boolean>;

export interface FeaturesState extends Features {
  /** True once the probe has resolved (success OR failure). */
  loaded: boolean;
}

/**
 * Default before the probe resolves: every gated tool is treated as
 * dormant (hidden). Hiding-then-revealing a configured tool is the safe
 * direction — better than flashing a tool we may immediately hide. This
 * is also the value returned when no provider is mounted (e.g. in unit
 * tests), so components degrade gracefully rather than throwing.
 *
 * `samples` is always-on (no secret required) but still defaults to
 * `false` until the probe resolves, matching the other flags' behaviour.
 */
export const DEFAULT_FEATURES: FeaturesState = { cape: false, recon: false, samples: false, loaded: false };

export const FeaturesContext = createContext<FeaturesState>(DEFAULT_FEATURES);

/**
 * Read the deployment feature flags. Tolerates a missing provider by
 * returning the all-dormant default, so components render fine in tests
 * and on routes that don't mount the provider.
 */
export function useFeatures(): FeaturesState {
  return useContext(FeaturesContext);
}

/**
 * A tool is visible unless it requires a flag that isn't enabled. Pure
 * helper so the render-side consumers (grid, inline search, command
 * palette) all gate identically.
 */
export function toolVisible(requiresFlag: FeatureFlag | undefined, features: Features): boolean {
  return !requiresFlag || features[requiresFlag];
}
