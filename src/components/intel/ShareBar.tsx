import { useState, useCallback } from 'react';
import { Copy, Check, Link2 } from 'lucide-react';

/**
 * <ShareBar> — the single source of truth for the share row used across every
 * AI-summary / briefing / report surface.
 */
export interface ShareBarProps {
  shareText?: string;
  title?: string;
  url?: string;
  size?: 'sm' | 'md';
  label?: string;
  /** Prepended to the tweet text in the X share link only (e.g. '🚨 '). */
  xPrefix?: string;
  /** LinkedIn-flavored post body; "Copy LinkedIn" uses it when present
   *  (falls back to shareText). No URL — the UI appends it on copy. */
  linkedinText?: string;
  className?: string;
}

type CopiedKind = 'post' | 'linkedin' | 'link' | null;

export function ShareBar({
  shareText,
  title,
  url,
  size = 'md',
  label,
  xPrefix,
  linkedinText,
  className,
}: ShareBarProps): JSX.Element {
  const [copied, setCopied] = useState<CopiedKind>(null);
  const pageUrl = typeof window !== 'undefined' ? (url ?? window.location.href) : (url ?? '');
  const text = shareText?.trim() || title?.trim() || '';
  const linkedin = linkedinText?.trim() || text;

  const copyToClipboard = useCallback(async (payload: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(payload);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = payload;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        return true;
      } catch {
        return false;
      } finally {
        ta.remove();
      }
    }
  }, []);

  const copyPost = useCallback(async () => {
    const payload = text ? `${text}\n${pageUrl}` : pageUrl;
    if (await copyToClipboard(payload)) {
      setCopied('post');
      setTimeout(() => setCopied(null), 1800);
    }
  }, [text, pageUrl, copyToClipboard]);

  // LinkedIn never gets the URL in the body (reach cut); append it on its
  // own trailing line so the user can move it to the first comment.
  const copyLinkedin = useCallback(async () => {
    const payload = linkedin ? `${linkedin}\n\n${pageUrl}` : pageUrl;
    if (await copyToClipboard(payload)) {
      setCopied('linkedin');
      setTimeout(() => setCopied(null), 1800);
    }
  }, [linkedin, pageUrl, copyToClipboard]);

  const copyLink = useCallback(async () => {
    if (await copyToClipboard(pageUrl)) {
      setCopied('link');
      setTimeout(() => setCopied(null), 1800);
    }
  }, [pageUrl, copyToClipboard]);

  const nativeShare = useCallback(async () => {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return;
    try {
      await navigator.share({ title: title || text.slice(0, 80), text, url: pageUrl });
    } catch {
      /* no-op */
    }
  }, [title, text, pageUrl]);

  const xIntent = `https://x.com/intent/tweet?text=${encodeURIComponent((xPrefix ?? '') + text)}&url=${encodeURIComponent(pageUrl)}`;
  const liIntent = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`;

  const btnBase =
    size === 'sm'
      ? 'inline-flex items-center gap-1 text-micro font-mono px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600/50 hover:border-brand-500/50 text-muted transition-colors'
      : 'inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 hover:bg-brand-500/5 transition-colors';
  const postBtn =
    size === 'sm'
      ? 'inline-flex items-center gap-1 text-micro font-mono px-1.5 py-0.5 rounded border border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:bg-brand-500/20 transition-colors'
      : 'inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-xl border border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:bg-brand-500/20 transition-colors';
  const icons = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5';

  const showNative = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ''}`}>
      {label && <span className="text-micro font-mono text-muted mr-1">{label}</span>}
      <a href={xIntent} target="_blank" rel="noopener noreferrer" className={btnBase} aria-label="Share on X">
        <svg viewBox="0 0 24 24" className={icons} fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        X
      </a>
      <a href={liIntent} target="_blank" rel="noopener noreferrer" className={btnBase} aria-label="Share on LinkedIn">
        <svg viewBox="0 0 24 24" className={icons} fill="currentColor" aria-hidden="true">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
        LinkedIn
      </a>
      <button type="button" onClick={copyPost} title="Copy a ready-to-paste post (text + link)" className={postBtn}>
        {copied === 'post' ? <Check className={`${icons} text-emerald-500`} /> : <Copy className={icons} />}
        {copied === 'post' ? 'Copied' : 'Copy post'}
      </button>
      <button
        type="button"
        onClick={copyLinkedin}
        title="Copy a LinkedIn-native post (URL appended for the first comment)"
        className={postBtn}
      >
        {copied === 'linkedin' ? <Check className={`${icons} text-emerald-500`} /> : <Copy className={icons} />}
        {copied === 'linkedin' ? 'Copied' : 'Copy LinkedIn'}
      </button>
      <button type="button" onClick={copyLink} title="Copy the bare URL" className={btnBase}>
        {copied === 'link' ? <Check className={`${icons} text-emerald-500`} /> : <Link2 className={icons} />}
        {copied === 'link' ? 'Copied' : 'Link'}
      </button>
      {showNative && (
        <button
          type="button"
          onClick={nativeShare}
          title="Open the native share sheet"
          className={btnBase}
          aria-label="Share via device share sheet"
        >
          <svg
            className={icons}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          Share
        </button>
      )}
    </div>
  );
}
