// api/test/lib/file2txt/image-ocr.test.ts
import { describe, it, expect, vi } from 'vitest';
import { extractImage } from '../../../src/lib/file2txt/image-ocr';

const IMG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe('extractImage', () => {
  it('uses Workers AI vision when no bridge is configured', async () => {
    const run = vi.fn().mockResolvedValue({ description: '1.2.3.4 malware.exe' });
    const env = { AI: { run } } as never;
    const r = await extractImage(IMG, 'image/png', 'a.png', env);
    expect(r.text).toBe('1.2.3.4 malware.exe');
    expect(r.meta).toEqual({ kind: 'image', method: 'ai-vision', truncated: false });
    expect(run).toHaveBeenCalledOnce();
  });

  it('routes to the bridge when configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'from bridge' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const run = vi.fn();
    const env = { AI: { run }, FILE2TXT_BRIDGE_URL: 'https://b.example' } as never;
    const r = await extractImage(IMG, 'image/png', 'a.png', env);
    expect(r.meta.method).toBe('bridge');
    expect(run).not.toHaveBeenCalled();
  });
});
