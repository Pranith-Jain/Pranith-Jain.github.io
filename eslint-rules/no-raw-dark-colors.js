/**
 * ESLint rule to enforce design token usage for dark mode colors.
 *
 * Instead of raw Tailwind colors like:
 *   dark:bg-slate-700
 *   dark:bg-slate-800
 *   dark:border-slate-700
 *   dark:border-slate-600
 *   dark:hover:bg-slate-700
 *
 * Use the project's design tokens:
 *   dark:bg-[rgb(var(--surface-200))]
 *   dark:bg-[rgb(var(--surface-300))]
 *   dark:border-[rgb(var(--border-400))]
 *   dark:hover:bg-[rgb(var(--surface-300))]
 */

const TOKEN_MAP = {
  // Background tokens
  'dark:bg-slate-700': 'dark:bg-[rgb(var(--surface-300))]',
  'dark:bg-slate-800': 'dark:bg-[rgb(var(--surface-200))]',
  'dark:bg-slate-900': 'dark:bg-[rgb(var(--surface-100))]',
  'dark:bg-slate-600': 'dark:bg-[rgb(var(--surface-300))]',

  // Border tokens
  'dark:border-slate-700': 'dark:border-[rgb(var(--border-400))]',
  'dark:border-slate-600': 'dark:border-[rgb(var(--border-400))]',
  'dark:border-slate-500': 'dark:border-[rgb(var(--border-500))]',

  // Hover tokens
  'dark:hover:bg-slate-700': 'dark:hover:bg-[rgb(var(--surface-300))]',
  'dark:hover:bg-slate-600': 'dark:hover:bg-[rgb(var(--surface-300))]',
  'dark:hover:bg-slate-800': 'dark:hover:bg-[rgb(var(--surface-200))]',

  // Focus tokens
  'dark:focus:bg-slate-700': 'dark:focus:bg-[rgb(var(--surface-300))]',
  'dark:focus:bg-slate-800': 'dark:focus:bg-[rgb(var(--surface-200))]',
};

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce design token usage for dark mode colors instead of raw Tailwind colors',
      category: 'Best Practices',
      recommended: 'warn',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useDesignToken:
        'Raw dark mode color "{{raw}}" should use the design token "{{token}}". See src/index.css for available tokens.',
    },
  },

  create(context) {
    return {
      JSXAttribute(node) {
        if (!node.value || node.value.type !== 'Literal' || typeof node.value.value !== 'string') {
          return;
        }

        const className = node.value.value;
        const rawMatches = className.match(/dark:(?:bg|border|hover:bg|focus:bg|text)-(?:slate|gray)-\d+/g);

        if (!rawMatches) return;

        for (const raw of rawMatches) {
          const token = TOKEN_MAP[raw];
          if (token) {
            context.report({
              node: node.value,
              messageId: 'useDesignToken',
              data: { raw, token },
              fix(fixer) {
                const fixed = className.replace(raw, token);
                return fixer.replaceText(node.value, `"${fixed}"`);
              },
            });
          }
        }
      },
    };
  },
};
