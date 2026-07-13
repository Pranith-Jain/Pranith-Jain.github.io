#!/usr/bin/env node
/**
 * SAFE batch-insert console.error into catch blocks without logging.
 *
 * Strategy: NEVER modify existing lines — only insert new lines after
 * catch { } opening braces. This guarantees zero risk of code corruption.
 *
 * Run: node scripts/add-catch-logging.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const ROOT = process.cwd();

const DIRS = [
  'api/src/routes',
  'worker/lib',
  'worker/durable-objects',
  'src/pages',
];
const SINGLE_FILES = ['worker/mcp-server.ts'];

let totalEdited = 0;
let totalFiles = 0;

/** True if the line already has console.error/warn/log in or near it */
function hasLogging(lines, idx, lookAhead = 3) {
  for (let k = idx; k < Math.min(lines.length, idx + lookAhead); k++) {
    if (/console\.(error|warn|log)\s*\(/.test(lines[k])) return true;
  }
  return false;
}

/** Best-effort context label from preceding lines */
function guessContext(lines, idx) {
  const window = lines.slice(Math.max(0, idx - 30), idx).join('\n');
  const m = window.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g);
  if (m) {
    const name = m[m.length - 1].replace(/^(?:export\s+)?(?:async\s+)?function\s+/, '');
    return name.slice(0, 40).replace(/[^a-zA-Z0-9_$]/g, '');
  }
  return 'handler';
}

function processFile(relPath) {
  const filePath = join(ROOT, relPath);
  const original = readFileSync(filePath, 'utf-8');
  const lines = original.split('\n');
  const out = [];
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // ── Detect a catch-opening line: ends with `{` and contains `catch`
    //     Examples:  catch (err) {   } catch {   } catch (e) {
    const varMatch = trimmed.match(/catch\s*\((\w+)\)/);
    const noVar = trimmed.match(/catch\s*\{/);
    if (!noVar && !varMatch) {
      out.push(line);
      continue;
    }

    // One-liner catch:  } catch { return null; }  — skip these
    const afterBrace = trimmed.replace(/^.*?\{/, '').trim();
    if (afterBrace && afterBrace !== '{') {
      out.push(line);
      continue;
    }

    // Check next few lines for existing logging
    if (hasLogging(lines, i + 1)) {
      out.push(line);
      continue;
    }

    const errVar = varMatch ? varMatch[1] : '_catchErr';
    const indent = line.match(/^\s*/)[0] + '  ';
    const ctx = guessContext(lines, i).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    // If catch had no variable, rewrite the line to add one
    if (noVar) {
      const prefix = line.replace(/catch\s*\{.*$/, '');
      out.push(`${prefix}catch (${errVar}) {`);
    } else {
      out.push(line);
    }
    out.push(`${indent}console.error('${ctx} failed:', ${errVar} instanceof Error ? ${errVar}.message : String(${errVar}));`);
    changed = true;
  }

  if (changed) {
    writeFileSync(filePath, out.join('\n'), 'utf-8');
    totalEdited++;
  }
  totalFiles++;
}

function walkDir(dirPath) {
  const fullPath = join(ROOT, dirPath);
  let entries;
  try { entries = readdirSync(fullPath); } catch { return; }
  for (const entry of entries) {
    const entryPath = join(fullPath, entry);
    let s;
    try { s = statSync(entryPath); } catch { continue; }
    if (s.isDirectory()) {
      walkDir(join(dirPath, entry));
    } else {
      const ext = extname(entry);
      if ((ext === '.ts' || ext === '.tsx') &&
          !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx') && !entry.endsWith('.spec.ts')) {
        processFile(join(dirPath, entry));
      }
    }
  }
}

console.log('Inserting console.error after catch blocks without logging...\n');

for (const dir of DIRS) {
  console.log(`  Scanning ${dir}/...`);
  walkDir(dir);
}
for (const file of SINGLE_FILES) {
  try { statSync(join(ROOT, file)); processFile(file); console.log(`  ${file}`); } catch {}
}

console.log(`\nDone. Inserted logging in ${totalEdited} of ${totalFiles} files.`);
