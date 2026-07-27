#!/usr/bin/env node
/**
 * Fast scoped lint: runs ESLint only on the .ts/.tsx files changed vs HEAD
 * (tracked modifications + staged + untracked new files), instead of the whole
 * repo. The full `npm run lint` is slow because the config enables type-aware
 * linting (projectService) across the entire src/ tree; this script keeps the
 * same rules but scopes them to your working set, so it finishes in seconds.
 * Mirrors what lint-staged does on commit, but available on demand.
 */
import { execSync } from 'node:child_process';

function lines(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

const changed = new Set([
  ...lines('git diff --name-only --diff-filter=d HEAD'),
  ...lines('git diff --name-only --diff-filter=d --cached'),
  ...lines('git ls-files --others --exclude-standard'),
]);

const files = [...changed].filter((f) => /\.(ts|tsx)$/.test(f) && !f.startsWith('scripts/'));

if (files.length === 0) {
  console.log('lint-changed: no changed .ts/.tsx files - nothing to lint');
  process.exit(0);
}

console.log(`lint-changed: linting ${files.length} changed file(s)`);
const quoted = files.map((f) => JSON.stringify(f)).join(' ');
try {
  execSync(`npx eslint ${quoted} --report-unused-disable-directives --max-warnings 244`, { stdio: 'inherit' });
} catch {
  process.exit(1);
}
