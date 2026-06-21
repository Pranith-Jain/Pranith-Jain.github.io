import { useEffect } from 'react';

/**
 * Set the document title and optional meta tags for the lifetime of a
 * mounted component. The previous values are restored on unmount so
 * that route changes (and back/forward navigation) yield the right
 * <title> for the current view.
 *
 * This is the canonical replacement for ad-hoc `document.title = …`
 * inside page components: keeping title updates behind a hook makes
 * it trivial to audit, refactor, or test from a single place, and
 * avoids the SSR/CSR mismatch that bare assignments can introduce.
 *
 * @example
 *   useDocumentMeta({
 *     title: 'Actor Directory',
 *     description: 'Unified actor browser across MITRE, MISP, and platform DB.',
 *     section: 'Threat Intel',
 *   });
 */
export interface DocumentMeta {
  /** Page title (will be suffixed with the site name). */
  title: string;
  /** Optional meta description. */
  description?: string;
  /** Optional section (e.g. "Threat Intel", "DFIR") used in the suffix. */
  section?: string;
  /** Optional canonical path — emits <link rel="canonical">. */
  canonicalPath?: string;
  /** Optional override for the full title (skips the site suffix). */
  fullTitle?: string;
  /** Optional OG image path (relative to site root). */
  ogImage?: string;
}

const SITE_NAME = 'Pranith Jain · Security Portfolio';

function setMetaName(name: string, content: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  const existing = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!content) {
    existing?.remove();
    return;
  }
  const el = existing ?? document.createElement('meta');
  if (!existing) {
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setMetaProperty(property: string, content: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  const existing = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!content) {
    existing?.remove();
    return;
  }
  const el = existing ?? document.createElement('meta');
  if (!existing) {
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function useDocumentMeta(meta: DocumentMeta): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const prev = {
      title: document.title,
      description: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.getAttribute('content'),
      ogTitle: document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.getAttribute('content'),
      ogDescription: document
        .querySelector<HTMLMetaElement>('meta[property="og:description"]')
        ?.getAttribute('content'),
      ogImage: document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.getAttribute('content'),
      ogImageAlt: document.querySelector<HTMLMetaElement>('meta[property="og:image:alt"]')?.getAttribute('content'),
      twitterImageAlt: document
        .querySelector<HTMLMetaElement>('meta[name="twitter:image:alt"]')
        ?.getAttribute('content'),
      twitterCard: document.querySelector<HTMLMetaElement>('meta[name="twitter:card"]')?.getAttribute('content'),
      twitterTitle: document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]')?.getAttribute('content'),
      twitterDescription: document
        .querySelector<HTMLMetaElement>('meta[name="twitter:description"]')
        ?.getAttribute('content'),
      twitterImage: document.querySelector<HTMLMetaElement>('meta[name="twitter:image"]')?.getAttribute('content'),
      canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.getAttribute('href'),
    };

    const fullTitle =
      meta.fullTitle ??
      (meta.section ? `${meta.title} — ${meta.section} · ${SITE_NAME}` : `${meta.title} · ${SITE_NAME}`);

    const siteUrl = 'https://pranithjain.qzz.io';
    const ogImage = meta.ogImage
      ? meta.ogImage.startsWith('http')
        ? meta.ogImage
        : `${siteUrl}${meta.ogImage}`
      : `${siteUrl}/og-image.svg`;

    document.title = fullTitle;
    if (meta.description) {
      setMetaName('description', meta.description);
      setMetaProperty('og:description', meta.description);
      setMetaName('twitter:description', meta.description);
    }
    setMetaProperty('og:title', fullTitle);
    setMetaProperty('og:image', ogImage);
    // og:image:alt helps AI engines describe the image in cards
    // + meets accessibility guidance. Falls back to the page
    // title since we don't carry a per-page image description.
    setMetaProperty('og:image:alt', fullTitle);
    setMetaProperty('og:url', meta.canonicalPath ? `${siteUrl}${meta.canonicalPath}` : siteUrl);
    setMetaProperty('og:type', meta.section === 'Threat Intel' || meta.section === 'DFIR' ? 'website' : 'profile');
    setMetaName('twitter:card', 'summary_large_image');
    setMetaName('twitter:title', fullTitle);
    setMetaName('twitter:image', ogImage);
    setMetaName('twitter:image:alt', fullTitle);
    setMetaName('twitter:site', '@pranithjain');
    if (meta.canonicalPath) {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      setCanonical(`${origin}${meta.canonicalPath}`);
    }

    return () => {
      document.title = prev.title;
      setMetaName('description', prev.description);
      setMetaProperty('og:title', prev.ogTitle);
      setMetaProperty('og:description', prev.ogDescription);
      setMetaProperty('og:image', prev.ogImage);
      setMetaProperty('og:image:alt', prev.ogImageAlt);
      setMetaName('twitter:image:alt', prev.twitterImageAlt);
      setMetaName('twitter:card', prev.twitterCard);
      setMetaName('twitter:title', prev.twitterTitle);
      setMetaName('twitter:description', prev.twitterDescription);
      setMetaName('twitter:image', prev.twitterImage);
      setCanonical(prev.canonical);
    };
  }, [meta.title, meta.description, meta.section, meta.canonicalPath, meta.fullTitle, meta.ogImage]);
}
