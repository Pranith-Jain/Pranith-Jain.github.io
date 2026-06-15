/**
 * Shared test helpers.
 *
 * - `withTestApiKey()`: returns a `fetch`-shaped wrapper that injects a
 *   valid `Authorization: Bearer <key>` header. Use it for tests that
 *   hit POST/DELETE routes under `/api/v1/*` — `authenticate('external-only')`
 *   lets GET/HEAD/OPTIONS through without a key but requires one for
 *   mutations. See `src/lib/auth.ts:108-114` for the read-passthrough.
 *
 * The D1 backing the auth middleware is reset between tests by the
 * vitest-pool-workers harness, so we cannot cache the key in `globalThis`
 * — the row would be gone by the next test. Each call re-inserts a fresh
 * `vitest-suite` key (idempotent CREATE + DELETE-by-label).
 */
import { env as testEnv, SELF } from 'cloudflare:test';
import { generateApiKey } from '../src/lib/auth';
const testEnvTyped = testEnv;
async function ensureApiKey() {
    const db = testEnvTyped.BRIEFINGS_DB;
    if (!db)
        throw new Error('BRIEFINGS_DB not bound in test env');
    // The test pool's in-memory D1 doesn't run migrations automatically.
    // Apply just the api_keys schema (the only one the auth middleware
    // needs) idempotently before inserting the test row.
    await db.exec(`CREATE TABLE IF NOT EXISTS api_keys (` +
        ` id TEXT PRIMARY KEY,` +
        ` key_hash TEXT NOT NULL UNIQUE,` +
        ` prefix TEXT NOT NULL,` +
        ` label TEXT NOT NULL,` +
        ` role TEXT NOT NULL DEFAULT 'readonly' CHECK(role IN ('admin', 'readonly')),` +
        ` created_at TEXT NOT NULL,` +
        ` last_used_at TEXT,` +
        ` revoked_at TEXT)`);
    await db.prepare(`DELETE FROM api_keys WHERE label = 'vitest-suite'`).run();
    const { rawKey } = await generateApiKey(db, 'vitest-suite', 'admin');
    return rawKey;
}
/**
 * Returns a `fetch`-shaped wrapper that signs every request with a fresh
 * test API key. Call this at the top of every test that needs to hit a
 * POST/DELETE route under `/api/v1/*`.
 *
 *   const fetchAuthed = await withTestApiKey();
 *   const r = await fetchAuthed('https://x/api/v1/intel-bundle/build', {
 *     method: 'POST', headers: { 'content-type': 'application/json' }, body: ...
 *   });
 */
export async function withTestApiKey() {
    const key = await ensureApiKey();
    return async (input, init = {}) => {
        const headers = new Headers(init.headers);
        headers.set('authorization', `Bearer ${key}`);
        return SELF.fetch(input, { ...init, headers });
    };
}
