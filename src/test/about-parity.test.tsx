import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TimelineChapter } from '../components/sections/TimelineChapter';

/**
 * Phase 3 visual parity check.
 *
 * The migration extracted the inline timeline markup from About.tsx
 * into <TimelineChapter>. This test confirms the extracted component
 * produces the same DOM structure as the original would have.
 */
describe('Phase 3: About page visual parity', () => {
  it('matches the original inline DOM structure', () => {
    // Render one chapter the way About does
    const { container } = render(
      <TimelineChapter
        period="2024 — Present / Security Automation & AI"
        tags={['n8n Automation', 'AI Security', 'NHI Governance', 'Cloudflare']}
      >
        <p>First body paragraph.</p>
        <p>Second body paragraph.</p>
      </TimelineChapter>
    );

    // The outermost wrapper should have the relative + pl positioning
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toMatch(/relative/);
    expect(wrapper.className).toMatch(/pl-8/);

    // There should be 2 absolutely-positioned children (rail + dot)
    const absoluteChildren = wrapper.querySelectorAll(':scope > .absolute');
    expect(absoluteChildren).toHaveLength(2);

    // The rail is the 1px-wide bar
    const rail = absoluteChildren[0] as HTMLElement;
    expect(rail.className).toMatch(/w-px/);
    expect(rail.className).toMatch(/bg-slate-200/);

    // The dot is the rounded-full
    const dot = absoluteChildren[1] as HTMLElement;
    expect(dot.className).toMatch(/rounded-full/);
    expect(dot.className).toMatch(/border-2/);
    expect(dot.className).toMatch(/border-brand-500/);

    // The period eyebrow
    const period = wrapper.querySelector('.text-eyebrow') as HTMLElement;
    expect(period.textContent).toBe('2024 — Present / Security Automation & AI');
    expect(period.className).toMatch(/font-mono/);
    expect(period.className).toMatch(/uppercase/);

    // The 2 paragraphs are inside the body container
    const paragraphs = wrapper.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].textContent).toBe('First body paragraph.');

    // The 4 tags
    const tags = wrapper.querySelectorAll('span.rounded-md');
    expect(tags).toHaveLength(4);
    expect(tags[0].textContent).toBe('n8n Automation');
  });
});
