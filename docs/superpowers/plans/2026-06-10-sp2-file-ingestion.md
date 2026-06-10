# SP2 File Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /api/v1/report/ingest` — upload a PDF/docx/image/text/HTML file, extract its text, and run it through the existing `buildStixBundle` pipeline, returning the same `{ bundle, view }` as `intel-bundle/build`.

**Architecture:** A new `api/src/lib/file2txt/` module converts uploaded bytes → text (text/HTML in-Worker; images via Workers AI vision; PDF/docx via an optional self-hosted `file2txt` bridge, because the free-plan 10 ms CPU cap makes in-Worker PDF/docx parsing infeasible). The existing STIX pipeline in `intel-bundle.ts` is refactored to expose a reusable `buildBundleFromReport()` that both `intel-bundle/build` and the new ingest endpoint call. No new heavy deps are bundled.

**Tech Stack:** Cloudflare Workers, Hono, TypeScript, Vitest (`@cloudflare/vitest-pool-workers`), Workers AI binding (`env.AI`), Web Crypto (`crypto.subtle`).

**Spec:** `docs/superpowers/specs/2026-06-10-stixify-sp2-file-ingestion-design.md`

---

## File Structure

| File                                | Responsibility                                          |
| ----------------------------------- | ------------------------------------------------------- |
| `api/src/lib/file2txt/types.ts`     | `ExtractResult`, `SupportedKind`, shared constants      |
| `api/src/lib/file2txt/mime.ts`      | sniff MIME from magic bytes + filename; allow-list      |
| `api/src/lib/file2txt/text-html.ts` | plain-text passthrough + HTML → text                    |
| `api/src/lib/file2txt/bridge.ts`    | optional `file2txt` bridge client + `BridgeUnavailable` |
| `api/src/lib/file2txt/image-ocr.ts` | Workers AI vision OCR (bridge override if configured)   |
| `api/src/lib/file2txt/index.ts`     | `extractText()` dispatcher + `sha256Hex()`              |
| `api/src/routes/intel-bundle.ts`    | **modify**: export `buildBundleFromReport()`            |
| `api/src/routes/report-ingest.ts`   | new ingest handler                                      |
| `api/src/index.ts`                  | **modify**: register route                              |
| `api/src/env.ts`                    | **modify**: add optional bridge env vars                |

Note on TLP default: `intel-bundle/build` defaults `tlp` to `'AMBER'` (`intel-bundle.ts:545`). The ingest endpoint matches that default for consistency (the spec's mention of `WHITE` was based on an early misread — `AMBER` is the existing behavior).

---

### Task 1: MIME detection

**Files:**

- Create: `api/src/lib/file2txt/types.ts`
- Create: `api/src/lib/file2txt/mime.ts`
- Test: `api/test/lib/file2txt/mime.test.ts`

- [ ] **Step 1: Create the shared types**

```ts
// api/src/lib/file2txt/types.ts

/** The file kinds SP2 understands. */
export type SupportedKind = 'text' | 'html' | 'image' | 'pdf' | 'docx';

/** How the text was obtained, for provenance. */
export type ExtractMethod = 'inline' | 'ai-vision' | 'bridge';

/** Uniform return shape from every parser + the dispatcher. */
export interface ExtractResult {
  text: string;
  meta: {
    kind: SupportedKind;
    method: ExtractMethod;
    pages?: number;
    truncated: boolean;
  };
}

/** Cap extracted text to keep the downstream extractor bounded (matches
 *  report-parser's MAX_TEXT_LENGTH). */
export const MAX_TEXT_LENGTH = 100_000;
```

- [ ] **Step 2: Write the failing test**

```ts
// api/test/lib/file2txt/mime.test.ts
import { describe, it, expect } from 'vitest';
import { sniffKind } from '../../../src/lib/file2txt/mime';

function bytes(...b: number[]): Uint8Array {
  return new Uint8Array(b);
}

describe('sniffKind', () => {
  it('detects PDF from %PDF- magic', () => {
    expect(sniffKind(bytes(0x25, 0x50, 0x44, 0x46, 0x2d), 'application/pdf', 'r.pdf')).toBe('pdf');
  });
  it('detects PNG from magic', () => {
    expect(sniffKind(bytes(0x89, 0x50, 0x4e, 0x47), 'image/png', 'a.png')).toBe('image');
  });
  it('detects JPEG from magic', () => {
    expect(sniffKind(bytes(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg', 'a.jpg')).toBe('image');
  });
  it('detects docx from PK zip magic + .docx name', () => {
    expect(sniffKind(bytes(0x50, 0x4b, 0x03, 0x04), '', 'report.docx')).toBe('docx');
  });
  it('detects html by content-type', () => {
    expect(sniffKind(bytes(0x3c, 0x21), 'text/html', 'p.html')).toBe('html');
  });
  it('falls back to text for plain content', () => {
    expect(sniffKind(bytes(0x68, 0x69), 'text/plain', 'n.txt')).toBe('text');
  });
  it('returns null for unsupported (e.g. zip that is not docx)', () => {
    expect(sniffKind(bytes(0x50, 0x4b, 0x03, 0x04), 'application/zip', 'a.zip')).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd api && npx vitest run test/lib/file2txt/mime.test.ts`
Expected: FAIL — `sniffKind` is not defined / module not found.

- [ ] **Step 4: Write the implementation**

```ts
// api/src/lib/file2txt/mime.ts
import type { SupportedKind } from './types';

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (bytes[i] !== sig[i]) return false;
  return true;
}

/**
 * Decide the file kind from magic bytes first, then content-type / filename.
 * Returns null for anything outside the SP2 allow-list.
 */
export function sniffKind(bytes: Uint8Array, contentType: string, filename: string): SupportedKind | null {
  const ct = (contentType || '').toLowerCase();
  const name = (filename || '').toLowerCase();

  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'pdf'; // %PDF
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'image'; // PNG
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image'; // JPEG

  // .docx is a ZIP (PK\x03\x04). Only treat ZIPs as docx when the name/type says so.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    if (name.endsWith('.docx') || ct.includes('officedocument.wordprocessingml')) return 'docx';
    return null; // some other zip — unsupported
  }

  if (ct.includes('text/html') || name.endsWith('.html') || name.endsWith('.htm')) return 'html';
  if (ct.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) return 'text';

  // PDFs/images sometimes arrive without recognizable leading bytes but with a clear type.
  if (ct === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (ct.startsWith('image/')) return 'image';

  return null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd api && npx vitest run test/lib/file2txt/mime.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add api/src/lib/file2txt/types.ts api/src/lib/file2txt/mime.ts api/test/lib/file2txt/mime.test.ts
git commit -m "feat(file2txt): MIME sniffing + shared types for SP2 ingestion"
```

---

### Task 2: Text & HTML extraction

**Files:**

- Create: `api/src/lib/file2txt/text-html.ts`
- Test: `api/test/lib/file2txt/text-html.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/lib/file2txt/text-html.test.ts
import { describe, it, expect } from 'vitest';
import { extractTextOrHtml } from '../../../src/lib/file2txt/text-html';

const enc = new TextEncoder();

describe('extractTextOrHtml', () => {
  it('passes plain text through', () => {
    const r = extractTextOrHtml(enc.encode('1.2.3.4 is bad'), 'text');
    expect(r.text).toBe('1.2.3.4 is bad');
    expect(r.meta).toEqual({ kind: 'text', method: 'inline', truncated: false });
  });

  it('strips HTML tags and decodes entities', () => {
    const html =
      '<html><head><style>x{}</style></head><body><p>Evil &amp; 1.2.3.4</p><script>alert(1)</script></body></html>';
    const r = extractTextOrHtml(enc.encode(html), 'html');
    expect(r.text).toContain('Evil & 1.2.3.4');
    expect(r.text).not.toContain('alert(1)');
    expect(r.text).not.toContain('<p>');
    expect(r.meta.kind).toBe('html');
  });

  it('truncates over-long text and flags it', () => {
    const big = 'a'.repeat(150_000);
    const r = extractTextOrHtml(enc.encode(big), 'text');
    expect(r.text.length).toBe(100_000);
    expect(r.meta.truncated).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run test/lib/file2txt/text-html.test.ts`
Expected: FAIL — `extractTextOrHtml` is not defined.

- [ ] **Step 3: Write the implementation**

```ts
// api/src/lib/file2txt/text-html.ts
import { MAX_TEXT_LENGTH, type ExtractResult } from './types';

const DECODE: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (m) => DECODE[m.toLowerCase()] ?? m)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cap(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT_LENGTH) return { text, truncated: false };
  return { text: text.slice(0, MAX_TEXT_LENGTH), truncated: true };
}

/** In-Worker extraction for the CPU-cheap formats. */
export function extractTextOrHtml(bytes: Uint8Array, kind: 'text' | 'html'): ExtractResult {
  const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const text = kind === 'html' ? htmlToText(raw) : raw.trim();
  const { text: capped, truncated } = cap(text);
  return { text: capped, meta: { kind, method: 'inline', truncated } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run test/lib/file2txt/text-html.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/file2txt/text-html.ts api/test/lib/file2txt/text-html.test.ts
git commit -m "feat(file2txt): in-Worker text + HTML extraction"
```

---

### Task 3: Bridge client

**Files:**

- Create: `api/src/lib/file2txt/bridge.ts`
- Test: `api/test/lib/file2txt/bridge.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/lib/file2txt/bridge.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractViaBridge, BridgeUnavailable } from '../../../src/lib/file2txt/bridge';

const FILE = new Uint8Array([1, 2, 3]);

afterEach(() => vi.restoreAllMocks());

describe('extractViaBridge', () => {
  it('throws BridgeUnavailable when env is unset', async () => {
    await expect(extractViaBridge(FILE, 'application/pdf', 'r.pdf', {} as any, 'pdf')).rejects.toBeInstanceOf(
      BridgeUnavailable
    );
  });

  it('posts to the bridge and returns its text', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ text: 'extracted from pdf' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const env = { FILE2TXT_BRIDGE_URL: 'https://bridge.example', FILE2TXT_BRIDGE_TOKEN: 'tok' } as any;

    const r = await extractViaBridge(FILE, 'application/pdf', 'r.pdf', env, 'pdf');

    expect(r.text).toBe('extracted from pdf');
    expect(r.meta).toEqual({ kind: 'pdf', method: 'bridge', truncated: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://bridge.example/extract');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('throws on non-200 from the bridge', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));
    const env = { FILE2TXT_BRIDGE_URL: 'https://bridge.example' } as any;
    await expect(extractViaBridge(FILE, 'application/pdf', 'r.pdf', env, 'pdf')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run test/lib/file2txt/bridge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// api/src/lib/file2txt/bridge.ts
import type { Env } from '../../env';
import { MAX_TEXT_LENGTH, type ExtractResult, type SupportedKind } from './types';

/** Thrown when PDF/docx (or forced-bridge image) ingestion is requested but no
 *  bridge is configured. The handler maps this to a 503 + setup hint. */
export class BridgeUnavailable extends Error {
  constructor() {
    super('file2txt bridge not configured');
    this.name = 'BridgeUnavailable';
  }
}

const BRIDGE_TIMEOUT_MS = 20_000;

export function bridgeConfigured(env: Env): boolean {
  return typeof env.FILE2TXT_BRIDGE_URL === 'string' && env.FILE2TXT_BRIDGE_URL.length > 0;
}

/** POST the raw file to the self-hosted file2txt bridge and return its text. */
export async function extractViaBridge(
  bytes: Uint8Array,
  contentType: string,
  filename: string,
  env: Env,
  kind: SupportedKind
): Promise<ExtractResult> {
  if (!bridgeConfigured(env)) throw new BridgeUnavailable();

  const headers: Record<string, string> = {
    'Content-Type': contentType || 'application/octet-stream',
    'X-Filename': filename,
  };
  if (env.FILE2TXT_BRIDGE_TOKEN) headers.Authorization = `Bearer ${env.FILE2TXT_BRIDGE_TOKEN}`;

  const res = await fetch(`${env.FILE2TXT_BRIDGE_URL!.replace(/\/$/, '')}/extract`, {
    method: 'POST',
    headers,
    body: bytes,
    signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`bridge returned ${res.status}`);

  const data = (await res.json()) as { text?: string };
  const text = (data.text ?? '').slice(0, MAX_TEXT_LENGTH);
  return { text, meta: { kind, method: 'bridge', truncated: (data.text ?? '').length > MAX_TEXT_LENGTH } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run test/lib/file2txt/bridge.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/file2txt/bridge.ts api/test/lib/file2txt/bridge.test.ts
git commit -m "feat(file2txt): optional self-hosted file2txt bridge client"
```

---

### Task 4: Image OCR via Workers AI vision

**Files:**

- Create: `api/src/lib/file2txt/image-ocr.ts`
- Test: `api/test/lib/file2txt/image-ocr.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/lib/file2txt/image-ocr.test.ts
import { describe, it, expect, vi } from 'vitest';
import { extractImage } from '../../../src/lib/file2txt/image-ocr';

const IMG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe('extractImage', () => {
  it('uses Workers AI vision when no bridge is configured', async () => {
    const run = vi.fn().mockResolvedValue({ description: '1.2.3.4 malware.exe' });
    const env = { AI: { run } } as any;
    const r = await extractImage(IMG, 'image/png', 'a.png', env);
    expect(r.text).toBe('1.2.3.4 malware.exe');
    expect(r.meta).toEqual({ kind: 'image', method: 'ai-vision', truncated: false });
    expect(run).toHaveBeenCalledOnce();
  });

  it('routes to the bridge when configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'from bridge' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const env = { AI: { run: vi.fn() }, FILE2TXT_BRIDGE_URL: 'https://b.example' } as any;
    const r = await extractImage(IMG, 'image/png', 'a.png', env);
    expect(r.meta.method).toBe('bridge');
    expect(env.AI.run).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run test/lib/file2txt/image-ocr.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

> Implementation note: confirm the vision model id against the live Workers AI catalog at build time. `@cf/meta/llama-3.2-11b-vision-instruct` is the primary; the call shape (`image` as a byte array + `prompt`) is stable across the CF vision models.

```ts
// api/src/lib/file2txt/image-ocr.ts
import type { Env } from '../../env';
import { MAX_TEXT_LENGTH, type ExtractResult } from './types';
import { bridgeConfigured, extractViaBridge } from './bridge';

const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const OCR_PROMPT = 'Transcribe all text visible in this image verbatim. Output only the transcribed text.';

/** OCR an image. Prefers the bridge (higher fidelity) when configured, else
 *  Workers AI vision. Vision inference is I/O-bound (does not count against the
 *  10 ms CPU cap) but consumes the daily neuron budget. */
export async function extractImage(
  bytes: Uint8Array,
  contentType: string,
  filename: string,
  env: Env
): Promise<ExtractResult> {
  if (bridgeConfigured(env)) {
    return extractViaBridge(bytes, contentType, filename, env, 'image');
  }

  const out = (await env.AI.run(
    VISION_MODEL as never,
    {
      image: Array.from(bytes),
      prompt: OCR_PROMPT,
    } as never
  )) as { description?: string; response?: string };

  const raw = (out.description ?? out.response ?? '').trim();
  const text = raw.slice(0, MAX_TEXT_LENGTH);
  return { text, meta: { kind: 'image', method: 'ai-vision', truncated: raw.length > MAX_TEXT_LENGTH } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run test/lib/file2txt/image-ocr.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/file2txt/image-ocr.ts api/test/lib/file2txt/image-ocr.test.ts
git commit -m "feat(file2txt): image OCR via Workers AI vision with bridge override"
```

---

### Task 5: Dispatcher + sha256 helper

**Files:**

- Create: `api/src/lib/file2txt/index.ts`
- Test: `api/test/lib/file2txt/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/lib/file2txt/index.test.ts
import { describe, it, expect, vi } from 'vitest';
import { extractText, sha256Hex, UnsupportedFile } from '../../../src/lib/file2txt';
import { BridgeUnavailable } from '../../../src/lib/file2txt/bridge';

const enc = new TextEncoder();

describe('extractText dispatcher', () => {
  it('handles plain text in-Worker', async () => {
    const r = await extractText(enc.encode('hello 1.2.3.4'), 'text/plain', 'n.txt', {} as any);
    expect(r.text).toContain('1.2.3.4');
    expect(r.meta.method).toBe('inline');
  });

  it('routes PDF to the bridge → BridgeUnavailable when unset', async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    await expect(extractText(pdf, 'application/pdf', 'r.pdf', {} as any)).rejects.toBeInstanceOf(BridgeUnavailable);
  });

  it('throws UnsupportedFile for an unknown type', async () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    await expect(extractText(zip, 'application/zip', 'a.zip', {} as any)).rejects.toBeInstanceOf(UnsupportedFile);
  });
});

describe('sha256Hex', () => {
  it('hashes deterministically', async () => {
    const a = await sha256Hex(enc.encode('abc'));
    expect(a).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run test/lib/file2txt/index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// api/src/lib/file2txt/index.ts
import type { Env } from '../../env';
import type { ExtractResult } from './types';
import { sniffKind } from './mime';
import { extractTextOrHtml } from './text-html';
import { extractImage } from './image-ocr';
import { extractViaBridge } from './bridge';

export * from './types';
export { BridgeUnavailable } from './bridge';

/** Thrown when the uploaded file is outside the allow-list. Handler → 415. */
export class UnsupportedFile extends Error {
  constructor() {
    super('unsupported file type');
    this.name = 'UnsupportedFile';
  }
}

/** Lowercase hex SHA-256 of the given bytes (for deterministic itemRef). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Convert uploaded bytes to text, dispatching by sniffed kind. */
export async function extractText(
  bytes: Uint8Array,
  contentType: string,
  filename: string,
  env: Env
): Promise<ExtractResult> {
  const kind = sniffKind(bytes, contentType, filename);
  if (kind === null) throw new UnsupportedFile();

  switch (kind) {
    case 'text':
    case 'html':
      return extractTextOrHtml(bytes, kind);
    case 'image':
      return extractImage(bytes, contentType, filename, env);
    case 'pdf':
    case 'docx':
      // CPU-bound parsing is infeasible on the free 10ms CPU cap → bridge only.
      return extractViaBridge(bytes, contentType, filename, env, kind);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run test/lib/file2txt/index.test.ts`
Expected: PASS (4 tests). (The `sha256Hex('abc')` vector is the canonical SHA-256 of "abc".)

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/file2txt/index.ts api/test/lib/file2txt/index.test.ts
git commit -m "feat(file2txt): dispatcher + deterministic sha256 helper"
```

---

### Task 6: Refactor reusable `buildBundleFromReport`

**Files:**

- Modify: `api/src/routes/intel-bundle.ts:537-610`
- Test: existing `api/test/routes/intel-bundle.test.ts` (guard — must stay green)

- [ ] **Step 1: Confirm the current build test passes before refactoring**

Run: `cd api && npx vitest run test/routes/intel-bundle.test.ts`
Expected: PASS (baseline). If this file doesn't exist, run the broader `npx vitest run test/routes/` to capture the baseline for `intel-bundle/build`.

- [ ] **Step 2: Add a typed build error + the exported function**

Insert near the top of `intel-bundle.ts` (after imports):

```ts
/** Distinguishes enrichment vs assembly failure for the 502 mapping. */
export class BundleBuildError extends Error {
  constructor(public code: 'enrichment_failed' | 'build_failed') {
    super(code);
    this.name = 'BundleBuildError';
  }
}
```

Add the exported function (place it just above `intelBundleBuildHandler`):

```ts
/**
 * Shared STIX assembly core: given a ReportInput (and optional pre-detected
 * IoCs from list-mode), run extraction → enrichment fan-out → buildStixBundle,
 * persist to D1 (non-fatal), and return the BuildResult. Throws BundleBuildError
 * on enrichment/assembly failure so callers can map to 502.
 */
export async function buildBundleFromReport(
  c: Context<{ Bindings: Env }>,
  report: ReportInput,
  extraIocs: { type: IndicatorType; value: string }[] = []
): Promise<BuildResult> {
  const entities = extract(report.title, report.body);
  if (extraIocs.length) {
    const seen = new Set(entities.iocs.map((i) => `${i.type}|${i.value.toLowerCase()}`));
    for (const i of extraIocs) {
      const k = `${i.type}|${i.value.toLowerCase()}`;
      if (!seen.has(k)) {
        entities.iocs.push(i);
        seen.add(k);
      }
    }
  }

  let bulk: Awaited<ReturnType<typeof enrichBulk>> = {
    enrichments: [],
    partial: false,
    overflow: [],
    freshSubrequests: 0,
    droppedSubrequests: 0,
  };
  let cveEnrichments = new Map<string, CveEnrichment>();
  let llmEntities: LlmEntities = { ...EMPTY_LLM_ENTITIES };
  try {
    [bulk, cveEnrichments, llmEntities] = await Promise.all([
      enrichBulk(
        entities.iocs.map((i) => ({ type: i.type, value: i.value })),
        c.env
      ),
      enrichCves(entities.cves),
      extractLlm(report.title, report.body, entities, c.env).catch(() => ({
        ...EMPTY_LLM_ENTITIES,
        ran: false,
        partial: false,
      })),
    ]);
  } catch (err) {
    console.error('STIX build enrichment phase failed:', err);
    throw new BundleBuildError('enrichment_failed');
  }

  let built: BuildResult;
  try {
    built = await buildStixBundle(report, entities, bulk, cveEnrichments, llmEntities);
  } catch (err) {
    console.error('STIX build bundle assembly failed:', err);
    throw new BundleBuildError('build_failed');
  }

  const db = c.env.BRIEFINGS_DB;
  if (db) {
    c.executionCtx.waitUntil(
      writeBundle(db, built, report, bulk).catch(() => {
        /* persistence failure is non-fatal */
      })
    );
  }
  return built;
}
```

- [ ] **Step 3: Rewrite `intelBundleBuildHandler` to call it**

Replace the body from `const entities = extract(...)` (line ~551) through the final `return jsonResponse(...)` (line ~610) with:

```ts
let built: BuildResult;
try {
  built = await buildBundleFromReport(c, report, preIocs);
} catch (err) {
  if (err instanceof BundleBuildError) {
    return jsonResponse(c, { error: err.code }, 502);
  }
  return jsonResponse(c, { error: 'build_failed' }, 502);
}
return jsonResponse(c, { bundle: built.bundle, view: built.view, cache: 'computed' }, 200);
```

(Leave lines 488-546 — body parse, input handling, `preIocs` build, `report` construction — unchanged.)

- [ ] **Step 4: Run the build test to verify behavior is preserved**

Run: `cd api && npx vitest run test/routes/intel-bundle.test.ts`
Expected: PASS (same as baseline — the refactor is behavior-preserving).

- [ ] **Step 5: Typecheck**

Run: `cd api && npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.worker.json --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/intel-bundle.ts
git commit -m "refactor(intel-bundle): extract reusable buildBundleFromReport"
```

---

### Task 7: Ingest handler

**Files:**

- Create: `api/src/routes/report-ingest.ts`
- Test: `api/test/routes/report-ingest.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/test/routes/report-ingest.test.ts
import { describe, it, expect, vi } from 'vitest';
import { reportIngestHandler } from '../../src/routes/report-ingest';

// Minimal Hono-like context stub. The handler only uses req.formData(), env, and json().
function ctx(form: FormData, env: any = {}) {
  let status = 200;
  let payload: unknown;
  return {
    req: { formData: async () => form },
    env: { AI: { run: vi.fn() }, ...env },
    executionCtx: { waitUntil: () => {} },
    json: (body: unknown, s = 200) => {
      status = s;
      payload = body;
      return new Response(JSON.stringify(body), { status: s });
    },
    get _status() {
      return status;
    },
    get _payload() {
      return payload;
    },
  } as any;
}

function fileForm(bytes: Uint8Array, type: string, name: string): FormData {
  const fd = new FormData();
  fd.set('file', new File([bytes], name, { type }));
  return fd;
}

describe('reportIngestHandler', () => {
  it('415s an unsupported file', async () => {
    const c = ctx(fileForm(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), 'application/zip', 'a.zip'));
    const res = await reportIngestHandler(c);
    expect(res.status).toBe(415);
  });

  it('400s when no file field is present', async () => {
    const res = await reportIngestHandler(ctx(new FormData()));
    expect(res.status).toBe(400);
  });

  it('503s a PDF when no bridge is configured', async () => {
    const c = ctx(fileForm(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), 'application/pdf', 'r.pdf'));
    const res = await reportIngestHandler(c);
    expect(res.status).toBe(503);
  });

  it('413s a file over the size cap', async () => {
    const big = new Uint8Array(11 * 1024 * 1024); // 11 MB
    const c = ctx(fileForm(big, 'text/plain', 'big.txt'));
    const res = await reportIngestHandler(c);
    expect(res.status).toBe(413);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run test/routes/report-ingest.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// api/src/routes/report-ingest.ts
import type { Context } from 'hono';
import type { Env } from '../env';
import type { ReportInput } from '../lib/stix-build';
import { buildBundleFromReport, BundleBuildError } from './intel-bundle';
import { extractText, sha256Hex, UnsupportedFile, BridgeUnavailable } from '../lib/file2txt';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB own cap (multipart is exempt from the 256KB middleware)
const VALID_TLP = new Set(['WHITE', 'AMBER']);

/**
 * POST /api/v1/report/ingest  (multipart/form-data)
 *   file        (required)  uploaded document
 *   tlp         (optional)  'WHITE' | 'AMBER'  (default 'AMBER', matching intel-bundle/build)
 *   sourceName  (optional)  display name; defaults to the filename
 */
export async function reportIngestHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: 'invalid_multipart' }, 400);
  }

  const file = form.get('file');
  if (!(file instanceof File)) return c.json({ error: 'missing_file' }, 400);
  if (file.size > MAX_FILE_BYTES) return c.json({ error: 'file_too_large', max_bytes: MAX_FILE_BYTES }, 413);

  const tlpField = String(form.get('tlp') ?? 'AMBER').toUpperCase();
  if (!VALID_TLP.has(tlpField)) return c.json({ error: 'invalid_tlp', allowed: [...VALID_TLP] }, 400);
  const tlp = tlpField as 'WHITE' | 'AMBER';

  const sourceName = (form.get('sourceName')?.toString().trim() || file.name || 'Uploaded document').slice(0, 200);
  const bytes = new Uint8Array(await file.arrayBuffer());

  let extracted;
  try {
    extracted = await extractText(bytes, file.type, file.name, c.env);
  } catch (err) {
    if (err instanceof UnsupportedFile) return c.json({ error: 'unsupported_file_type' }, 415);
    if (err instanceof BridgeUnavailable) {
      return c.json(
        { error: 'bridge_not_configured', detail: 'PDF/DOCX ingestion requires FILE2TXT_BRIDGE_URL to be set' },
        503
      );
    }
    return c.json({ error: 'extraction_failed', detail: 'bridge or OCR error' }, 502);
  }

  if (!extracted.text || extracted.text.trim().length < 3) {
    return c.json({ error: 'no_text_extracted', detail: 'no usable text found; try another format' }, 422);
  }

  const firstLine = extracted.text.split(/\r?\n/, 1)[0] ?? '';
  const report: ReportInput = {
    sourceId: 'upload',
    sourceName,
    itemRef: `sha256:${await sha256Hex(bytes)}`,
    title: firstLine.length > 0 && firstLine.length <= 200 ? firstLine : sourceName,
    body: extracted.text,
    publishedAt: new Date().toISOString(),
    tlp,
  };

  try {
    const built = await buildBundleFromReport(c, report);
    return c.json({ bundle: built.bundle, view: built.view, cache: 'computed', ingest: extracted.meta }, 200);
  } catch (err) {
    if (err instanceof BundleBuildError) return c.json({ error: err.code }, 502);
    return c.json({ error: 'build_failed' }, 502);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run test/routes/report-ingest.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/report-ingest.ts api/test/routes/report-ingest.test.ts
git commit -m "feat(report-ingest): multipart upload handler → STIX bundle"
```

---

### Task 8: Env vars + route registration + middleware integration test

**Files:**

- Modify: `api/src/env.ts`
- Modify: `api/src/index.ts`
- Test: `api/test/routes/report-ingest-middleware.test.ts`

- [ ] **Step 1: Add the optional bridge env vars**

In `api/src/env.ts`, add inside the `Env` interface (near the other optional secrets):

```ts
  /** Optional self-hosted file2txt bridge for CPU-heavy PDF/DOCX extraction. */
  FILE2TXT_BRIDGE_URL?: string;
  FILE2TXT_BRIDGE_TOKEN?: string;
```

- [ ] **Step 2: Register the route**

In `api/src/index.ts`, add the import near the other route imports:

```ts
import { reportIngestHandler } from './routes/report-ingest';
```

And register it next to the existing report route (after `api/src/index.ts:913`):

```ts
app.post('/api/v1/report/ingest', reportIngestHandler);
```

> Auth note: register with the same posture as `POST /api/v1/intel-bundle/build` (`index.ts:815`). Do NOT add `requireAdminMiddleware` — that is scoped to `/api/v1/report/parse` only (`index.ts:447`) and `intel-bundle/build` does not use it.

- [ ] **Step 3: Write the failing middleware integration test**

```ts
// api/test/routes/report-ingest-middleware.test.ts
// Proves the looseValidation 256KB body cap does NOT 413 a multipart upload,
// and that the handler's own 10MB cap still applies.
import { describe, it, expect, vi } from 'vitest';
import app from '../../src/index';

function multipart(bytes: Uint8Array, type: string, name: string): Request {
  const fd = new FormData();
  fd.set('file', new File([bytes], name, { type }));
  return new Request('https://x/api/v1/report/ingest', { method: 'POST', body: fd });
}

const env = { AI: { run: vi.fn() } } as any;
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as any;

describe('report/ingest middleware', () => {
  it('does not 413 a >256KB multipart text upload (middleware exemption)', async () => {
    const text = new TextEncoder().encode('IOC 1.2.3.4\n'.repeat(40_000)); // ~480KB > 256KB
    const res = await app.fetch(multipart(text, 'text/plain', 'big.txt'), env, ctx);
    expect(res.status).not.toBe(413);
  });

  it('still 413s a >10MB upload via the handler cap', async () => {
    const big = new Uint8Array(11 * 1024 * 1024);
    const res = await app.fetch(multipart(big, 'text/plain', 'big.txt'), env, ctx);
    expect(res.status).toBe(413);
  });
});
```

> If `app` is not the default export of `api/src/index.ts`, import it by its actual exported name (check the bottom of `index.ts`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run --dangerouslyDisableSandbox test/routes/report-ingest-middleware.test.ts`
Expected: PASS (2 tests). (Route tests need the sandbox disabled — repo footgun.)

- [ ] **Step 5: Commit**

```bash
git add api/src/env.ts api/src/index.ts api/test/routes/report-ingest-middleware.test.ts
git commit -m "feat(report-ingest): register route + bridge env vars + middleware test"
```

---

### Task 9: Full typecheck, bundle budget, docs note

**Files:**

- Modify: `docs/loops/README.md` (or the nearest relevant doc) — one line documenting the new endpoint + optional bridge

- [ ] **Step 1: Typecheck all three projects**

Run:

```bash
npx tsc -p tsconfig.json --noEmit
cd api && npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.worker.json --noEmit
```

Expected: no errors in any project (esbuild deploys past tsc, so this is the real gate).

- [ ] **Step 2: Run the full file2txt + route test suite**

Run: `cd api && npx vitest run --dangerouslyDisableSandbox test/lib/file2txt/ test/routes/report-ingest.test.ts test/routes/report-ingest-middleware.test.ts test/routes/intel-bundle.test.ts`
Expected: all PASS.

- [ ] **Step 3: Confirm the Worker bundle stays under the 3 MB gzip free-plan cap**

Run (from repo root): `npx wrangler deploy --dry-run --outdir /tmp/wbuild 2>&1 | grep -i gzip`
Expected: `gzip:` value < 3072 KiB (baseline was ~1272 KiB; no heavy deps were added, so it should be ~unchanged).

- [ ] **Step 4: Add a one-line docs note**

Add to the relevant doc (e.g. a "Routes" or endpoints section):

```markdown
- `POST /api/v1/report/ingest` — upload PDF/DOCX/image/text/HTML → STIX bundle.
  PDF/DOCX require the optional `FILE2TXT_BRIDGE_URL` self-hosted bridge (free-plan
  10ms CPU cap blocks in-Worker parsing); images use Workers AI vision; text/HTML
  parse in-Worker.
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: note report/ingest endpoint + optional file2txt bridge"
```

---

## Self-Review

**Spec coverage:**

- Single-shot endpoint → Task 7 ✅
- CPU-aware hybrid routing (text/HTML in-Worker, image AI-vision, PDF/docx bridge) → Tasks 2, 4, 5 ✅
- No `unpdf`/`fflate` bundled → confirmed (no parser deps added); budget gate Task 9 ✅
- Deterministic `itemRef = sha256(bytes)` → Tasks 5, 7 ✅
- TLP form field (default reconciled to AMBER) → Task 7 ✅
- Multipart 10 MB own cap + 256 KB-exemption test → Tasks 7, 8 ✅
- Reuse via `buildBundleFromReport` → Task 6 ✅
- Optional bridge env, dormant-by-default, 503 hint → Tasks 3, 7, 8 ✅
- Error matrix (413/415/422/502/503/400) → Task 7 ✅
- Tests + 3× typecheck + bundle budget → Task 9 ✅

**Placeholder scan:** No TBDs. The single labeled "implementation note" (vision model id) is a verify-against-live-catalog instruction with a concrete default + call shape, not a gap.

**Type consistency:** `ExtractResult`/`SupportedKind`/`ExtractMethod` defined in Task 1 and used unchanged in Tasks 2–7. `buildBundleFromReport(c, report, extraIocs?)` and `BundleBuildError` defined in Task 6, consumed identically in Task 7. `ReportInput`/`BuildResult` imported from `stix-build` match the live signatures. `extractText`/`sha256Hex`/`UnsupportedFile`/`BridgeUnavailable` names consistent across Tasks 3–7.
