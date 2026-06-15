import { describe, it, expect } from 'vitest';
import { adminApiKeyCreateSchema, adminRetentionSchema } from '../../src/lib/validation-schemas';
// Regression guard for the bug where these route-middleware schemas drifted
// from the handlers / UI / D1 they validate. A mismatch here 400s every
// request before the handler runs (api-key creation was throwing because the
// schema required `name`/`scope` while the UI sends `label`/`role`).
describe('adminApiKeyCreateSchema — matches ApiKeysTab + admin-keys handler + migration 0006', () => {
    it('accepts the { label, role } the UI actually sends', () => {
        const r = adminApiKeyCreateSchema.safeParse({ label: 'ci-pipeline', role: 'admin' });
        expect(r.success).toBe(true);
    });
    it('defaults role to readonly when omitted', () => {
        const parsed = adminApiKeyCreateSchema.parse({ label: 'my-laptop' });
        expect(parsed.role).toBe('readonly');
    });
    it('rejects an empty label', () => {
        expect(adminApiKeyCreateSchema.safeParse({ label: '', role: 'admin' }).success).toBe(false);
    });
    it('rejects a role outside {admin, readonly}', () => {
        expect(adminApiKeyCreateSchema.safeParse({ label: 'x', role: 'write' }).success).toBe(false);
    });
    it('does NOT require the stale `name` field (the original bug)', () => {
        // The old schema required `name`; the UI never sends it. This must pass.
        expect(adminApiKeyCreateSchema.safeParse({ label: 'x' }).success).toBe(true);
    });
});
describe('adminRetentionSchema — matches RetentionTab + admin-retention handler', () => {
    it('accepts the { days, dry_run } the UI actually sends', () => {
        const r = adminRetentionSchema.safeParse({ days: 30, dry_run: true });
        expect(r.success).toBe(true);
        if (r.success)
            expect(r.data.days).toBe(30);
    });
    it('days is optional and dry_run defaults to false', () => {
        const parsed = adminRetentionSchema.parse({});
        expect(parsed.days).toBeUndefined();
        expect(parsed.dry_run).toBe(false);
    });
    it('rejects a non-positive retention window', () => {
        expect(adminRetentionSchema.safeParse({ days: 0 }).success).toBe(false);
    });
});
