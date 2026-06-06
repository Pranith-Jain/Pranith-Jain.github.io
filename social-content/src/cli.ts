#!/usr/bin/env node
/**
 * CLI entry point — reads content specs from examples/, generates
 * output files (HTML carousels, post text, thread text) in output/.
 *
 * Usage:
 *   npx ts-node src/cli.ts                    # generate all examples
 *   npx ts-node src/cli.ts examples/tofu/01-mfa-myth.md  # single file
 *   npx ts-node src/cli.ts --all              # generate everything
 *
 * Output per spec:
 *   output/<slug>-carousel.html     — LinkedIn/IG carousel (open in browser, print to PDF)
 *   output/<slug>-linkedin-post.md  — LinkedIn post caption
 *   output/<slug>-ig-caption.md     — Instagram caption
 *   output/<slug>-twitter-thread.md — Twitter thread text
 *   output/<slug>-readme.md         — Upload instructions + metadata
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, resolve, basename } from 'path';
import { existsSync } from 'fs';
import { parseContentSpec } from './parser';
import { generateLinkedInCarouselHTML, generateLinkedInPost, generateLinkedInReadme } from './generators/linkedin';
import { generateInstagramCarouselHTML, generateInstagramCaption } from './generators/instagram';
import { generateTwitterThreadText, generateTwitterPost } from './generators/twitter';
import type { ContentSpec } from './content-spec';

const ROOT = resolve(__dirname, '..');
const EXAMPLES_DIR = join(ROOT, 'examples');
const OUTPUT_DIR = join(ROOT, 'output');

async function findSpecFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findSpecFiles(fullPath)));
    } else if (entry.name.endsWith('.md') && !entry.name.startsWith('README')) {
      files.push(fullPath);
    }
  }
  return files;
}

async function generateSpec(spec: ContentSpec): Promise<void> {
  const outDir = OUTPUT_DIR;
  if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });

  const slug = spec.slug;

  // LinkedIn carousel HTML
  const linkedinHTML = generateLinkedInCarouselHTML(spec);
  await writeFile(join(outDir, `${slug}-carousel.html`), linkedinHTML, 'utf-8');

  // LinkedIn post caption
  const linkedinPost = generateLinkedInPost(spec);
  await writeFile(join(outDir, `${slug}-linkedin-post.md`), linkedinPost, 'utf-8');

  // Instagram caption
  const igCaption = generateInstagramCaption(spec);
  await writeFile(join(outDir, `${slug}-ig-caption.md`), igCaption, 'utf-8');

  // Twitter thread
  const twitterThread = generateTwitterThreadText(spec);
  await writeFile(join(outDir, `${slug}-twitter-thread.md`), twitterThread, 'utf-8');

  // Twitter single post
  const twitterPost = generateTwitterPost(spec);
  await writeFile(join(outDir, `${slug}-twitter-post.md`), twitterPost, 'utf-8');

  // Readme
  const readme = generateLinkedInReadme(spec);
  await writeFile(join(outDir, `${slug}-readme.md`), readme, 'utf-8');

  console.log(`  ✓ ${slug} → 6 files`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let files: string[] = [];

  if (args.includes('--all') || args.length === 0) {
    files = await findSpecFiles(EXAMPLES_DIR);
  } else {
    files = args.map((a) => resolve(a));
  }

  if (files.length === 0) {
    console.log('No content specs found in examples/. Create a .md file with YAML frontmatter.');
    process.exit(0);
  }

  console.log(`\n⬡ social-content — generating ${files.length} spec(s)\n`);

  for (const file of files) {
    const raw = await readFile(file, 'utf-8');
    try {
      const spec = parseContentSpec(file, raw);
      await generateSpec(spec);
    } catch (err) {
      console.error(`  ✗ ${basename(file)}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n⬡ Done — output in ${OUTPUT_DIR}\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
