import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: [
      'dist',
      '.ssr-build',
      'node_modules',
      'public/tesseract',
      'worker-configuration.d.ts',
      '*.config.*',
      'scripts/',
      '.wrangler-dryrun/',
      '.wrangler/',
      'public/sw.js',
      'threatnexus-replication/dist/',
      'threat-intel-staging/**',
      'security-investigator-replication/**',
      'public/dfir/**',
    ],
  },

  // Base TS + recommended rules (brings in @typescript-eslint plugin automatically)
  ...tseslint.configs.recommended,

  // Typed-linting for source files (excludes test files not in tsconfig)
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx', 'src/test/**'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-render': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-expressions': 'off',
      'prefer-const': 'warn',
      'no-var': 'warn',
      'jsx-a11y/anchor-is-valid': 'off',
      'jsx-a11y/scope': 'warn',
      'jsx-a11y/no-redundant-roles': 'warn',
      'jsx-a11y/alt-text': 'warn',
    },
    settings: {
      'jsx-a11y': {
        components: {
          ThemeToggle: 'button',
          BackToTop: 'button',
        },
      },
    },
  },

  // Worker files (not in src/, but part of the project)
  {
    files: ['worker/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  // Lazy-only vendor restrictions (applied to all source)
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@xyflow/react',
              message: 'Load @xyflow/react only via React.lazy in StixGraph.tsx.',
              allowTypeImports: true,
            },
            {
              name: 'react-simple-maps',
              message: 'Load react-simple-maps only via React.lazy in ThreatMapChart.tsx.',
              allowTypeImports: true,
            },
            {
              name: 'marked',
              message: 'Load marked only via dynamic import inside WikiArticle effect.',
              allowTypeImports: true,
            },
            {
              name: 'isomorphic-dompurify',
              message: 'Load isomorphic-dompurify only via dynamic import inside WikiArticle effect.',
              allowTypeImports: true,
            },
            {
              name: 'exifr',
              message: 'Load exifr lazily inside the file-drop handler in ExifParse.tsx.',
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },

  // Allowlist lazy entry points
  {
    files: [
      'src/pages/dfir/StixGraph.tsx',
      'src/pages/dfir/ThreatMapChart.tsx',
      'src/pages/threatintel/RelationshipGraphCanvas.tsx',
      'src/components/dfir/osint/IdentifierNode.tsx',
      'src/components/dfir/osint/IdentifierGraph.tsx',
      'src/pages/dfir/ReportAnalyzer.tsx',
      'src/pages/threatintel/KnowledgeGraph.tsx',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': 'off',
    },
  },

  // Test files (no projectService, relaxed rules)
  {
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);
