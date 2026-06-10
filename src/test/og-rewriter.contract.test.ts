import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { injectOgMeta, OG_OVERRIDES } from '../../worker/og-rewriter';

// Contract test against the REAL index.html so it can never silently drift:
// the per-route metadata the worker serves is the only thing differentiating
// social/SEO cards across routes (head tags are NOT managed in React). These
// assertions pin the three bugs the audit found in worker/og-rewriter.ts:
//   1. <meta name="description"> is multi-line in index.html, so the single-line
//      rewrite regex never matched -> 317-char home description on every route.
//   2. twitter:* tags use property= in index.html but the worker matched name=
//      -> twitter:url/title/description never rewrote (home card on every share).
//   3. /, /dfir, /copilot had no override -> 97-char home <title> verbatim.
const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

/** Serve a path through the worker's OG rewriter (no nonce -> no caches access). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function serve(path: string, env: any = {}): Promise<string> {
  const res = new Response(indexHtml, { headers: { 'content-type': 'text/html;charset=UTF-8' } });
  const url = new URL(`https://pranithjain.qzz.io${path}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out = await injectOgMeta(res, url, env, { waitUntil() {} } as any);
  return out.text();
}

/** Minimal CASE_STUDIES KV stub: get(key) -> the canned record (or null). */
function blogEnv(data: Record<string, unknown>) {
  return { CASE_STUDIES: { get: async (k: string) => data[k] ?? null } };
}
const POST = {
  slug: 'unit-post',
  title: 'Unit Test Post',
  excerpt: 'A short excerpt for the post.',
  publishedAt: '2026-01-01T00:00:00.000Z',
  tags: ['cve', 'ransomware'],
};
const INDEX = [
  POST,
  { slug: 'second-post', title: 'Second Post', excerpt: 'Another one.', publishedAt: '2026-01-02T00:00:00.000Z', tags: [] },
];

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decode = (s: string): string => s.replace(/&(amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m);

/** Tolerant of multi-line tags + attribute order. Returns decoded display text. */
function metaByName(html: string, name: string): string | null {
  const m =
    new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, 'is').exec(html) ??
    new RegExp(`<meta\\s+content="([^"]*)"\\s+name="${name}"`, 'is').exec(html);
  return m ? decode(m[1]!) : null;
}
function metaByProperty(html: string, prop: string): string | null {
  const m = new RegExp(`<meta\\s+property="${prop}"\\s+content="([^"]*)"`, 'is').exec(html);
  return m ? decode(m[1]!) : null;
}
function titleOf(html: string): string | null {
  const m = /<title>([^<]*)<\/title>/i.exec(html);
  return m ? decode(m[1]!) : null;
}

describe('og-rewriter per-route metadata (contract vs real index.html)', () => {
  it('serves a DIFFERENT <meta name="description"> per route (the multi-line rewrite must fire)', async () => {
    const home = metaByName(await serve('/'), 'description');
    const about = metaByName(await serve('/about'), 'description');
    expect(home).toBeTruthy();
    expect(about).toBeTruthy();
    expect(about).not.toBe(home);
  });

  it('rewrites twitter:title and twitter:description per route (property= attribute)', async () => {
    const html = await serve('/about');
    expect(metaByProperty(html, 'twitter:title')).toContain('About');
    // home twitter:description phrase must be gone once the override applies
    expect(metaByProperty(html, 'twitter:description') ?? '').not.toContain('1,300+ domains secured');
  });

  it('rewrites twitter:url to the requested path on every route', async () => {
    expect(metaByProperty(await serve('/about'), 'twitter:url')).toBe('https://pranithjain.qzz.io/about');
    expect(metaByProperty(await serve('/dfir'), 'twitter:url')).toBe('https://pranithjain.qzz.io/dfir');
  });

  it('gives /dfir and /copilot unique, <=60-char titles (not the 97-char home default)', async () => {
    const dfir = titleOf(await serve('/dfir'));
    const copilot = titleOf(await serve('/copilot'));
    expect(dfir).toContain('DFIR');
    expect(dfir).not.toContain('Security Analyst & Detection Engineer | DFIR Toolkit');
    expect((dfir ?? '').length).toBeLessThanOrEqual(60);
    expect(copilot).toContain('Copilot');
    expect((copilot ?? '').length).toBeLessThanOrEqual(60);
  });

  it('home <title> <=60 chars and <meta name="description"> <=160 chars', async () => {
    const html = await serve('/');
    expect((titleOf(html) ?? '').length).toBeLessThanOrEqual(60);
    expect((metaByName(html, 'description') ?? '').length).toBeLessThanOrEqual(160);
  });

  it('still corrects og:url + canonical per route (no regression)', async () => {
    const html = await serve('/projects');
    expect(metaByProperty(html, 'og:url')).toBe('https://pranithjain.qzz.io/projects');
    expect(/<link rel="canonical" href="https:\/\/pranithjain\.qzz\.io\/projects"/i.test(html)).toBe(true);
  });

  it('every OG_OVERRIDES title is <=60 chars (Google truncates beyond ~60)', () => {
    for (const [route, ov] of Object.entries(OG_OVERRIDES)) {
      expect(ov.title.length, `${route} title is ${ov.title.length} chars`).toBeLessThanOrEqual(60);
    }
  });
});

describe('blog structured data (worker-injected JSON-LD)', () => {
  it('injects BlogPosting JSON-LD into /blog/<slug> from KV', async () => {
    const html = await serve('/blog/unit-post', blogEnv({ 'posts:unit-post': POST }));
    expect(html).toContain('application/ld+json');
    expect(html).toContain('"@type":"BlogPosting"');
    expect(html).toContain('"headline":"Unit Test Post"');
    expect(html).toContain('https://pranithjain.qzz.io/blog/unit-post');
  });

  it('injects Blog JSON-LD with the post list into /blog from KV', async () => {
    const html = await serve('/blog', blogEnv({ 'posts:index': INDEX }));
    expect(html).toContain('"@type":"Blog"');
    expect(html).toContain('Unit Test Post');
    expect(html).toContain('Second Post');
  });

  it('does not inject blog JSON-LD on non-blog routes', async () => {
    const html = await serve('/about', blogEnv({}));
    expect(html).not.toContain('"@type":"BlogPosting"');
    expect(html).not.toContain('"@type":"Blog"');
  });

  it('is resilient when KV has no data (no crash, no script)', async () => {
    expect(await serve('/blog', blogEnv({}))).not.toContain('"@type":"Blog"');
    expect(await serve('/blog/missing', blogEnv({}))).not.toContain('"@type":"BlogPosting"');
  });
});

describe('credential/login surfaces served noindex (Safe Browsing mitigation)', () => {
  for (const p of [
    '/dfir/breach',
    '/dfir/pgp-tool',
    '/dfir/phishing',
    '/threatintel/telegram-leaks/channels',
    '/threatintel/misp-browser',
    '/admin',
  ]) {
    it(`serves ${p} with a noindex robots meta`, async () => {
      expect(await serve(p)).toMatch(/<meta\s+name="robots"\s+content="noindex/i);
    });
  }
  it('leaves ordinary routes index,follow', async () => {
    expect(await serve('/about')).toMatch(/<meta\s+name="robots"\s+content="index, follow"/i);
  });
});
