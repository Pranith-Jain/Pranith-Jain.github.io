import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useDocumentMeta } from '../useDocumentMeta';

describe('useDocumentMeta', () => {
  const originalTitle = document.title;
  const originalDescription = document
    .querySelector<HTMLMetaElement>('meta[name="description"]')
    ?.getAttribute('content');
  const originalOgTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.getAttribute('content');
  const originalCanonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.getAttribute('href');

  beforeEach(() => {
    document.title = originalTitle;
    document.querySelector('meta[name="description"]')?.remove();
    document.querySelector('meta[property="og:title"]')?.remove();
    document.querySelector('meta[property="og:description"]')?.remove();
    document.querySelector('link[rel="canonical"]')?.remove();
  });

  afterEach(() => {
    document.title = originalTitle;
    if (originalDescription != null) {
      let el = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', 'description');
        document.head.appendChild(el);
      }
      el.setAttribute('content', originalDescription);
    }
    if (originalOgTitle != null) {
      let el = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', 'og:title');
        document.head.appendChild(el);
      }
      el.setAttribute('content', originalOgTitle);
    }
    if (originalCanonical != null) {
      let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', 'canonical');
        document.head.appendChild(el);
      }
      el.setAttribute('href', originalCanonical);
    }
  });

  it('sets document.title with the site suffix when no section is provided', () => {
    renderHook(() => useDocumentMeta({ title: 'Actor Directory' }));
    expect(document.title).toBe('Actor Directory · Pranith Jain · Security Portfolio');
  });

  it('includes the section in the title when provided', () => {
    renderHook(() => useDocumentMeta({ title: 'Actor Directory', section: 'Threat Intel' }));
    expect(document.title).toBe('Actor Directory — Threat Intel · Pranith Jain · Security Portfolio');
  });

  it('honors fullTitle override (no suffix appended)', () => {
    renderHook(() => useDocumentMeta({ title: 'ignored', fullTitle: 'Custom Title — Special' }));
    expect(document.title).toBe('Custom Title — Special');
  });

  it('updates og:title alongside document.title', () => {
    renderHook(() => useDocumentMeta({ title: 'Actor Directory', section: 'Threat Intel' }));
    const og = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    expect(og?.getAttribute('content')).toBe('Actor Directory — Threat Intel · Pranith Jain · Security Portfolio');
  });

  it('writes description meta tag when provided', () => {
    renderHook(() =>
      useDocumentMeta({
        title: 'Actor Directory',
        description: 'Unified actor browser across MITRE, MISP, and platform DB.',
      })
    );
    const desc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    expect(desc?.getAttribute('content')).toBe('Unified actor browser across MITRE, MISP, and platform DB.');
    const ogDesc = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
    expect(ogDesc?.getAttribute('content')).toBe('Unified actor browser across MITRE, MISP, and platform DB.');
  });

  it('emits a canonical link when canonicalPath is provided', () => {
    renderHook(() => useDocumentMeta({ title: 'Catalog', canonicalPath: '/threatintel/catalog' }));
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    expect(canonical?.getAttribute('href')).toMatch(/\/threatintel\/catalog$/);
  });

  it('restores previous title and meta tags on unmount', () => {
    document.title = 'Original Title';
    const { unmount } = renderHook(() => useDocumentMeta({ title: 'Temp Title', description: 'Temp description' }));
    expect(document.title).toContain('Temp Title');
    unmount();
    expect(document.title).toBe('Original Title');
    const desc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    // We never set a previous description in this test, so the hook removes it
    // (querying it after unmount will yield null). Verify the hook *did* remove it.
    expect(desc).toBeNull();
  });

  it('reacts to prop changes', () => {
    let props = { title: 'A' };
    const { rerender } = renderHook(() => useDocumentMeta(props));
    expect(document.title).toContain('A');
    act(() => {
      props = { title: 'B' };
    });
    rerender();
    expect(document.title).toContain('B');
  });
});
