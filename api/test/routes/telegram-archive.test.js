import { describe, it, expect, vi, afterEach } from 'vitest';
import { runTelegramArchive } from '../../src/routes/telegram-archive';
import { RANSOMWARE_RECENT_CACHE_KEY } from '../../src/routes/ransomware-recent';
afterEach(() => vi.unstubAllGlobals());
function kv() {
    const m = new Map();
    return {
        store: m,
        get: async (k) => {
            const v = m.get(k);
            return v ? JSON.parse(v) : null;
        },
        put: async (k, v) => void m.set(k, v),
    };
}
function stubCache(byKey) {
    vi.stubGlobal('caches', {
        default: {
            match: async (key) => key in byKey ? new Response(JSON.stringify(byKey[key]), { status: 200 }) : undefined,
        },
    });
}
const ransomBody = {
    victims: [
        { group: 'LockBit', victim: 'acme.com', discovered: '2026-05-20T10:00:00Z' },
        { group: 'Akira', victim: 'globex.io', discovered: '2026-05-20T09:00:00Z' },
    ],
};
describe('runTelegramArchive', () => {
    it('is a no-op when not configured', async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
        const res = await runTelegramArchive({ CASE_STUDIES: kv() });
        expect(res).toEqual({ posted: 0, skipped: 'not_configured' });
        expect(fetchSpy).not.toHaveBeenCalled();
    });
    it('posts new items, dedups on the next run, persists state', async () => {
        stubCache({ [RANSOMWARE_RECENT_CACHE_KEY]: ransomBody });
        const sent = [];
        vi.stubGlobal('fetch', vi.fn(async (_u, init) => {
            sent.push(JSON.parse(String(init.body)).text);
            return new Response('{"ok":true}', { status: 200 });
        }));
        const env = { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHANNEL_ID: '@c', CASE_STUDIES: kv() };
        const r1 = await runTelegramArchive(env);
        expect(r1.posted).toBe(1);
        expect(sent[0]).toContain('LockBit');
        expect(sent[0]).toContain('2 new');
        const r2 = await runTelegramArchive(env); // same feed → all seen
        expect(r2.posted).toBe(0);
    });
    it('broadcasts each digest to every chat in a comma-separated list', async () => {
        stubCache({ [RANSOMWARE_RECENT_CACHE_KEY]: ransomBody });
        const chats = [];
        vi.stubGlobal('fetch', vi.fn(async (_u, init) => {
            chats.push(JSON.parse(String(init.body)).chat_id);
            return new Response('{"ok":true}', { status: 200 });
        }));
        const env = { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHANNEL_ID: '@a, @b, -1009', CASE_STUDIES: kv() };
        const r = await runTelegramArchive(env);
        expect(r.posted).toBe(1); // one digest, broadcast
        expect(chats).toEqual(['@a', '@b', '-1009']); // delivered to all three
    });
    it('bails without updating state when Telegram rate-limits', async () => {
        stubCache({ [RANSOMWARE_RECENT_CACHE_KEY]: ransomBody });
        vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":false}', { status: 429 })));
        const k = kv();
        const env = { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHANNEL_ID: '@c', CASE_STUDIES: k };
        const r = await runTelegramArchive(env);
        expect(r.posted).toBe(0);
        expect(k.store.size).toBe(0); // state not persisted → retried next run
    });
});
