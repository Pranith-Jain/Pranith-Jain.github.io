import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { IocChip } from '../dfir/IocChip';
import { middleTruncate } from '../../lib/middle-truncate';

function renderChip(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('middleTruncate', () => {
  it('leaves short values untouched', () => {
    expect(middleTruncate('1.2.3.4', 40)).toBe('1.2.3.4');
  });
  it('keeps both ends of a long value', () => {
    const v = 'a'.repeat(20) + 'b'.repeat(20);
    const out = middleTruncate(v, 11);
    expect(out).toContain('…');
    expect(out.startsWith('aaaaa')).toBe(true);
    expect(out.endsWith('bbbbb')).toBe(true);
  });
  it('treats non-finite/zero max as no truncation', () => {
    expect(middleTruncate('abc', Infinity)).toBe('abc');
    expect(middleTruncate('abc', 0)).toBe('abc');
  });
});

describe('IocChip', () => {
  it('auto-detects type and exposes it to assistive tech', () => {
    const { container } = renderChip(<IocChip value="1.2.3.4" />);
    expect(container.textContent).toContain('1.2.3.4');
    expect(container.textContent).toContain('IPv4'); // sr-only type prefix
  });

  it('refangs defanged input to its canonical form', () => {
    const { container } = renderChip(<IocChip value="1.2.3[.]4" />);
    expect(container.textContent).toContain('1.2.3.4');
    expect(container.textContent).not.toContain('[.]');
  });

  it('renders null for empty / whitespace values', () => {
    const { container } = renderChip(<IocChip value="   " />);
    expect(container).toBeEmptyDOMElement();
  });

  it('falls back to a neutral chip with no pivots for unrecognised values', () => {
    renderChip(<IocChip value="just some prose" />);
    expect(screen.getByText(/Indicator:/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pivot/i })).not.toBeInTheDocument();
  });

  it('shows a copy control by default and hides it when copyable=false', () => {
    const { rerender } = renderChip(<IocChip value="8.8.8.8" pivots={false} />);
    expect(screen.getByRole('button', { name: /copy 8\.8\.8\.8/i })).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <IocChip value="8.8.8.8" pivots={false} copyable={false} />
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: /copy/i })).not.toBeInTheDocument();
  });

  it('opens an accessible pivot menu of related tools', async () => {
    const user = userEvent.setup();
    renderChip(<IocChip value="1.1.1.1" />);
    const trigger = screen.getByRole('button', { name: /pivot 1\.1\.1\.1/i });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.length).toBeGreaterThan(0);
    // The IOC Checker is the universal primary pivot for network indicators.
    expect(within(menu).getByText('IOC Checker')).toBeInTheDocument();
    expect(items[0]).toHaveAttribute('href', expect.stringContaining('/dfir/ioc-check'));
  });

  it('announces the verdict to screen readers', () => {
    const { container } = renderChip(<IocChip value="6.6.6.6" verdict="malicious" />);
    expect(container.textContent).toContain('(malicious)');
  });

  it('middle-truncates long values but keeps the full value in the title', () => {
    const hash = 'a1b2c3d4'.repeat(8); // 64-char sha256
    renderChip(<IocChip value={hash} type="hash-sha256" />);
    expect(screen.getByTitle(hash)).toBeInTheDocument();
  });

  it('renders a skeleton when loading', () => {
    const { container } = renderChip(<IocChip value="1.2.3.4" loading />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    // Skeleton must not leak the value or interactive controls.
    expect(container.textContent).not.toContain('1.2.3.4');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
