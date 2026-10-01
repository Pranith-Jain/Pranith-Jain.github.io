import { describe, it, expect } from 'vitest';
import { Linter } from 'eslint';
import tsparser from '@typescript-eslint/parser';
import rule from './no-raw-colors.js';

/**
 * Behavioural tests for the no-raw-colors rule.
 *
 * These drive the rule through ESLint's Linter directly rather than
 * RuleTester. RuleTester relies on `describe`/`it` globals carrying source
 * locations to name each generated case; vitest's implementations don't, so
 * RuleTester crashes (and, worse, can report a pass without asserting
 * anything). Calling the Linter is explicit and location-independent.
 *
 * Three failure modes to guard, plus the classes that merely LOOK like
 * violations and must never be touched.
 */

const linter = new Linter();
const CONFIG = [
  {
    files: ['**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { local: { rules: { 'no-raw-colors': rule } } },
    rules: { 'local/no-raw-colors': 'warn' },
  },
];

/**
 * Lint `code` and return {messages, output}.
 *
 * Two separate passes on purpose: `verify` for the diagnostics, then a fresh
 * `verifyAndFix` for the rewritten text. `verifyAndFix` alone returns an EMPTY
 * message list once it has applied a fix, which would hide the very behaviour
 * these tests exist to pin.
 */
function lint(code) {
  const messages = linter.verify(code, CONFIG, { filename: 'fixture.tsx' });
  const output = linter.verifyAndFix(code, CONFIG, { filename: 'fixture.tsx' }).output;
  return { messages, output };
}

/** Assert a snippet produces no diagnostics. */
function expectClean(code) {
  const { messages } = lint(code);
  expect(messages.map((m) => `${m.messageId}: ${m.message}`)).toEqual([]);
}

describe('no-raw-colors: canonical spellings are never flagged', () => {
  it.each([
    '<div className="bg-surface-200 border-line-1 text-muted" />',
    '<div className="bg-input-200 border-line-input divide-line-1" />',
    '<div className="bg-wash text-heading text-body text-accent-text" />',
    '<div className="border border-line-1 dark:bg-surface-200" />',
    '<div className="hover:bg-surface-300 focus:border-line-2" />',
    '<div className="bg-surface-300/50 border-line-1/40" />',
  ])('%s', (code) => expectClean(code));
});

describe('no-raw-colors: lookalike utilities are not colors', () => {
  it.each([
    // Width / side / style share the `border-` prefix. Treating these as
    // colors would delete a border side on autofix.
    '<div className="border border-2 border-t border-b border-dashed" />',
    '<div className="divide-y divide-x border-l-2 border-x" />',
    // Typography shares the `text-` prefix.
    '<div className="text-xs text-sm text-lg text-left text-center text-uppercase" />',
    '<div className="bg-none bg-auto bg-cover bg-center bg-clip-border" />',
    '<div className="ring ring-2 ring-inset ring-offset-2" />',
    // brand/severity palettes are semantic by convention in this codebase.
    '<div className="bg-brand-600 text-brand-300 border-rose-500" />',
    '<div className="bg-amber-500/15 text-amber-800" />',
    // Nothing to inspect.
    'const x = 1;',
    '<div className="" />',
    '<div className={cls} />',
    '<div className={fn(a, b)} />',
  ])('%s', (code) => expectClean(code));
});

describe('no-raw-colors: alpha overlays are never auto-fixed', () => {
  it('refuses to rewrite dark:bg-white/10, which would invert the intent', () => {
    // white/10 LIFTS a navy card; --surface-100/10 would DARKEN it, because
    // surface-100 is near-black in dark mode. Same spelling, opposite effect.
    const { messages, output } = lint('<div className="dark:bg-white/10" />');
    expect(messages.map((m) => m.messageId)).toEqual(['rawColorNoToken']);
    expect(output).toBe('<div className="dark:bg-white/10" />');
  });

  it('still fixes an opaque dark:bg-white', () => {
    const { output } = lint('<div className="dark:bg-white" />');
    expect(output).toBe('<div className="dark:bg-surface-100" />');
  });

  it('still fixes alpha on a mid-ramp step, where the mapping is safe', () => {
    // slate-200 -> --track, both solid colours with the same role, so an
    // alpha modifier means the same thing on either side.
    const { output } = lint('<div className="bg-slate-200/70" />');
    expect(output).toBe('<div className="bg-track/70" />');
  });
});

describe('no-raw-colors: text-white is only a token on a saturated fill', () => {
  it('maps white ink to text-on-fill when the element has a brand/severity bg', () => {
    const { output } = lint('<button className="bg-brand-600 text-white">Go</button>');
    expect(output).toBe('<button className="bg-brand-600 text-on-fill">Go</button>');
  });

  it('refuses to map white ink on a neutral surface (that is a contrast bug)', () => {
    const { messages, output } = lint('<div className="bg-surface-100 text-white">x</div>');
    expect(messages.map((m) => m.messageId)).toEqual(['rawColorNoToken']);
    expect(output).toBe('<div className="bg-surface-100 text-white">x</div>');
  });

  it('does not treat a token surface as a saturated fill', () => {
    const { output } = lint('<div className="bg-surface-200 text-white">x</div>');
    expect(output).toBe('<div className="bg-surface-200 text-white">x</div>');
  });
});

describe('no-raw-colors: phase 2 pair collapses', () => {
  it('maps the loading track', () => {
    const { output } = lint('<div className="h-2 rounded bg-slate-200" />');
    expect(output).toBe('<div className="h-2 rounded bg-track" />');
  });

  it('maps low-emphasis ink', () => {
    const { output } = lint('<span className="text-slate-300">x</span>');
    expect(output).toBe('<span className="text-inverted">x</span>');
  });

  it('still keeps hover and disabled variants working', () => {
    const { output } = lint('<a className="hover:text-slate-700 disabled:bg-slate-300">x</a>');
    expect(output).toBe('<a className="hover:text-body disabled:bg-slate-300">x</a>');
  });
});

describe('no-raw-colors: raw palette colors are reported and fixed', () => {
  it('collapses a redundant light/dark pair onto the token', () => {
    const code =
      '<div className="border border-slate-200 bg-white dark:border-line-1 dark:bg-surface-200" />';
    const { messages, output } = lint(code);
    expect(messages.map((m) => m.messageId)).toEqual(['rawColor', 'rawColor']);
    expect(messages[0].message).toContain('border-line-1');
    expect(output).toBe(
      '<div className="border border-line-1 bg-surface-100 dark:border-line-1 dark:bg-surface-200" />'
    );
  });

  it('preserves variant prefixes', () => {
    const { messages, output } = lint('<div className="hover:text-slate-600 md:bg-white" />');
    expect(messages).toHaveLength(2);
    expect(messages[0].message).toContain('hover:text-muted');
    expect(output).toBe('<div className="hover:text-muted md:bg-surface-100" />');
  });

  it('preserves opacity modifiers', () => {
    const { output } = lint('<div className="bg-slate-100/50" />');
    expect(output).toBe('<div className="bg-surface-300/50" />');
  });

  it('reports a step with no safe mapping but refuses to guess', () => {
    // slate-950 sits below --ink-heading (slate-900) with no token to name it,
    // and there is no "near-black" ink step. Nudging it to text-heading
    // would be a guess, so it is reported and left alone.
    const { messages, output } = lint('<div className="text-slate-950" />');
    expect(messages.map((m) => m.messageId)).toEqual(['rawColorNoToken']);
    expect(output).toBe('<div className="text-slate-950" />');
  });
});

describe('no-raw-colors: arbitrary-value token syntax', () => {
  it('rewrites the plain form', () => {
    const { messages, output } = lint('<div className="bg-[rgb(var(--surface-300))]" />');
    expect(messages.map((m) => m.messageId)).toEqual(['arbitrary']);
    expect(output).toBe('<div className="bg-surface-300" />');
  });

  it('keeps an alpha inside rgb() for a non-alpha token', () => {
    const { output } = lint('<div className="bg-[rgb(var(--surface-300)/0.5)]" />');
    expect(output).toBe('<div className="bg-surface-300/50" />');
  });

  it('collapses the invalid rgb(R G B / A / B) form', () => {
    // --border-400 already carries an alpha, so the second slash makes the
    // declaration invalid CSS. The extra alpha never applied.
    const { output } = lint('<div className="border-[rgb(var(--border-400))/0.4]" />');
    expect(output).toBe('<div className="border-line-1" />');
  });

  it('rewrites inside a template literal without destroying the backticks', () => {
    const { output } = lint('const a = <div className={`bg-white px-2`} />;');
    expect(output).toBe('const a = <div className={`bg-surface-100 px-2`} />;');
  });

  it('leaves interpolation holes untouched', () => {
    const { output } = lint('const a = <div className={`bg-white ${cls}`} />;');
    expect(output).toBe('const a = <div className={`bg-surface-100 ${cls}`} />;');
  });

  it('handles several holes in one template literal', () => {
    const { output } = lint('const a = <div className={`bg-white ${x} text-slate-600 ${y}`} />;');
    expect(output).toBe('const a = <div className={`bg-surface-100 ${x} text-muted ${y}`} />;');
  });

  it('handles a quasi that itself contains a dollar-brace-looking run', () => {
    // Guards the range arithmetic: the cooked length, not a naive
    // "index of the next ${", decides where the quasi ends.
    const { output } = lint('const a = <div className={`bg-white text-slate-500`} />;');
    expect(output).toBe('const a = <div className={`bg-surface-100 text-muted`} />;');
  });
});

describe('no-raw-colors: dead tokens', () => {
  it('reports an undefined CSS variable and withholds the autofix', () => {
    // --card-bg is referenced but never defined, so the declaration is invalid
    // and the element renders with no background. A rename would hide that.
    const { messages, output } = lint('<div className="bg-[rgb(var(--card-bg))]" />');
    expect(messages.map((m) => m.messageId).sort()).toEqual(['arbitrary', 'deadToken']);
    expect(output).toBe('<div className="bg-[rgb(var(--card-bg))]" />');
  });

  it('names the affected property so the message is actionable', () => {
    const { messages } = lint('<div className="bg-[rgb(var(--card-bg))]" />');
    const dead = messages.find((m) => m.messageId === 'deadToken');
    expect(dead.message).toContain('--card-bg');
    expect(dead.message).toContain('src/index.css');
    expect(dead.message).toContain('background');
  });
});

describe('no-raw-colors: token vocabulary tracks src/index.css', () => {
  it('does not hardcode a token list that can silently drift', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.css'),
      'utf8'
    );
    const theme = css.slice(css.indexOf('@theme'), css.indexOf('@layer base'));
    // Every --color-* registration should be reachable as a utility.
    for (const name of [
      'surface-100', 'surface-200', 'surface-300',
      'line-1', 'line-2', 'line-3',
      'wash', 'track', 'on-fill', 'inverted', 'accent-text', 'focus-ring',
    ]) {
      expect(theme, `--color-${name} missing from @theme`).toContain(`--color-${name}:`);
    }
  });
});