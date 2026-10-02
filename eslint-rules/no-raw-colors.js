/**
 * ESLint rule: enforce semantic design tokens over raw palette colors and
 * arbitrary-value token syntax.
 *
 * Three problems, one rule:
 *
 * 1. RAW PALETTE (`bg-slate-700`, `text-slate-500`, ...)
 *    A raw step encodes a single light-mode value with no dark-mode
 *    counterpart, so every use is a second, undocumented source of truth.
 *    The 2026-08 sweep moved the `dark:` half onto tokens and left the light
 *    half behind, which is how ~4,000 pairs like
 *    `border-slate-200 dark:border-line-1` accumulated.
 *
 * 2. ARBITRARY TOKEN SYNTAX (`bg-[rgb(var(--surface-200))]`)
 *    Correct token, wrong spelling. The `@theme` block in src/index.css
 *    registers `--color-surface-200`, which generates a real `bg-surface-200`
 *    utility. The arbitrary spelling also defeats Tailwind's variant handling,
 *    so `hover:bg-[rgb(var(--surface-200))]` and the utility form are not
 *    equivalent once a variant is involved.
 *
 * 3. DEAD TOKENS (`var(--card-bg)`, `var(--border-300)`, `var(--brand-500)`)
 *    Referencing a CSS variable that is never defined makes the declaration
 *    invalid at computed-value time, so it falls back to `unset`. The element
 *    silently renders with no background or border rather than raising an
 *    error -- 26 such references existed at the time of writing.
 *
 * (1) and (2) are mechanical renames and are auto-fixed. (3) is reported
 * without a fix, since the right replacement depends on intent.
 *
 * Scope: statically-analyzable string literals in `className`, plus the static
 * portions of template literals. A class list assembled entirely from runtime
 * variables is not visible to any lint rule and is out of scope.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = join(HERE, '..', 'src', 'index.css');

/** Read the @theme color registrations so the rule can't drift from the CSS. */
function readTheme() {
  const fallback = {
    surfaces: ['surface-100', 'surface-200', 'surface-300'],
    lines: ['line-1', 'line-2', 'line-3', 'line-input'],
    inputs: ['input-200'],
    ink: ['muted', 'heading', 'body', 'inverted'],
    accents: ['accent-text', 'focus-ring', 'on-fill'],
    tracks: ['track'],
    fills: ['disabled'],
  };
  let css;
  try {
    css = readFileSync(CSS_PATH, 'utf8');
  } catch {
    return fallback;
  }
  const start = css.indexOf('@theme');
  const end = css.indexOf('@layer base');
  if (start === -1 || end === -1 || end < start) return fallback;
  const theme = css.slice(start, end);

  const grab = (prefix) => {
    const re = new RegExp(`--color-${prefix}([A-Za-z0-9-]+)\\s*:`, 'g');
    const out = [];
    let m;
    while ((m = re.exec(theme))) out.push(m[1]);
    return out;
  };
  const surfaces = grab('surface-');
  const lines = grab('line-');
  const inputs = grab('input-');
  const ink = ['muted', 'heading', 'body', 'inverted'].filter((t) => theme.includes(`--color-${t}:`));
  const accents = ['accent-text', 'focus-ring', 'on-fill'].filter((t) => theme.includes(`--color-${t}:`));
  const tracks = ['track'].filter((t) => theme.includes(`--color-${t}:`));
  const fills = ['disabled'].filter((t) => theme.includes(`--color-${t}:`));

  return {
    surfaces: surfaces.length ? surfaces : fallback.surfaces,
    lines: lines.length ? lines : fallback.lines,
    inputs: inputs.length ? inputs : fallback.inputs,
    ink: ink.length ? ink : fallback.ink,
    accents: accents.length ? accents : fallback.accents,
    tracks: tracks.length ? tracks : fallback.tracks,
    fills: fills.length ? fills : fallback.fills,
  };
}

const THEME = readTheme();

/** Every utility spelling this project considers canonical. */
const TOKEN_UTILITIES = new Set([
  ...THEME.surfaces.map((v) => `bg-${v}`),
  ...THEME.inputs.map((v) => `bg-${v}`),
  'bg-wash',
  ...THEME.lines.flatMap((v) => [
    `border-${v}`,
    `divide-${v}`,
    `border-top-${v}`,
    `border-bottom-${v}`,
    `border-left-${v}`,
    `border-right-${v}`,
  ]),
  ...THEME.ink.map((v) => `text-${v}`),
  ...THEME.accents.map((v) => `text-${v}`),
  ...THEME.tracks.map((v) => `bg-${v}`),
  ...THEME.fills.map((v) => `bg-${v}`),
]);

/**
 * Raw palette -> token. Chosen so the LIGHT rendering barely moves, matching
 * the ramp the tokens already model:
 *   white      == --surface-100 light (#ffffff)
 *   slate-50   ~= --surface-200 light (#fafafa)
 *   slate-100  ~= --surface-300 light (#f5f5f5)
 *   slate-700  == --ink-body light  (#334155)
 *   slate-600  == --muted light     (#475569)
 *   slate-200  ~= --border-400 light (black @8%)
 * Steps with no safe mapping are reported without a fix.
 */
const RAW_TO_TOKEN = {
  'bg-white': 'bg-surface-100',
  'bg-slate-50': 'bg-surface-200',
  'bg-slate-100': 'bg-surface-300',
  'bg-slate-800': 'bg-surface-200',
  'bg-slate-900': 'bg-surface-100',
  // A loading track on a card. Only safe as a HALF of a pair: a bare
  // `bg-slate-200` is usually a skeleton, but the pairing with
  // `dark:bg-surface-300` is what proves intent.
  'bg-slate-200': 'bg-track',
  'border-slate-100': 'border-line-1',
  'border-slate-200': 'border-line-1',
  'border-slate-300': 'border-line-2',
  'border-slate-400': 'border-line-3',
  'divide-slate-100': 'divide-line-1',
  'divide-slate-200': 'divide-line-1',
  'text-slate-900': 'text-heading',
  'text-slate-800': 'text-heading',
  'text-slate-700': 'text-body',
  'text-slate-600': 'text-muted',
  'text-slate-500': 'text-muted',
  'text-slate-400': 'text-muted',
  // White ink on a saturated fill. Only correct when the element actually
  // carries a brand/severity background, which is why the check below
  // gates it rather than the table doing it.
  'text-white': 'text-on-fill',
  'text-slate-300': 'text-inverted',
  'text-slate-200': 'text-inverted',
};

/**
 * `text-white` only maps to `text-on-fill` when the element actually has a
 * saturated background. White text on a neutral surface is a contrast bug,
 * and silently "fixing" it to a theme-reactive ink would hide that. The
 * table above records the intent; this decides whether it is safe.
 */
const SATURATED_FILL = /^bg-(?:brand|rose|red|emerald|amber|orange|violet|sky|indigo|purple|teal|cyan|green)-\d{2,3}$/;

const NEUTRAL = '(?:slate|gray|zinc|neutral|stone)';
const RAW_VALUE = new RegExp(`^(?:white|${NEUTRAL}-\\d{2,3})$`);

const COLOR_PROPS = [
  'bg',
  'text',
  'border',
  'divide',
  'ring',
  'fill',
  'stroke',
  'from',
  'via',
  'to',
  'outline',
  'decoration',
];

/**
 * Utilities that share a color namespace's prefix but are not colors. Without
 * this, `border-t` / `border-2` / `divide-y` / `text-sm` read as raw palette
 * colors and the autofix would delete a border side or a font size.
 */
const NON_COLOR = new Set([
  'border',
  'border-t',
  'border-r',
  'border-b',
  'border-l',
  'border-x',
  'border-y',
  'border-2',
  'border-4',
  'border-8',
  'border-dashed',
  'border-dotted',
  'border-solid',
  'border-none',
  'border-collapse',
  'border-separate',
  'border-inline',
  'border-block',
  'divide-x',
  'divide-y',
  'divide-x-reverse',
  'divide-y-reverse',
  'text-xs',
  'text-sm',
  'text-base',
  'text-lg',
  'text-xl',
  'text-2xl',
  'text-3xl',
  'text-4xl',
  'text-5xl',
  'text-6xl',
  'text-7xl',
  'text-8xl',
  'text-9xl',
  'text-left',
  'text-center',
  'text-right',
  'text-justify',
  'text-start',
  'text-end',
  'text-wrap',
  'text-nowrap',
  'text-balance',
  'text-pretty',
  'text-ellipsis',
  'text-clip',
  'text-uppercase',
  'text-lowercase',
  'text-capitalize',
  'text-normal',
  'text-italic',
  'text-underline',
  'text-strike',
  'text-overline',
  'text-truncate',
  'ring',
  'ring-0',
  'ring-1',
  'ring-2',
  'ring-4',
  'ring-8',
  'ring-inset',
  'bg-none',
  'bg-clip-border',
  'bg-clip-padding',
  'bg-repeat',
  'bg-no-repeat',
  'bg-auto',
  'bg-cover',
  'bg-contain',
  'bg-center',
  'bg-fixed',
  'bg-local',
  'bg-scroll',
]);

/** Tokens referenced but never defined. Verified against src/index.css. */
const DEAD_TOKENS = new Set(['card-bg', 'border-300', 'brand-500']);

/** Token -> utility suffix, for the arbitrary-value rewrite. */
const ARB_TOKEN_MAP = {
  'surface-100': 'surface-100',
  'surface-200': 'surface-200',
  'surface-300': 'surface-300',
  'input-200': 'input-200',
  'border-400': 'line-1',
  'border-500': 'line-2',
  'border-600': 'line-3',
  'border-300': 'line-1',
  'card-bg': 'surface-200',
  'hover-100': 'wash',
};

/** Tokens whose value already embeds an alpha channel. */
const ALPHA_TOKENS = new Set(['border-400', 'border-500', 'border-600', 'border-300', 'card-bg', 'hover-100']);

/**
 * Variant-scoped single-class mappings. The bare form is deliberately NOT
 * mapped: `bg-slate-300` on its own could be a mid-tone surface, a track, or
 * a disabled fill, and guessing is worse than reporting. Under `disabled:`
 * the intent is unambiguous, so only that spelling is rewritten.
 */
const VARIANT_MAP = {
  'disabled:bg-slate-300': 'disabled:bg-disabled',
};

/**
 * Whole-pair collapses. Both halves are raw, so neither maps on its own, but
 * together they name a token exactly: the light half equals the token's light
 * value AND the dark half equals its dark value. The replacement keeps the
 * light half's position and drops the dark half.
 */
const PAIR_MAP = new Map([['disabled:bg-slate-300\ndark:disabled:bg-slate-700', 'disabled:bg-disabled']]);

/** Split `hover:dark:bg-surface-200/50` into {variants, prop, value, opacity}. */
function splitUtility(cls) {
  const segs = cls.split(':');
  const variants = segs.slice(0, -1);
  const slash = segs[segs.length - 1].split('/');
  const opacity = slash.length > 1 ? slash[1] : null;
  const body = slash[0];
  const prop = body.replace(/^-/, '').split('-')[0];
  return { variants, prop, value: body.slice(prop.length + 1), opacity, raw: body };
}

/**
 * `<util>-[rgb(var(--token)<tail>)]` -> registered utility, or null.
 * Tail shapes: `)` plain, `/0.5)` alpha inside rgb(), `)/0.8` (invalid CSS).
 */
function rewriteArbitrary(cls) {
  const m = /^([a-z-]+)-\[rgb\(var\(--([a-z0-9-]+)\)([^\]]*)\]$/.exec(cls);
  if (!m) return null;
  const [, util, token, tail] = m;
  if (!COLOR_PROPS.includes(util)) return null;
  const suffix = ARB_TOKEN_MAP[token];
  if (!suffix) return null;

  let alpha = 0;
  if (tail !== ')' && tail !== '') {
    const a = /^\/([0-9.]+)\)$/.exec(tail) || /^\)\/([0-9.]+)$/.exec(tail);
    if (!a) return null;
    // rgb(R G B / A / B) is invalid CSS, so an extra alpha on an
    // already-alpha token never applied. Collapse to the ladder step.
    alpha = ALPHA_TOKENS.has(token) ? 0 : parseFloat(a[1]);
  }
  return `${util}-${suffix}${alpha > 0 ? `/${Math.round(alpha * 100)}` : ''}`;
}

/** Would this class trip any of the three checks? Cheap pre-filter. */
function isSuspicious(cls) {
  if (cls.includes('[rgb(var(--')) return true;
  if (/var\(--(?:card-bg|border-300|brand-500)\)/.test(cls)) return true;
  const u = splitUtility(cls);
  if (!COLOR_PROPS.includes(u.prop) || NON_COLOR.has(cls)) return false;
  return RAW_VALUE.test(u.value);
}

/**
 * Inspect one className string.
 * Returns {fixed, issues} where `fixed` is non-null when a rewrite applies.
 */
function inspect(raw) {
  const classes = raw.split(/\s+/).filter(Boolean);
  const issues = [];
  let changed = false;

  // `text-white` is only a token when it sits on a saturated fill.
  const onSaturatedFill = classes.some((c) => !c.includes(':') && SATURATED_FILL.test(c));

  // Whole-pair collapse happens first: when both halves of a known raw pair
  // are present, they become one utility instead of two independent rewrites.
  // Members are skipped by the per-class loop below so nothing is reported
  // twice.
  const pairMember = new Set();
  const pairRewrite = new Map();
  const pairDrop = new Set();
  for (const [key, target] of PAIR_MAP) {
    const [light, dark] = key.split('\n');
    const li = classes.indexOf(light);
    const di = classes.indexOf(dark);
    if (li === -1 || di === -1 || pairMember.has(li) || pairMember.has(di)) continue;
    pairMember.add(li);
    pairMember.add(di);
    pairRewrite.set(li, target);
    pairDrop.add(di);
    issues.push({
      messageId: 'rawColor',
      data: { raw: `${light} + ${dark}`, token: target },
      fixable: true,
    });
    changed = true;
  }

  for (let idx = 0; idx < classes.length; idx++) {
    const cls = classes[idx];
    if (pairMember.has(idx)) continue;
    if (!isSuspicious(cls)) continue;

    // (3) dead CSS variable -- report, never auto-fix (intent-dependent).
    for (const dead of DEAD_TOKENS) {
      if (!cls.includes(`var(--${dead})`)) continue;
      const kind = /^(bg|from|via|to)-/.test(cls)
        ? 'background'
        : /^(border|divide|outline)/.test(cls)
          ? 'border'
          : 'text color';
      issues.push({ messageId: 'deadToken', data: { token: dead, kind }, fixable: false });
    }

    // (2) arbitrary-value token syntax.
    const arb = rewriteArbitrary(cls);
    if (arb) {
      issues.push({
        messageId: 'arbitrary',
        data: { raw: cls, token: arb },
        fixable: true,
      });
      changed = true;
      continue;
    }

    // (1) raw palette color.
    const u = splitUtility(cls);
    if (!COLOR_PROPS.includes(u.prop) || NON_COLOR.has(cls) || !RAW_VALUE.test(u.value)) continue;
    const tableKey = `${u.prop}-${u.value}`;
    // White ink only becomes a token on a saturated fill. Off one, it is a
    // contrast bug worth reporting, not worth silently rewriting.
    const gated = tableKey === 'text-white' && !onSaturatedFill;
    // Variant-scoped mappings (e.g. `disabled:bg-slate-300`) take precedence:
    // the bare form may be intentionally unmapped while one variant state is
    // unambiguous. Opacity forms are excluded -- `disabled:bg-slate-300/50`
    // is a different composite that needs a human.
    const scoped = !u.opacity && Object.hasOwn(VARIANT_MAP, cls) ? VARIANT_MAP[cls] : undefined;
    const token = gated ? undefined : (scoped ?? RAW_TO_TOKEN[tableKey]);

    // Report-but-never-fix classes. Deliberately the same predicate the
    // rebuild path uses — see isNeverAutoFixed for why the two diverging was
    // a real bug rather than a theoretical one.
    if (token && isNeverAutoFixed(u, token, onSaturatedFill)) {
      issues.push({ messageId: 'rawColorNoToken', data: { raw: cls }, fixable: false });
      continue;
    }
    const prefix = u.variants.length ? `${u.variants.join(':')}:` : '';
    if (token) {
      const rebuilt = `${prefix}${token}${u.opacity ? `/${u.opacity}` : ''}`;
      issues.push({
        messageId: 'rawColor',
        data: { raw: cls, token: rebuilt },
        fixable: true,
      });
      changed = true;
    } else {
      issues.push({
        messageId: 'rawColorNoToken',
        data: { raw: cls },
        fixable: false,
      });
    }
  }

  if (!changed) return { fixed: null, issues };
  // Rebuild preserving the original whitespace. Each class is rewritten
  // independently so an unmappable sibling cannot block a mappable one --
  // an earlier all-or-nothing version left ~800 fixable warnings behind
  // purely because something else in the same className had no mapping.
  // Pair members are rewritten/dropped by index, so the dark half leaves no
  // gap behind.
  let result = '';
  let classIdx = -1;
  let pendingWs = '';
  const parts = raw.split(/(\s+)/);
  for (const part of parts) {
    if (!part.trim()) {
      pendingWs += part;
      continue;
    }
    classIdx++;
    if (pairDrop.has(classIdx)) {
      // Swallow the separator before a dropped token so no gap is left.
      pendingWs = '';
      continue;
    }
    result += pendingWs;
    pendingWs = '';
    if (pairRewrite.has(classIdx)) {
      result += pairRewrite.get(classIdx);
      continue;
    }
    if (!isSuspicious(part)) {
      result += part;
      continue;
    }
    result += rewriteArbitrary(part) ?? rawToToken(part, onSaturatedFill) ?? part;
  }
  result += pendingWs;
  return { fixed: result, issues };
}

/** Rebuild a single class from the RAW_TO_TOKEN table, or null. */
/**
 * Classes this rule reports but must NEVER auto-fix, even when a sibling in
 * the same className is fixable.
 *
 * Single source of truth on purpose. These checks used to live only in the
 * diagnostic loop, while the rebuild went through rawToToken() with no
 * equivalent guard — so a mixed className took the sibling's fix and silently
 * rewrote the gated class too, reintroducing the exact inversion the rule
 * exists to prevent. Any change here must apply to both callers.
 */
function isNeverAutoFixed(u, token, onSaturatedFill) {
  if (!token) return false;
  // `dark:bg-white/10` LIFTS the surface; the token form DARKENS it, because
  // --surface-100 is near-black in dark mode. Same spelling, opposite effect.
  if (Boolean(u.opacity) && (u.value === 'white' || u.value === 'black')) return true;
  // An opaque, explicitly-white dark surface (QR codes, paper previews) has no
  // token equivalent — rewriting it turns the panel near-black.
  if (!u.opacity && u.variants.includes('dark') && u.prop === 'bg' && (u.value === 'white' || u.value === 'black')) {
    return true;
  }
  // White ink only becomes a token on a saturated fill. Off one, it is a
  // contrast bug worth reporting, not worth silently rewriting.
  if (`${u.prop}-${u.value}` === 'text-white' && !onSaturatedFill) return true;
  return false;
}

function rawToToken(cls, onSaturatedFill = false) {
  // Variant-scoped mappings first: the bare form may be intentionally
  // unmapped while one variant state is unambiguous.
  if (Object.hasOwn(VARIANT_MAP, cls)) return VARIANT_MAP[cls];
  const u = splitUtility(cls);
  const tableKey = `${u.prop}-${u.value}`;
  if (tableKey === 'text-white' && !onSaturatedFill) return null;
  if (isNeverAutoFixed(u, RAW_TO_TOKEN[tableKey], onSaturatedFill)) return null;
  const token = RAW_TO_TOKEN[tableKey];
  if (!token) return null;
  const prefix = u.variants.length ? `${u.variants.join(':')}:` : '';
  return `${prefix}${token}${u.opacity ? `/${u.opacity}` : ''}`;
}

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require semantic design tokens instead of raw palette colors, arbitrary-value token syntax, and undefined CSS variables',
      category: 'Best Practices',
      recommended: 'warn',
    },
    fixable: 'code',
    schema: [],
    messages: {
      rawColor:
        'Raw palette color "{{raw}}" has no dark-mode counterpart. Use "{{token}}" so it adapts to both themes.',
      rawColorNoToken:
        'Raw palette color "{{raw}}" should use a semantic token from src/index.css (@theme). No automatic mapping exists for this step.',
      arbitrary:
        'Use "{{token}}" instead of the arbitrary value "{{raw}}". It renders identically but keeps variant handling and theme indirection.',
      deadToken:
        'CSS variable --{{token}} is referenced but never defined in src/index.css, so this declaration is invalid and the element renders with no {{kind}}. Pick a token that exists.',
    },
  },

  create(context) {
    /**
     * Report on `node`, offering a single fix that rewrites the whole string.
     * Autofix is attached only when every detected issue is mechanically
     * fixable, so applying it can never silently drop a dead-token warning.
     */
    const check = (node, raw) => {
      const { fixed, issues } = inspect(raw);
      if (!issues.length) return;
      // The fix rewrites the WHOLE className, so it is attached to the last
      // FIXABLE issue rather than the last issue overall: an unmappable
      // sibling (reported, left alone) must not suppress the fix for the
      // mappable classes beside it. Gating on `every(fixable)` did exactly
      // that and left ~800 fixable warnings stranded.
      //
      // A dead token is the exception. It is reported separately precisely
      // because the class renders NOTHING today, and auto-renaming it would
      // erase that signal on the next `--fix`. A human has to confirm the
      // intended value, so no fix is offered at all.
      const hasDeadToken = issues.some((i) => i.messageId === 'deadToken');
      const lastFixable = hasDeadToken ? -1 : issues.reduce((acc, i, idx) => (i.fixable ? idx : acc), -1);
      issues.forEach((issue, idx) => {
        const isLast = idx === lastFixable;
        context.report({
          node,
          messageId: issue.messageId,
          data: issue.data,
          fix:
            fixed !== null && isLast
              ? (fixer) => {
                  // A JSXAttribute Literal carries its string in `.value`; a TemplateElement
                  // has no quotable string and is replaced wholesale.
                  if (typeof node.value === 'string') {
                    const quote = node.value.includes("'") && !node.value.includes('"') ? "'" : '"';
                    return fixer.replaceText(node, `${quote}${fixed}${quote}`);
                  }
                  return fixer.replaceText(node, fixed);
                }
              : undefined,
        });
      });
    };

    return {
      // className="literal" / className='literal'
      JSXAttribute(node) {
        if (node.name?.name !== 'className') return;
        const v = node.value;
        if (!v || v.type !== 'Literal' || typeof v.value !== 'string') return;
        check(v, v.value);
      },

      // The static portions of a class list assembled with interpolation.
      // Only the quasis are rewritten, and the range is narrowed past the
      // backticks (which ESTree folds into the first/last TemplateElement
      // range) so the `${...}` holes and the literal both survive intact.
      TemplateLiteral(node) {
        for (const quasi of node.quasis) {
          const cooked = quasi.value.cooked;
          if (!cooked || !cooked.trim()) continue;
          const { fixed, issues } = inspect(cooked);
          if (!issues.length) continue;
          if (fixed === null) {
            issues.forEach((issue) => {
              context.report({ node: quasi, messageId: issue.messageId, data: issue.data });
            });
            continue;
          }
          // Same rule as the string-literal path: the last fixable issue carries the
          // fix, and a dead token suppresses it entirely.
          const hasDeadToken = issues.some((i) => i.messageId === 'deadToken');
          const lastFixable = hasDeadToken ? -1 : issues.reduce((acc, i, n) => (i.fixable ? n : acc), -1);
          issues.forEach((issue, idx) => {
            context.report({
              node: quasi,
              messageId: issue.messageId,
              data: issue.data,
              // Same rule as the string-literal path: attach to the last
              // fixable issue, not the last issue.
              fix:
                idx === lastFixable
                  ? (fixer) => {
                      // A TemplateElement's range covers the surrounding
                      // delimiters, not just the cooked text:
                      //   first quasi -> "`bg-white ${"
                      //   middle      -> "} text-slate-600 ${"
                      //   last        -> "}`"
                      //   no holes    -> "`only`"
                      // Replacing the node verbatim would swallow those and turn
                      // a template literal into invalid syntax. The cooked span
                      // therefore starts one character in -- past the opening
                      // backtick or the closing brace of the previous hole -- and
                      // runs for exactly `cooked.length` characters. The end is
                      // derived from the ORIGINAL cooked length, not from
                      // `fixed.length`, since the replacement is normally a
                      // different length than the text it replaces.
                      const rawText = context.sourceCode.getText(quasi);
                      const lead = rawText.startsWith('`') || rawText.startsWith('}') ? 1 : 0;
                      const start = quasi.range[0] + lead;
                      const end = start + cooked.length;
                      return fixer.replaceTextRange([start, end], fixed);
                    }
                  : undefined,
            });
          });
        }
      },
    };
  },
};

export { TOKEN_UTILITIES };
