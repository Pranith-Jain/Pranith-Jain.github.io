import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../../src/case-study/rendering/markdown';
describe('renderMarkdown', () => {
    it('converts markdown to HTML', () => {
        const html = renderMarkdown('## Summary\n\nHello.');
        expect(html).toContain('<h2');
        expect(html).toContain('Summary');
        expect(html).toContain('Hello.');
    });
    it('auto-links IPv4 addresses to the IOC checker', () => {
        const html = renderMarkdown('Found at 1.2.3.4 in logs.');
        expect(html).toContain('/dfir/ioc-check?q=1.2.3.4');
    });
    it('auto-links sha256 hashes', () => {
        const sha = 'a'.repeat(64);
        const html = renderMarkdown(`Hash: ${sha}`);
        expect(html).toContain(`/dfir/ioc-check?q=${sha}`);
    });
    it('does not modify text inside code spans', () => {
        const html = renderMarkdown('`1.2.3.4` should stay as code.');
        expect(html).not.toContain('/dfir/ioc-check?q=1.2.3.4');
    });
    it('sanitizes inline scripts', () => {
        const html = renderMarkdown('<script>alert(1)</script> and **bold**');
        expect(html).not.toMatch(/<script/i);
        expect(html).toContain('<strong>');
    });
});
