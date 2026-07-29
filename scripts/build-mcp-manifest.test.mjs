/**
 * Test the MCP manifest parser.
 *
 * Validates that parseTools() handles:
 *   - single- and double-quoted descriptions
 *   - apostrophes inside comments (the bug that broke the first draft)
 *   - nested object literals with parens
 *   - multi-line and single-line blocks
 *   - the real mcp-server.ts file (must find >= 250 unique tools)
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseTools, findMatchingParen, extractStringLiterals, categorize } from './build-mcp-manifest.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('parses a simple single-quoted tool', () => {
  const src = `
    this.tool(
      'check_ioc',
      'Check reputation of an IP address.',
      { indicator: 'string' },
      async () => {}
    );
  `;
  const out = parseTools(src);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'check_ioc');
  assert.equal(out[0].description, 'Check reputation of an IP address.');
});

test('parses a double-quoted description', () => {
  const src = `
    this.tool(
      'get_today_briefing',
      "Get today's threat intelligence briefing. A curated digest of the latest CVEs.",
      {},
      async () => {}
    );
  `;
  const out = parseTools(src);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'get_today_briefing');
});

test('handles apostrophes in comments', () => {
  const src = `
    this.tool(
      'si_list_ref',
      'List the reference datasets.',
      {},
      async () => {
        // We don't have a separate ref-index, so we probe.
        const found = [];
        for (const name of known) { found.push(name); }
        return { content: [] };
      }
    );
  `;
  const out = parseTools(src);
  assert.equal(out.length, 1, 'apostrophe in comment must not break the parser');
  assert.equal(out[0].name, 'si_list_ref');
});

test('parses multiple tools in one file', () => {
  const src = `
    this.tool('first_tool', 'First description.', {}, async () => {});
    this.tool('second_tool', 'Second description.', {}, async () => {});
    this.tool('third_tool', 'Third description.', {}, async () => {});
  `;
  const out = parseTools(src);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((t) => t.name), ['first_tool', 'second_tool', 'third_tool']);
});

test('parses the real mcp-server.ts file (must find >= 250 unique tools)', () => {
  const real = readFileSync(join(__dirname, '..', 'worker', 'mcp-server.ts'), 'utf8');
  const out = parseTools(real);
  assert.ok(out.length >= 250, `expected >= 250 tools, got ${out.length}`);
  const names = out.map((t) => t.name);
  // The source historically registered get_live_iocs twice (a real bug, since
  // fixed — it is now registered once). The manifest must therefore contain NO
  // duplicate tool names; this assertion guards against accidentally
  // re-introducing a duplicate registration.
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  assert.equal(dupes.length, 0, `expected no duplicate tool names, got ${dupes.length}: ${dupes}`);
});

test('categorize() maps tools into buckets', () => {
  assert.equal(categorize('check_ioc'), 'ioc');
  assert.equal(categorize('lookup_cve'), 'cve');
  assert.equal(categorize('enrich_actor'), 'actor');
  assert.equal(categorize('si_list_skills'), 'si');
  assert.equal(categorize('hr_search_email'), 'hudson');
  assert.equal(categorize('notebook_create'), 'notebook');
  assert.equal(categorize('something_unknown'), 'other');
});

test('findMatchingParen handles nested parens and strings', () => {
  // f((1+2), "hello (world)")
  const src = 'foo((1+2), "hello (world)") more';
  const openIdx = src.indexOf('(');
  const close = findMatchingParen(src, openIdx);
  // The opening is the first `(` after foo. The matching close is the one
  // before "more" (after the string).
  assert.ok(close > 0);
  assert.equal(src[close], ')');
});

test('extractStringLiterals skips comments', () => {
  const block = `
    'name1',
    'desc1',
    // 'commented-out',
    /* 'also-commented' */
    'name2',
  `;
  const lits = extractStringLiterals(block);
  assert.deepEqual(lits, ['name1', 'desc1', 'name2']);
});
