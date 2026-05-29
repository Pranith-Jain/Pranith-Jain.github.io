module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh', 'jsx-a11y'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'jsx-a11y/anchor-is-valid': 'off',
    'jsx-a11y/scope': 'warn',
    'jsx-a11y/no-redundant-roles': 'warn',
    'jsx-a11y/alt-text': 'warn',
  },
  overrides: [
    {
      // Lazy-only vendor packages. These get their own Vite chunks (see
      // `manualChunks` in vite.config.ts) on the assumption they're loaded
      // exclusively via dynamic import inside their designated lazy entry
      // point. A static `import x from 'marked'` anywhere else would yank
      // the chunk into the eager graph and silently undo the perf win, so
      // we block static imports project-wide and allowlist the lazy entries
      // in the inner override below.
      files: ['src/**/*.{ts,tsx}'],
      rules: {
        // Base rule off; use TS-aware version that supports allowTypeImports.
        'no-restricted-imports': 'off',
        '@typescript-eslint/no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: '@xyflow/react',
                message:
                  'Static value import forbidden — load @xyflow/react only via React.lazy in src/pages/dfir/StixGraph.tsx. Type-only imports are fine via `import type {...}`.',
                allowTypeImports: true,
              },
              {
                name: 'react-simple-maps',
                message:
                  'Static value import forbidden — load react-simple-maps only via React.lazy in src/pages/dfir/ThreatMapChart.tsx.',
                allowTypeImports: true,
              },
              {
                name: 'marked',
                message:
                  'Static value import forbidden — load marked only via dynamic import inside the WikiArticle effect.',
                allowTypeImports: true,
              },
              {
                name: 'isomorphic-dompurify',
                message:
                  'Static value import forbidden — load isomorphic-dompurify only via dynamic import inside the WikiArticle effect.',
                allowTypeImports: true,
              },
              {
                name: 'exifr',
                message:
                  'Static value import forbidden — load exifr lazily inside the file-drop handler in src/pages/dfir/ExifParse.tsx.',
                allowTypeImports: true,
              },
            ],
          },
        ],
      },
    },
    {
      // Allowlist: the four designated lazy entry points. These ARE the
      // dynamic-import targets, so static imports here are legitimate and
      // the rule must not fire.
      files: [
        'src/pages/dfir/StixGraph.tsx',
        'src/pages/dfir/ThreatMapChart.tsx',
        // Loaded only via React.lazy in RelationshipGraph.tsx (its @xyflow/react
        // import is legitimate — the whole module is a dynamic-import target).
        'src/pages/threatintel/RelationshipGraphCanvas.tsx',
      ],
      rules: {
        '@typescript-eslint/no-restricted-imports': 'off',
      },
    },
  ],
  settings: {
    'jsx-a11y': {
      components: {
        ThemeToggle: 'button',
        BackToTop: 'button',
      },
    },
  },
};
