/**
 * Test the prompt-eval harness (scripts/prompt-eval.mjs).
 *
 * Runs it in offline mode (no LLM keys, deterministic canned responses) and
 * asserts: exit 0, both CSV artifacts are written, the results CSV has
 * cases × variants rows, and the summary CSV ranks variants by average score.
 * Cases/variants are this repo's real prompt families (see prompt-eval.mjs).
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVAL = join(__dirname, 'prompt-eval.mjs');

function run() {
  const dir = mkdtempSync(join(tmpdir(), 'prompt-eval-'));
  execFileSync('node', [EVAL], {
    encoding: 'utf8',
    env: { ...process.env, USE_LLM: 'false', PROMPT_EVAL_OUT_DIR: dir },
  });
  return {
    resultsPath: join(dir, 'prompt-eval-results.csv'),
    summaryPath: join(dir, 'prompt-eval-summary.csv'),
  };
}

test('offline mode writes both CSV artifacts', () => {
  const { resultsPath, summaryPath } = run();
  for (const p of [resultsPath, summaryPath]) {
    assert.ok(existsSync(p), `expected ${p}`);
  }
});

test('results CSV has cases × variants rows, sorted by case then variant', () => {
  const { resultsPath } = run();
  const lines = readFileSync(resultsPath, 'utf8').trim().split('\n');
  assert.equal(lines.length, 12 + 1, `expected header + 12 rows, got ${lines.length}`);
  assert.equal(lines[0], 'case_id,variant_id,word_count,conciseness,task_alignment,metric_awareness,actionability,total_score,latency_ms,response');
  assert.equal(lines[1].split(',')[0], 'apt-campaign');
  assert.equal(lines[1].split(',')[1], 'cti-report');
});

test('summary CSV ranks variants by average total score (desc)', () => {
  const { summaryPath } = run();
  const lines = readFileSync(summaryPath, 'utf8').trim().split('\n');
  assert.equal(lines.length, 4 + 1, `expected header + 4 variants, got ${lines.length}`);
  assert.equal(lines[0], 'variant_id,avg_total_score,avg_word_count,avg_latency_ms');
  const scores = lines.slice(1).map((l) => Number(l.split(',')[1]));
  for (let i = 1; i < scores.length; i += 1) {
    assert.ok(scores[i] <= scores[i - 1], `summary not sorted desc: ${scores.join(', ')}`);
  }
});

test('offline run is deterministic', () => {
  const a = run();
  const b = run();
  assert.equal(
    readFileSync(a.resultsPath, 'utf8'),
    readFileSync(b.resultsPath, 'utf8'),
    'results CSV differs between runs'
  );
});