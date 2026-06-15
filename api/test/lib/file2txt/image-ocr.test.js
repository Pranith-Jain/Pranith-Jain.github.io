import { describe, it, expect, vi } from 'vitest';
import { extractImage, ImageTooLarge } from '../../../src/lib/file2txt/image-ocr';
const IMG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
describe('extractImage', () => {
    it('uses Workers AI vision when no bridge is configured', async () => {
        const run = vi.fn().mockResolvedValue({ description: '1.2.3.4 malware.exe' });
        const env = { AI: { run } };
        const r = await extractImage(IMG, 'image/png', 'a.png', env);
        expect(r.text).toBe('1.2.3.4 malware.exe');
        expect(r.meta).toEqual({ kind: 'image', method: 'ai-vision', truncated: false });
        expect(run).toHaveBeenCalledOnce();
    });
    it('routes to the bridge when configured', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'from bridge' }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const env = { AI: { run: vi.fn() }, FILE2TXT_BRIDGE_URL: 'https://b.example' };
        const r = await extractImage(IMG, 'image/png', 'a.png', env);
        expect(r.meta.method).toBe('bridge');
        expect(env.AI.run).not.toHaveBeenCalled();
    });
    it('throws ImageTooLarge for an oversized in-Worker image (no bridge)', async () => {
        const run = vi.fn();
        const env = { AI: { run } };
        const big = new Uint8Array(5 * 1024 * 1024); // 5 MB > 4 MB in-Worker cap
        big.set([0x89, 0x50, 0x4e, 0x47]); // PNG magic
        await expect(extractImage(big, 'image/png', 'big.png', env)).rejects.toBeInstanceOf(ImageTooLarge);
        expect(run).not.toHaveBeenCalled();
    });
    it('still OCRs an oversized image when a bridge is configured (no cap)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'big via bridge' }), { status: 200 })));
        const env = { AI: { run: vi.fn() }, FILE2TXT_BRIDGE_URL: 'https://b.example' };
        const big = new Uint8Array(5 * 1024 * 1024);
        const r = await extractImage(big, 'image/png', 'big.png', env);
        expect(r.meta.method).toBe('bridge');
    });
});
