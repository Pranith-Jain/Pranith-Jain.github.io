// Phase 5: Tailwind removed. PostCSS chain is now:
//   1. @pandacss/dev/postcss — handles Panda's @layer base blocks
//      and emits the compiled token CSS. The previous dual-pipeline
//      workaround (raw-string injection in main.tsx) is no longer
//      needed; we can use the canonical PostCSS plugin path.
//   2. autoprefixer — adds vendor prefixes (was used by Tailwind's
//      chain; now handles Panda's output).
export default {
  plugins: {
    '@pandacss/dev/postcss': {},
    autoprefixer: {},
  },
};
