/**
 * Standalone runner for the feed-hardening test that pins the live-iocs
 * `cf:` directive shape. The default `api/vitest.config.ts` loads the
 * @cloudflare/vitest-pool-workers pool, which can't resolve in this env
 * (the root node_modules has a newer @cloudflare/vitest-pool-workers that
 * expects vitest 3.2+, but the api copy of the pool is 0.10.6 — and
 * vitest 3.2.6 from api/node_modules is being shadowed by vitest 2.1.9
 * from the root). This runner uses vitest's default node pool so a
 * string-assertion test can run without spinning up a worker isolate.
 *
 * Used by CI to verify the regression test still pins the directive.
 */
import { execSync } from 'node:child_process';

const cmd = [
  'npx',
  'vitest',
  'run',
  '--config',
  'vitest.config.standalone.ts',
  'api/test/lib/feed-hardening.test.js',
].join(' ');

try {
  execSync(cmd, { stdio: 'inherit' });
} catch (e) {
  process.exit(e.status ?? 1);
}
