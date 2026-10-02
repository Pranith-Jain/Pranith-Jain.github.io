import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadBlob, downloadUrl, downloadText, downloadJson } from './download';

/**
 * Guards the two behaviours that were wrong in four page-local copies:
 * the anchor must be in the document when `.click()` fires (Firefox ignores
 * clicks on detached nodes), and the object URL must not be revoked
 * synchronously (that races the browser's read and truncates the file).
 */

describe('downloadBlob', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clicked: HTMLAnchorElement[];

  beforeEach(() => {
    clicked = [];
    createObjectURL = vi.fn(() => 'blob:mock-url');
    revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    } as unknown as typeof URL);

    // Capture the anchor at click time, including whether it was attached.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
      expect(document.body.contains(this), 'anchor must be in the document when click() fires').toBe(true);
      expect(this.download).not.toBe('');
      expect(this.href).toBeTruthy();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('attaches, clicks, then detaches the anchor', () => {
    downloadBlob(new Blob(['hello']), 'hello.txt');
    expect(clicked).toHaveLength(1);
    expect(document.body.contains(clicked[0]!)).toBe(false);
  });

  it('defers revokeObjectURL rather than revoking synchronously', () => {
    vi.useFakeTimers();
    try {
      downloadBlob(new Blob(['hello']), 'hello.txt');
      // Synchronous revocation is the bug — nothing should be revoked yet.
      expect(revokeObjectURL).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    } finally {
      vi.useRealTimers();
    }
  });

  it('sets the filename on the anchor', () => {
    downloadBlob(new Blob(['x']), 'report-2026.md');
    expect(clicked[0]!.download).toBe('report-2026.md');
  });

  it('leaves no anchor behind in the document', () => {
    const before = document.body.querySelectorAll('a[download]').length;
    downloadBlob(new Blob(['x']), 'a.txt');
    downloadBlob(new Blob(['y']), 'b.txt');
    const after = document.body.querySelectorAll('a[download]').length;
    expect(after).toBe(before);
  });

  it('passes the blob straight through to createObjectURL', () => {
    const blob = new Blob(['payload'], { type: 'text/plain' });
    downloadBlob(blob, 'p.txt');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
  });
});

describe('downloadUrl', () => {
  let clicked: HTMLAnchorElement[];
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clicked = [];
    revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(), revokeObjectURL } as unknown as typeof URL);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
      expect(document.body.contains(this), 'anchor must be attached when click() fires').toBe(true);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('attaches, clicks and detaches for a data: URL', () => {
    downloadUrl('data:image/png;base64,AAAA', 'chart.png');
    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.download).toBe('chart.png');
    expect(clicked[0]!.getAttribute('href')).toBe('data:image/png;base64,AAAA');
    expect(document.body.contains(clicked[0]!)).toBe(false);
  });

  it('does not revoke the caller-supplied URL', () => {
    // The same blob URL is usually also rendered in an <img>; revoking it
    // here would break the preview.
    downloadUrl('blob:abc', 'x.png');
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('leaves no anchor behind', () => {
    const before = document.body.querySelectorAll('a[download]').length;
    downloadUrl('data:,x', 'a.png');
    downloadUrl('data:,y', 'b.png');
    expect(document.body.querySelectorAll('a[download]').length).toBe(before);
  });
});

describe('downloadText', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    } as unknown as typeof URL);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('wraps content in a blob with the given mime type', async () => {
    downloadText('# Title', 'x.md', 'text/markdown');
    const [blob] = vi.mocked(URL.createObjectURL).mock.calls[0]!;
    expect(blob).toBeInstanceOf(Blob);
    expect((blob as Blob).type).toContain('text/markdown');
    expect(await (blob as Blob).text()).toBe('# Title');
  });

  it('defaults to text/plain', async () => {
    downloadText('plain', 'x.txt');
    const [blob] = vi.mocked(URL.createObjectURL).mock.calls[0]!;
    expect((blob as Blob).type).toContain('text/plain');
  });
});

describe('downloadJson', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    } as unknown as typeof URL);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('serialises as pretty JSON', async () => {
    downloadJson('data.json', { a: 1 });
    const [blob] = vi.mocked(URL.createObjectURL).mock.calls[0]!;
    expect((blob as Blob).type).toContain('application/json');
    expect(await (blob as Blob).text()).toBe(JSON.stringify({ a: 1 }, null, 2));
  });
});
