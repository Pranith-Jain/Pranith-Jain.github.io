import { describe, it, expect } from 'vitest';
import {
  computeStreak,
  parseContributions,
  renderLangsSvg,
  renderOverviewSvg,
  renderStreakSvg,
  escapeXml,
} from '../../src/lib/profile-stats';

describe('computeStreak', () => {
  it('computes current, longest, and total for a live run ending today', () => {
    const today = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10);
    const days: Record<string, number> = {};
    for (let i = 0; i < 5; i++) {
      days[new Date(Date.parse(start) + i * 86_400_000).toISOString().slice(0, 10)] = 2 + i;
    }
    const stats = computeStreak(days);
    expect(stats.current).toBe(5);
    expect(stats.longest).toBe(5);
    expect(stats.total).toBe(2 + 3 + 4 + 5 + 6);
  });

  it('keeps the run ending yesterday when today has none (day not over)', () => {
    const today = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    const days: Record<string, number> = {};
    for (let i = 0; i < 3; i++) {
      days[new Date(Date.parse(start) + i * 86_400_000).toISOString().slice(0, 10)] = 1;
    }
    expect(days[today]).toBeUndefined();
    const stats = computeStreak(days);
    expect(stats.current).toBe(3);
  });

  it('breaks the current streak when both today and yesterday are empty', () => {
    const today = new Date().toISOString().slice(0, 10);
    const gapDate = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    const days: Record<string, number> = { [gapDate]: 1, [gapDate.slice(0, 8) + '01']: 0 };
    delete days[gapDate.slice(0, 8) + '01'];
    const earlier = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
    const stats = computeStreak({ [today]: 0, [gapDate]: 0, [earlier]: 1 });
    expect(stats.current).toBe(0);
  });

  it('finds the longest run across a gap while current is broken', () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const runA = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    const days: Record<string, number> = {};
    for (let i = 0; i < 4; i++) {
      days[new Date(Date.parse(runA) + i * 86_400_000).toISOString().slice(0, 10)] = 1;
    }
    days[today] = 0;
    days[yesterday] = 0;
    const stats = computeStreak(days);
    expect(stats.longest).toBe(4);
    expect(stats.total).toBe(4);
  });
});

describe('parseContributions', () => {
  it('parses the data-date-first fragment format', () => {
    const html =
      '<td class="ContributionCalendar-day" data-date="2026-08-10" data-count="3"></td>' +
      '<td data-date="2026-08-11" data-count="0"></td>';
    const days = parseContributions(html);
    expect(days['2026-08-10']).toBe(3);
    expect(days['2026-08-11']).toBe(0);
  });

  it('parses the data-count-first fragment format', () => {
    const days = parseContributions('<td data-count="7" data-date="2026-08-10"></td>');
    expect(days['2026-08-10']).toBe(7);
  });

  it('parses the modern tooltip format (zipped cells + tool-tips)', () => {
    const html =
      '<td data-date="2026-08-09" data-level="0" class="ContributionCalendar-day"></td>' +
      '<tool-tip for="contribution-day-component-0-0">No contributions on August 9th.</tool-tip>' +
      '<td data-date="2026-08-16" data-level="3" class="ContributionCalendar-day"></td>' +
      '<tool-tip for="contribution-day-component-0-1">7 contributions on August 16th.</tool-tip>';
    const days = parseContributions(html);
    expect(days['2026-08-09']).toBe(0);
    expect(days['2026-08-16']).toBe(7);
  });

  it('falls back to binary data-level counts when tooltips are missing', () => {
    const days = parseContributions(
      '<td data-date="2026-08-10" data-level="3"></td>' + '<td data-date="2026-08-11" data-level="0"></td>'
    );
    expect(days['2026-08-10']).toBe(1);
    expect(days['2026-08-11']).toBeUndefined();
  });
});

describe('SVG renderers', () => {
  it('renders the overview card with formatted numbers', () => {
    const svg = renderOverviewSvg(
      { name: 'Pranith Jain', login: 'Pranith-Jain', publicRepos: 12, totalStars: 3456, followers: 89, following: 4 },
      'dark'
    );
    expect(svg).toContain("Pranith Jain's GitHub Stats");
    expect(svg).toContain('3,456');
    expect(svg).toContain('TOTAL STARS');
    expect(svg).toContain('REPOSITORIES');
    expect(svg).toContain('FOLLOWERS');
  });

  it('renders the streak card with day pluralisation', () => {
    const svg = renderStreakSvg({ current: 1, longest: 14, total: 1204 }, 'Pranith-Jain', 'light');
    expect(svg).toContain('1 day');
    expect(svg).toContain('CURRENT STREAK');
    expect(svg).toContain('1,204');
    expect(svg).toContain('14 days');
  });

  it('renders the languages card sorted by dominance with percentages', () => {
    const svg = renderLangsSvg(
      [
        { name: 'TypeScript', bytes: 900 },
        { name: 'Python', bytes: 100 },
      ],
      'dark'
    );
    expect(svg).toContain('TypeScript');
    expect(svg).toContain('90%');
    expect(svg).toContain('10%');
  });

  it('escapes XML-sensitive characters', () => {
    expect(escapeXml('A&B <C>')).toBe('A&amp;B &lt;C&gt;');
  });
});
