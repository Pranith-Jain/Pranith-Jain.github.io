import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimelineChapter } from '../components/sections/TimelineChapter';

/**
 * Phase 3 visual smoke test for the About page migration.
 * Confirms the extracted <TimelineChapter> component renders the
 * same DOM structure as the original inline markup would have.
 */
describe('Phase 3: TimelineChapter (extracted from About)', () => {
  it('renders the period label, paragraphs, and tags', () => {
    render(
      <TimelineChapter period="2022 / Foundation" tags={['Python', 'React']}>
        <p>First paragraph.</p>
        <p>Second paragraph.</p>
      </TimelineChapter>
    );
    expect(screen.getByText('2022 / Foundation')).toBeInTheDocument();
    expect(screen.getByText('First paragraph.')).toBeInTheDocument();
    expect(screen.getByText('Second paragraph.')).toBeInTheDocument();
    expect(screen.getByText('Python')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
  });

  it('renders tags as inline span elements (skill chips)', () => {
    const { container } = render(
      <TimelineChapter period="X" tags={['A', 'B', 'C']}>
        <p>x</p>
      </TimelineChapter>
    );
    const tagElements = Array.from(container.querySelectorAll('span')).filter((el) =>
      ['A', 'B', 'C'].includes(el.textContent ?? '')
    );
    expect(tagElements).toHaveLength(3);
    // Each tag should have the chip class — border + bg + padding
    for (const tag of tagElements) {
      expect(tag.className).toMatch(/rounded-md/);
      expect(tag.className).toMatch(/text-mini/);
      expect(tag.className).toMatch(/font-mono/);
    }
  });

  it('renders the timeline rail and dot (absolute-positioned elements)', () => {
    const { container } = render(
      <TimelineChapter period="X" tags={[]}>
        <p>x</p>
      </TimelineChapter>
    );
    // The rail (1px wide bar) and the dot (2.5x2.5 rounded-full) are
    // both absolutely positioned. The recipe's base layout still
    // produces the same visual elements.
    const absoluteChildren = container.querySelectorAll('.absolute');
    expect(absoluteChildren.length).toBeGreaterThanOrEqual(2);
  });
});
