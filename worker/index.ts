import apiApp from '../api/src/index';
import type { Env as ApiEnv } from '../api/src/env';

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  // Forward-declare bindings that may be added later
  KV_CACHE?: KVNamespace;
  KV_SHARES?: KVNamespace;
  R2_FILES?: R2Bucket;
  // Provider secrets
  VT_API_KEY?: string;
  ABUSEIPDB_API_KEY?: string;
  SHODAN_API_KEY?: string;
  GREYNOISE_API_KEY?: string;
  OTX_API_KEY?: string;
  URLSCAN_API_KEY?: string;
  HYBRID_ANALYSIS_API_KEY?: string;
  PULSEDIVE_API_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      // Hono app handles routing; cast env to bridge the optional vs required bindings.
      // Route handlers use ?? '' fallbacks so optional bindings are safe at runtime.
      return apiApp.fetch(request, env as unknown as ApiEnv, ctx);
    }
    // Fall through to static assets (SPA)
    return env.ASSETS.fetch(request);
  },
};
