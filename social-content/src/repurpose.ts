#!/usr/bin/env node
/**
 * Repurpose script — takes one content spec and generates all platform
 * variants from it.
 *
 * Usage:
 *   npx ts-node src/repurpose.ts examples/tofu/01-mfa-myth.md
 *
 * Reads the spec, determines the source platform, and generates
 * equivalents for the other two platforms.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, resolve, basename } from 'path';
import { existsSync } from 'fs';
import { parseContentSpec } from './parser';
import { generateLinkedInCarouselHTML, generateLinkedInPost } from './generators/linkedin';
import { generateInstagramCaption } from './generators/instagram';
import { generateTwitterThreadText, generateTwitterPost } from './generators/twitter';
import type { ContentSpec, Platform, ContentFormat } from './content-spec';

const ROOT = resolve(__dirname, '..');
const OUTPUT_DIR = join(ROOT, 'output');

interface RepurposeTarget {
  platform: Platform;
  format: ContentFormat;
  suffix: string;
}

const TARGETS: RepurposeTarget[] = [
  { platform: 'linkedin', format: 'carousel', suffix: 'linkedin' },
  { platform: 'instagram', format: 'carousel', suffix: 'ig' },
  { platform: 'twitter', format: 'thread', suffix: 'twitter' },
];

async function repurpose(specPath: string): Promise<void> {
  const raw = await readFile(specPath, 'utf-8');
  const spec = parseContentSpec(specPath, raw);

  if (!existsSync(OUTPUT_DIR)) await mkdir(OUTPUT_DIR, { recursive: true });

  console.log(`\n⬡ Repurpose — ${spec.slug}`);
  console.log(`  Source: ${spec.platform} ${spec.format}\n`);

  for (const target of TARGETS) {
    if (target.platform === spec.platform) continue;

    const repurposed: ContentSpec = {
      ...spec,
      slug: `${spec.slug}-${target.suffix}`,
      platform: target.platform,
      format: target.format,
    };

    if (target.platform === 'linkedin') {
      const html = generateLinkedInCarouselHTML(repurposed);
      await writeFile(join(OUTPUT_DIR, `${repurposed.slug}-carousel.html`), html, 'utf-8');
      const post = generateLinkedInPost(repurposed);
      await writeFile(join(OUTPUT_DIR, `${repurposed.slug}-post.md`), post, 'utf-8');
    }

    if (target.platform === 'instagram') {
      const caption = generateInstagramCaption(repurposed);
      await writeFile(join(OUTPUT_DIR, `${repurposed.slug}-caption.md`), caption, 'utf-8');
    }

    if (target.platform === 'twitter') {
      const thread = generateTwitterThreadText(repurposed);
      await writeFile(join(OUTPUT_DIR, `${repurposed.slug}-thread.md`), thread, 'utf-8');
      const post = generateTwitterPost(repurposed);
      await writeFile(join(OUTPUT_DIR, `${repurposed.slug}-post.md`), post, 'utf-8');
    }

    console.log(`  ✓ ${target.platform} ${target.format} → ${repurposed.slug}`);
  }

  console.log(`\n⬡ Done — output in ${OUTPUT_DIR}\n`);
}

const specPath = process.argv[2];
if (!specPath) {
  console.error('Usage: npx ts-node src/repurpose.ts <spec-file.md>');
  process.exit(1);
}

repurpose(resolve(specPath)).catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
