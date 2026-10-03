import { describe, it, expect } from 'vitest';
import { stripConnectorEmDashes, countConnectorEmDashes, NO_EM_DASH_RULE } from '../../src/lib/prose-style';

/**
 * The point of these tests is the four things a blanket `—` -> `, ` codemod
 * gets wrong. PRODUCT.md calls them out explicitly, so they are pinned here.
 */

describe('stripConnectorEmDashes — rewrites genuine connectors', () => {
  it('replaces a spaced dash between two words in running prose', () => {
    expect(stripConnectorEmDashes('Aggregates results in one pass — a single query can surface 900+ hits.')).toBe(
      'Aggregates results in one pass, a single query can surface 900+ hits.'
    );
  });

  it('handles an em dash used as a leading aside', () => {
    expect(stripConnectorEmDashes('The tool is fast — unusually so for a browser build.')).toBe(
      'The tool is fast, unusually so for a browser build.'
    );
  });

  it('handles an en dash the same way', () => {
    expect(stripConnectorEmDashes('Runs client side – no server required.')).toBe(
      'Runs client side, no server required.'
    );
  });

  it('rewrites several connectors on one line', () => {
    const out = stripConnectorEmDashes('One — two — three — four.');
    expect(out).toBe('One, two, three, four.');
  });

  it('collapses the doubled-comma artefact', () => {
    expect(stripConnectorEmDashes('Value — — more value.')).toBe('Value, more value.');
  });

  it('does not leave a comma before closing punctuation', () => {
    expect(stripConnectorEmDashes('A claim — here.')).toBe('A claim, here.');
  });

  it('normalises the space a dash leaves behind', () => {
    expect(stripConnectorEmDashes('Padded    text — continues.')).toBe('Padded text, continues.');
  });
});

describe('stripConnectorEmDashes — preserves structural uses', () => {
  it('keeps a bare em dash standing in for a missing table value', () => {
    const row = '| Mean dwell time | — | 4.2 |';
    expect(stripConnectorEmDashes(row)).toBe(row);
  });

  it('keeps a bare glyph line', () => {
    expect(stripConnectorEmDashes('—')).toBe('—');
  });

  it('keeps numeric ranges byte-for-byte, dash character included', () => {
    // Normalising an en dash to a hyphen would be an unrequested content edit.
    expect(stripConnectorEmDashes('Ranging from 70—80 percent.')).toBe('Ranging from 70—80 percent.');
    expect(stripConnectorEmDashes('Between 1,200—1,500 requests.')).toBe('Between 1,200—1,500 requests.');
    expect(stripConnectorEmDashes('CVSS range 9.0–10.0 stays.')).toBe('CVSS range 9.0–10.0 stays.');
  });

  it('keeps dashes inside a markdown table', () => {
    const table = ['| Tool | Score | Note |', '|---|---:|---|', '| Strix | 70—80 | — |'].join('\n');
    expect(stripConnectorEmDashes(table)).toBe(table);
  });

  it('keeps a heading that uses a dash as a label delimiter', () => {
    const h = '### Scoping — what to collect first';
    expect(stripConnectorEmDashes(h)).toBe(h);
  });

  it('keeps a definition-style bullet', () => {
    const b = '- Detection gap — most rules key on the encryptor hash';
    expect(stripConnectorEmDashes(b)).toBe(b);
  });

  it('keeps dashes inside fenced code', () => {
    const block = ['```yaml', 'rule:  high — severity', '```'].join('\n');
    expect(stripConnectorEmDashes(block)).toBe(block);
  });

  it('keeps a quoted headline verbatim', () => {
    const q = '> LockBit claims a healthcare victim — 4 TB exfiltrated';
    expect(stripConnectorEmDashes(q)).toBe(q);
  });

  it('does not corrupt a URL', () => {
    const u = 'See https://example.com/a—b for the range.';
    expect(stripConnectorEmDashes(u)).toContain('a—b');
  });
});

describe('stripConnectorEmDashes — general contract', () => {
  it('is a no-op on input with no dashes', () => {
    const s = 'Nothing to change here.';
    expect(stripConnectorEmDashes(s)).toBe(s);
  });

  it('handles empty and nullish input', () => {
    expect(stripConnectorEmDashes('')).toBe('');
    expect(stripConnectorEmDashes(undefined as unknown as string)).toBeUndefined();
  });

  it('is idempotent', () => {
    const src = 'One — two. Keep | — | and 70—80 and ### Label — def.';
    const once = stripConnectorEmDashes(src);
    expect(stripConnectorEmDashes(once)).toBe(once);
  });

  it('leaves no connector behind after a single pass', () => {
    const src = 'First — second. Third — fourth.';
    expect(stripConnectorEmDashes(src)).not.toContain('—');
  });

  it('preserves line count and does not drop content', () => {
    const src = ['Line one — aside.', '', 'Line two.', '| a | — |'].join('\n');
    const out = stripConnectorEmDashes(src);
    expect(out.split('\n')).toHaveLength(src.split('\n').length);
    expect(out).toContain('Line one, aside.');
    expect(out).toContain('Line two.');
    expect(out).toContain('| a | — |');
  });

  it('tolerates CRLF input', () => {
    expect(stripConnectorEmDashes('A — b\r\nC — d\r\n')).toBe('A, b\r\nC, d\r\n');
  });
});

describe('countConnectorEmDashes', () => {
  it('counts only connectors, not structural dashes', () => {
    const doc = [
      'Real prose — with a connector.',
      '| cell | — |',
      '### Heading — label',
      'Range 70—80 and 1,200—1,500.',
      'Another connector — here.',
    ].join('\n');
    expect(countConnectorEmDashes(doc)).toBe(2);
  });

  it('returns 0 for clean prose', () => {
    expect(countConnectorEmDashes('All clean, nothing to see.')).toBe(0);
  });

  it('agrees with the stripper: count equals dashes removed', () => {
    const doc = 'One — two — three.\n| x | — |\n### A — b';
    const stripped = stripConnectorEmDashes(doc);
    const before = (doc.match(/[\u2014\u2013]/g) ?? []).length;
    const after = (stripped.match(/[\u2014\u2013]/g) ?? []).length;
    expect(before - after).toBe(countConnectorEmDashes(doc));
  });
});

describe('NO_EM_DASH_RULE', () => {
  it('names the prohibited shapes', () => {
    expect(NO_EM_DASH_RULE).toContain('—');
    expect(NO_EM_DASH_RULE.toLowerCase()).toContain('sentence connector');
  });

  it('spells out the structural exceptions so the model does not over-apply it', () => {
    const r = NO_EM_DASH_RULE.toLowerCase();
    expect(r).toContain('table');
    expect(r).toContain('range');
    expect(r).toContain('label');
    expect(r).toContain('verbatim');
  });

  it('is a prompt fragment, not a full system prompt', () => {
    expect(NO_EM_DASH_RULE.startsWith('\n')).toBe(true);
    expect(NO_EM_DASH_RULE.length).toBeGreaterThan(100);
    expect(NO_EM_DASH_RULE.length).toBeLessThan(1200);
  });
});
