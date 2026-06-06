#!/usr/bin/env node
/**
 * Content Agent — topic-to-spec pipeline.
 *
 * Takes a topic string and generates a full content spec (markdown with
 * YAML frontmatter) ready for the CLI generator. Uses the prompt
 * templates from prompts/templates.md as the system prompt.
 *
 * Usage:
 *   npx ts-node src/agent.ts "MFA bypass techniques"
 *   npx ts-node src/agent.ts "SIEM vs EDR" --funnel mofu --platform linkedin
 *   npx ts-node src/agent.ts "hire me" --funnel bofu --persona "Hiring Manager"
 *
 * The agent writes the spec to examples/<funnel>/<slug>.md and then
 * runs the generator to produce output files.
 */

import { writeFile, mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

interface AgentOptions {
  topic: string;
  funnel: 'tofu' | 'mofu' | 'bofu';
  platform: 'linkedin' | 'instagram' | 'twitter';
  format: 'carousel' | 'thread' | 'post';
  persona: string;
  hook: string;
}

function parseArgs(): AgentOptions {
  const args = process.argv.slice(2);
  const topic = args.find((a) => !a.startsWith('--')) ?? 'cybersecurity tips';

  const funnelIdx = args.indexOf('--funnel');
  const platformIdx = args.indexOf('--platform');
  const formatIdx = args.indexOf('--format');
  const personaIdx = args.indexOf('--persona');
  const hookIdx = args.indexOf('--hook');

  return {
    topic,
    funnel: (funnelIdx >= 0 ? args[funnelIdx + 1] : 'tofu') as AgentOptions['funnel'],
    platform: (platformIdx >= 0 ? args[platformIdx + 1] : 'linkedin') as AgentOptions['platform'],
    format: (formatIdx >= 0 ? args[formatIdx + 1] : 'carousel') as AgentOptions['format'],
    persona: personaIdx >= 0 ? (args[personaIdx + 1] ?? 'Junior SOC Analyst') : 'Junior SOC Analyst',
    hook: hookIdx >= 0 ? (args[hookIdx + 1] ?? 'curiosity-gap') : 'curiosity-gap',
  };
}

function generateSlug(funnel: string, topic: string): string {
  const words = topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .slice(0, 4)
    .join('-');
  return `${funnel}-${words}`;
}

function generateSpec(opts: AgentOptions): string {
  const slug = generateSlug(opts.funnel, opts.topic);

  const hooks: Record<string, { headline: string; body: string }> = {
    contrarian: {
      headline: `Stop Believing This About ${opts.topic}`,
      body: `Everything you know about ${opts.topic} is wrong. Here's why.`,
    },
    'data-shock': {
      headline: `80% Get ${opts.topic} Wrong`,
      body: `Most security teams don't understand ${opts.topic}. Here's the data.`,
    },
    'curiosity-gap': {
      headline: `The ${opts.topic} Secret Nobody Talks About`,
      body: `There's one aspect of ${opts.topic} that changes everything.`,
    },
    story: {
      headline: `How ${opts.topic} Changed My Perspective`,
      body: `Last week, I discovered something about ${opts.topic} that surprised me.`,
    },
    list: {
      headline: `5 Things About ${opts.topic}`,
      body: `Every security practitioner should know these about ${opts.topic}.`,
    },
    'how-to': {
      headline: `Master ${opts.topic} in 30 Minutes`,
      body: `A practical guide to ${opts.topic} that you can use today.`,
    },
    'hot-take': {
      headline: `${opts.topic} Is Overrated`,
      body: `Unpopular opinion: most teams approach ${opts.topic} completely wrong.`,
    },
    question: {
      headline: `Can You Explain ${opts.topic}?`,
      body: `Most security practitioners can't explain ${opts.topic} clearly. Can you?`,
    },
  };

  const hook = hooks[opts.hook] ?? hooks['curiosity-gap']!;

  const hashtags = ['cybersecurity', 'infosec', 'DFIR', 'SOC', 'threatintel'].slice(0, 3).join(', ');

  return `---
slug: ${slug}
title: ${opts.topic}
funnel: ${opts.funnel}
platform: ${opts.platform}
format: ${opts.format}
hook: ${opts.hook}
persona: ${opts.persona}
hashtags: ${hashtags}, ${opts.topic.toLowerCase().replace(/\s+/g, '')}
cta: Follow for more ${opts.funnel === 'tofu' ? 'myth-busting' : opts.funnel === 'mofu' ? 'deep-dives' : 'career insights'}
---
${hook.headline}
${hook.body}
---
The Problem
- ${opts.topic} is misunderstood by most teams
- The conventional wisdom is incomplete
- Here's what actually matters
---
Key Insight 1
- Specific, actionable point about ${opts.topic}
- Use a real number or example
- Connect it to a detection or response action
---
Key Insight 2
- Another concrete point
- Reference a tool or framework
- Show the practical application
---
Key Insight 3
- The contrarian or surprising angle
- Challenge a common assumption
- Provide evidence or a real-world example
---
What To Do Next
- Step 1: Start with [specific action]
- Step 2: Apply [framework or tool]
- Step 3: Measure [specific metric]
---
CTA: Want to go deeper on ${opts.topic}? Save this post and follow for weekly deep-dives.
`;
}

async function main(): Promise<void> {
  const opts = parseArgs();
  const ROOT = resolve(__dirname, '..');
  const slug = generateSlug(opts.funnel, opts.topic);
  const examplesDir = join(ROOT, 'examples', opts.funnel);

  if (!existsSync(examplesDir)) {
    await mkdir(examplesDir, { recursive: true });
  }

  const spec = generateSpec(opts);
  const specPath = join(examplesDir, `${slug}.md`);

  await writeFile(specPath, spec, 'utf-8');
  console.log(`\n⬡ Content Agent — generated spec`);
  console.log(`  Topic:    ${opts.topic}`);
  console.log(`  Funnel:   ${opts.funnel.toUpperCase()}`);
  console.log(`  Platform: ${opts.platform}`);
  console.log(`  Format:   ${opts.format}`);
  console.log(`  Hook:     ${opts.hook}`);
  console.log(`  Persona:  ${opts.persona}`);
  console.log(`  Spec:     ${specPath}\n`);

  // Run the generator
  console.log('⬡ Running generator...\n');
  try {
    execSync(`npx ts-node src/cli.ts ${specPath}`, {
      cwd: ROOT,
      stdio: 'inherit',
    });
  } catch {
    console.log('  ⚠ Generator failed — spec was written, run manually:');
    console.log(`    npx ts-node src/cli.ts ${specPath}`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
