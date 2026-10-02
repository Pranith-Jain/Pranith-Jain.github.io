#!/usr/bin/env node
/**
 * Find JSX form controls with no className and no props spread.
 *
 * A naive `<input[^>]*>` scan is wrong here: JSX handlers are full of `=>`,
 * so `[^>]*` stops inside `onChange={(e) => ...}` and the tag looks like it
 * ends before its className. This walks the tag with a small state machine
 * that tracks brace/paren/bracket depth and string literals, and only treats
 * `>` as the tag terminator at depth 0.
 *
 * A control is reported when it carries neither `className` nor a `{...props}`
 * spread (a spread could supply className), and is not `type="hidden"`.
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

function* jsxTags(src, tag) {
  // Blank out comments first. Prose like `// the <input> stays bound to
  // query` and `// a native <select> would get this for free` matches a raw
  // tag scan but is not a control. Comments are replaced with spaces rather
  // than removed, so every offset and line number below stays valid.
  const clean = src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

  const open = `<${tag}`;
  let i = 0;
  while (i < clean.length) {
    const at = clean.indexOf(open, i);
    if (at === -1) return;
    const after = clean[at + open.length];
    // `<input` must be followed by whitespace, `/`, or `>` to be a real tag.
    if (!/[\s/>]/.test(after ?? ' ')) {
      i = at + open.length;
      continue;
    }
    let j = at + open.length;
    let depth = 0;
    let quote = null;
    let end = -1;
    for (; j < clean.length; j++) {
      const c = clean[j];
      if (quote) {
        if (c === '\\') j++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        quote = c;
        continue;
      }
      if (c === '{' || c === '(' || c === '[') depth++;
      else if (c === '}' || c === ')' || c === ']') depth--;
      else if (c === '>' && depth === 0) {
        end = j;
        break;
      }
    }
    if (end === -1) return;
    yield { src: clean.slice(at, end + 1), line: clean.slice(0, at).split('\n').length };
    i = end + 1;
  }
}

const hits = [];
for (const file of globSync('src/**/*.tsx', { cwd: process.cwd() })) {
  const s = readFileSync(file, 'utf8');
  for (const tag of ['input', 'textarea', 'select']) {
    for (const { src: tagSrc, line } of jsxTags(s, tag)) {
      if (/className\s*=/.test(tagSrc)) continue;
      if (/\{\s*\.\.\./.test(tagSrc)) continue;
      if (/type\s*=\s*["'{]?\s*["']hidden["']/.test(tagSrc)) continue;
      // Checkbox / radio / range belong to a different control vocabulary:
      // they carry no border, fill or radius, so "no className" is correct
      // for them and applying the text-input recipe would be a regression.
      if (/\btype\s*=\s*["'](checkbox|radio|range|color|file)["']/.test(tagSrc)) continue;
      hits.push({ file, line, tag });
    }
  }
}
console.log('unstyled form controls:', hits.length);
for (const h of hits) console.log(`  ${h.file}:${h.line} <${h.tag}>`);