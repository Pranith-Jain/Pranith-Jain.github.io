import { describe, it, expect } from 'vitest';
import { ipv4ToInt, cidrRange, parseCidrRanges, ipv4InRanges } from '../../src/lib/cidr';
import { safeIso, safeIsoOr } from '../../src/lib/safe-date';
import { mitreTechniqueSchema, googleDorksSchema } from '../../src/lib/validation-schemas';
describe('cidr — CIDR membership (x4bnet / blocklist feeds)', () => {
    it('matches an IP inside a CIDR range (the x4bnet bug: bare IP vs CIDR string)', () => {
        const ranges = parseCidrRanges('2.56.16.0/22\n# comment\n2.26.157.0/24\n');
        expect(ipv4InRanges('2.26.157.42', ranges)).toBe(true);
        expect(ipv4InRanges('2.56.17.1', ranges)).toBe(true); // inside /22
        expect(ipv4InRanges('9.9.9.9', ranges)).toBe(false);
    });
    it('treats a bare IP line as a /32', () => {
        const ranges = parseCidrRanges('8.8.8.8\n');
        expect(ipv4InRanges('8.8.8.8', ranges)).toBe(true);
        expect(ipv4InRanges('8.8.8.9', ranges)).toBe(false);
    });
    it('rejects malformed IPs/CIDRs without throwing', () => {
        expect(ipv4ToInt('999.1.1.1')).toBeNull();
        expect(ipv4ToInt('not-an-ip')).toBeNull();
        expect(cidrRange('1.2.3.0/40')).toBeNull();
        expect(ipv4InRanges('::1', parseCidrRanges('1.0.0.0/8'))).toBe(false);
    });
});
describe('safe-date — never throws on junk upstream dates', () => {
    it('safeIso returns undefined for junk/missing, ISO for valid', () => {
        expect(safeIso('garbage')).toBeUndefined();
        expect(safeIso('')).toBeUndefined();
        expect(safeIso(null)).toBeUndefined();
        expect(safeIso('2026-01-02T03:04:05Z')).toBe('2026-01-02T03:04:05.000Z');
        expect(safeIso('Mon, 02 Jan 2026 03:04:05 GMT')).toBe('2026-01-02T03:04:05.000Z');
    });
    it('the old pattern threw — confirm the helper does NOT', () => {
        expect(() => new Date('totally not a date').toISOString()).toThrow();
        expect(() => safeIso('totally not a date')).not.toThrow();
    });
    it('safeIsoOr falls back instead of throwing', () => {
        expect(safeIsoOr('garbage', '2020-01-01T00:00:00.000Z')).toBe('2020-01-01T00:00:00.000Z');
        expect(safeIsoOr('2026-01-02T03:04:05Z')).toBe('2026-01-02T03:04:05.000Z');
    });
});
describe('route schemas now match their handlers (no false 400)', () => {
    it('mitreTechniqueSchema accepts the handler param `technique`', () => {
        expect(mitreTechniqueSchema.safeParse({ technique: 'T1059' }).success).toBe(true);
        expect(mitreTechniqueSchema.safeParse({ t: 'T1059.001' }).success).toBe(true);
        // missing is allowed by the middleware — the handler 400s on it itself.
        expect(mitreTechniqueSchema.safeParse({}).success).toBe(true);
    });
    it('googleDorksSchema accepts the handler param `q`', () => {
        expect(googleDorksSchema.safeParse({ q: 'site:example.com' }).success).toBe(true);
        expect(googleDorksSchema.safeParse({ q: 'test', num: '20' }).success).toBe(true);
    });
});

describe('live-iocs fetchText — cf directive does not cache upstream errors', () => {
    // Regression for the 2026-06-13 incident: 24 of 36 sources stuck on
    // `ok:false` for hours. Root cause: fetchText's `cf: { cacheEverything: true }`
    // cached upstream 5xx/429 responses at the CF edge for 25 min, so every
    // consumer invocation and sync fan-out within that window saw the cached
    // error and `textFeedSource` reported `ok:false` to the slice/page. The
    // ?debug=1 path was unaffected because its diagnostic mirror uses a
    // different code path. Pin the directive shape here so a future
    // `cacheEverything` re-add fails this test in CI.
    it('fetchText does not request cacheEverything from the CF edge', async () => {
        const { readFile } = await import('node:fs/promises');
        const { fileURLToPath } = await import('node:url');
        const { resolve, dirname } = await import('node:path');
        const here = dirname(fileURLToPath(import.meta.url));
        const src = await readFile(resolve(here, '../../src/routes/live-iocs.ts'), 'utf8');
        // Pull just the fetchText function body so we don't get confused by
        // the diagnostic fetchTextDiag's identical-looking directive.
        const fnMatch = src.match(/async function fetchText\([\s\S]*?\n}\n/);
        expect(fnMatch, 'fetchText function should be present in live-iocs.ts').toBeTruthy();
        const body = fnMatch ? fnMatch[0] : '';
        // Extract just the `cf: { ... }` directive (the thing actually
        // sent to the Workers fetch() call). Comments above the directive
        // are allowed to mention `cacheEverything` for context — the
        // important invariant is the directive itself.
        const cfMatch = body.match(/cf:\s*\{[^}]*\}/);
        expect(cfMatch, 'fetchText should set a cf: { ... } directive').toBeTruthy();
        const cf = cfMatch ? cfMatch[0] : '';
        expect(cf).toMatch(/cacheTtl:\s*\d+/);
        // The smoking gun: cacheEverything: true on a fetch with a default
        // cache-control-less upstream caches non-2xx responses for the full
        // TTL. Pin that this directive is NOT present. (2026-06 incident.)
        expect(cf, 'cacheEverything in fetchText cf: directive would cache upstream 5xx/429 for 25 min and poison all subsequent reads').not.toMatch(/cacheEverything/);
    });
    it('fetchTextDiag matches the same directive shape (so the ?debug=1 path agrees)', async () => {
        const { readFile } = await import('node:fs/promises');
        const { fileURLToPath } = await import('node:url');
        const { resolve, dirname } = await import('node:path');
        const here = dirname(fileURLToPath(import.meta.url));
        const src = await readFile(resolve(here, '../../src/routes/live-iocs.ts'), 'utf8');
        const fnMatch = src.match(/async function fetchTextDiag\([\s\S]*?\n}\n/);
        expect(fnMatch, 'fetchTextDiag function should be present in live-iocs.ts').toBeTruthy();
        const body = fnMatch ? fnMatch[0] : '';
        // Both functions must agree on the cache directive — otherwise the
        // diagnostic path would diverge from the production path again
        // (the original `?debug=1` looked healthy while production was
        // poisoned, hiding the bug for hours).
        const prodBody = src.match(/async function fetchText\([\s\S]*?\n}\n/) ?.[0] ?? '';
        const prodCf = prodBody.match(/cf:\s*\{[^}]*\}/)?.[0] ?? '';
        const diagCf = body.match(/cf:\s*\{[^}]*\}/)?.[0] ?? '';
        expect(diagCf).toBe(prodCf);
        // And both must be cacheEverything-free.
        expect(prodCf, 'prod cf: must not request cacheEverything').not.toMatch(/cacheEverything/);
        expect(diagCf, 'diag cf: must not request cacheEverything').not.toMatch(/cacheEverything/);
    });
});
