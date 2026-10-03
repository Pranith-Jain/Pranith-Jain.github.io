// Count remaining *connector* em dashes in UI copy across src/, reusing the
// stripper's own rules so the count and the post-processor never disagree.
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { countConnectorEmDashes } from './prose-style.ts';

const hits = {};
let total = 0;
for (const f of globSync('src/**/*.{tsx,ts}')) {
  const n = countConnectorEmDashes(readFileSync(f, 'utf8'));
  if (n > 0) {
    total += n;
    hits[f] = n;
  }
}
console.log('remaining connector em dashes (stripper would rewrite):', total);
const top = Object.entries(hits).sort((a, b) => b[1] - a[1]);
for (const [f, n] of top) console.log(String(n).padStart(3), f);
