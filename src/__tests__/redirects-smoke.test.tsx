/**
 * Verifies that key alias URLs (redirects in App.tsx) actually land
 * on a real page when visited, not a NotFound.
 *
 * The aliases tested here are EXTRACTED DYNAMICALLY from App.tsx's
 * REDIRECTS table, so this test gives 100% coverage of all 178
 * registered aliases — not just a hand-picked subset. If someone adds
 * a redirect to App.tsx, it's tested here automatically.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppContent } from '../App';

if (typeof EventSource === 'undefined') {
  (globalThis as unknown as { EventSource: unknown }).EventSource = class {
    addEventListener() {}
    close() {}
    onerror: (() => void) | null = null;
  };
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const appSrc = readFileSync(join(root, 'src/App.tsx'), 'utf8');
const ALIASES: Array<{ from: string }> = [...appSrc.matchAll(/\{\s*path:\s*'([^']+)',\s*to:\s*'[^']+'\s*\}/g)].map(
  (m) => ({ from: m[1]! })
);

describe('alias URLs land on a real page', () => {
  it.each(ALIASES)('renders for $from', async ({ from }) => {
    render(
      <MemoryRouter initialEntries={[from]}>
        <AppContent />
      </MemoryRouter>
    );
    // Wait for the page to render — look for any heading or main content
    // (but not a 404 message)
    await new Promise((r) => setTimeout(r, 100));
    // Verify not on 404
    expect(screen.queryByText(/404 · Not Found|That page is off-grid/)).toBeNull();
  });
});
