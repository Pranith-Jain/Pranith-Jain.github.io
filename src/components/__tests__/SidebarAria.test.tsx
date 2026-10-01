/**
 * Sidebar collapsible-group ARIA integrity.
 *
 * The bug this guards: each group button carried an unconditional
 * `aria-controls="sidebar-group-<slug>"` while the `<ul>` it pointed at only
 * rendered when the group was expanded. Roughly 20 collapsed groups were
 * therefore pointing at IDs absent from the DOM.
 *
 * The invariant worth locking down is generic rather than incidental:
 *
 *     every aria-controls value on the page resolves to a real element id
 *
 * That catches this bug if it reappears in a new collapsible component, and
 * it is the actual accessibility contract - a dangling reference is worse
 * than no reference at all, because AT reports it as a broken control
 * instead of simply having nothing to announce.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SidebarContent } from '../Sidebar';
import { getSidebarForSection } from '../../data/sidebar-nav';
import type { SidebarConfig } from '../../data/sidebar-nav';

/** Every aria-controls target on the page must exist as an element id. */
function assertNoDanglingControls(container: HTMLElement) {
  const ids = new Set(Array.from(container.querySelectorAll('[id]')).map((el) => el.id));
  const dangling: string[] = [];
  for (const el of Array.from(container.querySelectorAll('[aria-controls]'))) {
    const target = el.getAttribute('aria-controls')!;
    if (!ids.has(target)) dangling.push(target);
  }
  expect(dangling, `aria-controls pointing at missing ids: ${dangling.join(', ')}`).toEqual([]);
}

function renderSidebar(config: SidebarConfig, route = '/threatintel') {
  const { container } = render(
    <MemoryRouter initialEntries={[route]}>
      <SidebarContent config={config} />
    </MemoryRouter>
  );
  return container;
}

describe('Sidebar group ARIA', () => {
  const TI = getSidebarForSection('/threatintel')!;
  const DFIR = getSidebarForSection('/dfir')!;

  it('resolves configs for both surfaces', () => {
    expect(TI.groups.length).toBeGreaterThan(0);
    expect(DFIR.groups.length).toBeGreaterThan(0);
  });

  it('has no dangling aria-controls on first render (all groups collapsed)', () => {
    assertNoDanglingControls(renderSidebar(TI));
  });

  it('has no dangling aria-controls for the DFIR config too', () => {
    assertNoDanglingControls(renderSidebar(DFIR, '/dfir'));
  });

  it('omits aria-controls while a group is collapsed', () => {
    renderSidebar(TI);
    const collapsed = screen
      .getAllByRole('button', { expanded: false })
      .filter((b) => b.getAttribute('aria-controls') !== null);
    expect(collapsed).toHaveLength(0);
  });

  it('sets aria-controls once expanded, and the target resolves', async () => {
    const container = renderSidebar(TI);
    const firstCollapsed = screen.getAllByRole('button', { expanded: false })[0]!;
    await userEvent.click(firstCollapsed);

    const nowExpanded = screen.getAllByRole('button', { expanded: true })[0]!;
    const target = nowExpanded.getAttribute('aria-controls');
    expect(target).toBeTruthy();
    expect(container.querySelector(`#${CSS.escape(target!)}`)).toBeInTheDocument();
    assertNoDanglingControls(container);
  });

  it('stays clean through a collapse/expand cycle', async () => {
    const container = renderSidebar(TI);
    for (let i = 0; i < 3; i += 1) {
      const collapsed = screen.getAllByRole('button', { expanded: false });
      if (collapsed.length === 0) break;
      await userEvent.click(collapsed[0]!);
      assertNoDanglingControls(container);
      await userEvent.click(screen.getAllByRole('button', { expanded: true })[0]!);
      assertNoDanglingControls(container);
    }
  });

  it('every expanded group list is a real ul with a matching id', async () => {
    const container = renderSidebar(TI);
    const collapsed = screen.getAllByRole('button', { expanded: false });
    await userEvent.click(collapsed[0]!);

    const btn = screen.getAllByRole('button', { expanded: true })[0]!;
    const id = btn.getAttribute('aria-controls')!;
    const list = container.querySelector(`#${CSS.escape(id)}`);
    expect(list?.tagName).toBe('UL');
  });
});
