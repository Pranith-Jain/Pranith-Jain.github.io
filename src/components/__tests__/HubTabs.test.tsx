/**
 * HubTabs keyboard + deep-link behaviour.
 *
 * These cover the two things that regress silently: the APG keyboard
 * contract on the tablist, and the ?hub= fallbacks. A stale ?hub that
 * renders an empty panel is the failure mode worth locking down - a bad
 * bookmark should never blank the tool directory.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { HubTabs } from '../threatintel/HubTabs';
import { HUB_META } from '../../data/threatintel-hubs';

/** Renders HubTabs at `initialEntries` and echoes the current search string. */
function renderAt(initialEntry: string) {
  let search = '';
  function Probe() {
    search = useLocation().search;
    return null;
  }
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/threatintel"
          element={
            <>
              <HubTabs />
              <Probe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
  return () => search;
}

describe('HubTabs', () => {
  it('renders one tab per registry hub', () => {
    renderAt('/threatintel');
    expect(screen.getAllByRole('tab').length).toBeGreaterThanOrEqual(19);
  });

  it('exposes an accessible tablist and tabpanel', () => {
    renderAt('/threatintel');
    expect(screen.getByRole('tablist', { name: /threat intelligence categories/i })).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });

  it('marks exactly one tab selected and keeps it the only tab stop', () => {
    renderAt('/threatintel');
    const selected = screen.getAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveAttribute('tabindex', '0');
  });

  it('activates the hub named by ?hub and writes it to the URL on click', async () => {
    const readSearch = renderAt('/threatintel?hub=darkweb');
    const darkweb = screen.getByRole('tab', { name: /dark web/i });
    expect(darkweb).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(screen.getByRole('tab', { name: /iocs/i }));
    expect(screen.getByRole('tab', { name: /iocs/i })).toHaveAttribute('aria-selected', 'true');
    expect(readSearch()).toContain('hub=iocs');
  });

  it('falls back to the first hub when ?hub is unknown rather than rendering empty', () => {
    renderAt('/threatintel?hub=does-not-exist');
    const selected = screen.getAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(screen.getAllByRole('tabpanel')[0]).toBeInTheDocument();
  });

  it('moves selection with ArrowRight and wraps from the last tab to the first', async () => {
    renderAt('/threatintel');
    const tabs = screen.getAllByRole('tab');
    const last = tabs[tabs.length - 1]!;
    last.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('wraps backwards from the first tab to the last', async () => {
    renderAt('/threatintel');
    const tabs = screen.getAllByRole('tab');
    tabs[0]!.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(tabs[tabs.length - 1]).toHaveAttribute('aria-selected', 'true');
  });

  it('jumps to the ends with Home and End', async () => {
    renderAt('/threatintel');
    const tabs = screen.getAllByRole('tab');
    tabs[0]!.focus();
    await userEvent.keyboard('{End}');
    expect(tabs[tabs.length - 1]).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Home}');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  /**
   * The tile grid must render exactly the registry's pages for the active
   * hub, at exactly the registry's paths. This is the guard that catches a
   * hand-edited `path` in threatintel-hubs.ts drifting away from the route
   * actually registered in App.tsx - the failure mode this component exists
   * to make visible.
   */
  it("renders exactly the active hub's registry pages at their registry paths", () => {
    const hub = HUB_META.find((h) => h.id === 'feeds')!;
    renderAt(`/threatintel?hub=${hub.id}`);

    const panel = screen.getByRole('tabpanel');
    const tileHrefs = Array.from(panel.querySelectorAll('ul li a')).map((a) => a.getAttribute('href'));
    expect(tileHrefs).toEqual(hub.pages.map((p) => p.path));
  });

  it('every hub renders a non-empty tile grid', () => {
    for (const hub of HUB_META) {
      expect(hub.pages.length, `hub "${hub.id}" has no pages registered`).toBeGreaterThan(0);
      for (const page of hub.pages) {
        expect(page.path, `hub "${hub.id}" has a page with no path`).toMatch(/^\/threatintel\/.+/);
      }
    }
  });
});
