import { useEffect } from 'react';

/**
 * Set a noindex,nofollow meta tag on mount. Use for pages that should
 * remain accessible but not appear in search results (malware analysis
 * tools, admin panels, etc.).
 *
 * Cleans up on unmount so navigating away removes the tag.
 */
export function useNoindex(): void {
  useEffect(() => {
    const tag = document.createElement('meta');
    tag.name = 'robots';
    tag.content = 'noindex,nofollow';
    document.head.appendChild(tag);
    return () => {
      tag.remove();
    };
  }, []);
}
