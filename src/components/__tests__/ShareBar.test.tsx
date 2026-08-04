import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareBar } from '../intel/ShareBar';

beforeEach(() => vi.restoreAllMocks());

describe('ShareBar', () => {
  it('renders X + LinkedIn + Copy post + Copy link buttons', () => {
    render(<ShareBar shareText="Daily threat brief" url="https://x.io/brief" />);
    expect(screen.getByRole('link', { name: /share on x/i })).toHaveAttribute(
      'href',
      expect.stringContaining(encodeURIComponent('Daily threat brief'))
    );
    expect(screen.getByRole('link', { name: /share on linkedin/i })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fx.io%2Fbrief'
    );
    expect(screen.getByRole('button', { name: /copy post/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^link$/i })).toBeInTheDocument();
  });

  it('the X intent carries both the share text and the URL', () => {
    render(<ShareBar shareText="🚨 2 critical CVEs" url="https://x.io/daily-2026-08-03" />);
    const href = screen.getByRole('link', { name: /share on x/i }).getAttribute('href') ?? '';
    expect(href).toContain(encodeURIComponent('🚨 2 critical CVEs'));
    expect(href).toContain('url=' + encodeURIComponent('https://x.io/daily-2026-08-03'));
  });

  it('"Copy post" copies the share text + URL joined by a newline', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ShareBar shareText="hook line" url="https://x.io/b" />);
    await userEvent.click(screen.getByRole('button', { name: /copy post/i }));
    expect(writeText).toHaveBeenCalledWith('hook line\nhttps://x.io/b');
  });

  it('"Copy link" copies only the bare URL', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ShareBar shareText="hook" url="https://x.io/b" />);
    await userEvent.click(screen.getByRole('button', { name: /^link$/i }));
    expect(writeText).toHaveBeenCalledWith('https://x.io/b');
  });

  it('falls back to the title when no shareText is supplied', () => {
    render(<ShareBar title="My Report" url="https://x.io/r" />);
    expect(screen.getByRole('link', { name: /share on x/i }).getAttribute('href') ?? '').toContain(
      encodeURIComponent('My Report')
    );
  });

  it('hides the native Share button when navigator.share is unavailable', () => {
    render(<ShareBar shareText="x" url="https://x.io/b" />);
    expect(screen.queryByRole('button', { name: /share via device/i })).not.toBeInTheDocument();
  });

  it('shows the native Share button when navigator.share is a function', () => {
    Object.assign(navigator, { share: vi.fn().mockResolvedValue(undefined) });
    render(<ShareBar shareText="x" url="https://x.io/b" />);
    expect(screen.getByRole('button', { name: /share via device/i })).toBeInTheDocument();
  });

  it('renders the optional leading label', () => {
    render(<ShareBar shareText="x" url="https://x.io/b" label="Share:" />);
    expect(screen.getByText('Share:')).toBeInTheDocument();
  });

  it('the sm size variant renders compact buttons (text-micro class)', () => {
    render(<ShareBar shareText="x" url="https://x.io/b" size="sm" />);
    const xLink = screen.getByRole('link', { name: /share on x/i });
    expect(xLink.className).toContain('text-micro');
    expect(xLink.className).not.toContain('text-xs');
  });
});
