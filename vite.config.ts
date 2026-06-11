import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

// Vite SSR build is invoked via `vite build --ssr src/entry-server.tsx`.
// Detect that mode via the CLI flag and switch the build config:
// the SSR build emits a single ESM module to dist/server/ for the
// prerender script to import; the SPA build keeps all the code-splitting,
// manualChunks, asset hashing, and modulePreload tuning unchanged.
const isSsrBuild = process.argv.includes('--ssr');

const ssrBuild = {
  // Output OUTSIDE dist/ so the SSR bundle (only used by the prerender
  // build step) doesn't get uploaded to Cloudflare Assets. Saves ~140KB
  // of unused upload + asset-binding entries.
  outDir: '.ssr-build',
  sourcemap: false,
  ssr: true,
  rollupOptions: {
    input: 'src/entry-server.tsx',
    output: { format: 'esm' as const },
  },
  target: 'es2020' as const,
};

const clientBuild = {
  outDir: 'dist',
  sourcemap: false,
  rollupOptions: {
    output: {
      // Manual chunk splitting for better caching. Each entry below produces
      // a dedicated chunk so that bumping one consumer doesn't invalidate
      // the vendor's edge cache.
      //
      // 2026-05-12 perf experiment: tried removing `vendor-icons` to let
      // Rollup tree-shake icons per route. RESULT: mobile / regressed
      // 63→39 and mobile /threatintel/wiki regressed 64→53 because icons
      // used by always-mounted components (Header, AppShell, Footer,
      // CommandPalette, BackToTop) got inlined into the index chunk and
      // got parsed on every cold load. The shared vendor-icons chunk
      // amortizes that cost across pages. Reverted; the comment stays as
      // a "don't try this again" marker.
      manualChunks: {
        // Core React stack (or preact/compat on the client; see resolve.alias).
        'vendor-react': ['react', 'react-dom', 'react-router-dom'],
        // Icon set used across every page. Kept as a shared chunk — see
        // the failed experiment note above.
        'vendor-icons': ['lucide-react'],
        // Graph viz used ONLY by /dfir/stix. Splitting it ensures the
        // 133KB xyflow runtime is its own chunk that's lazy-fetched.
        'vendor-xyflow': ['@xyflow/react'],
        // World-map renderer used ONLY by /threatintel/threat-map.
        'vendor-maps': ['react-simple-maps'],
        // Markdown stack used ONLY by /threatintel/wiki/:slug. Loaded
        // dynamically by WikiArticle, so isolating it keeps the wiki
        // detail chunk slim.
        'vendor-md': ['marked', 'isomorphic-dompurify'],
      },
      // Asset naming for better caching
      entryFileNames: 'assets/[name]-[hash].js',
      chunkFileNames: 'assets/[name]-[hash].js',
      assetFileNames: (assetInfo: { name?: string }) => {
        if (/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(assetInfo.name || '')) {
          return 'assets/images/[name]-[hash][extname]';
        }
        if (/\.(woff2?|ttf|otf|eot)$/i.test(assetInfo.name || '')) {
          return 'assets/fonts/[name]-[hash][extname]';
        }
        return 'assets/[name]-[hash][extname]';
      },
      compact: true,
    },
  },
  // Reduce chunk size warnings
  chunkSizeWarningLimit: 1000,
  // Target modern browsers for smaller bundles
  target: 'es2020' as const,
  // CSS code splitting
  cssCodeSplit: true,
  // Vite eagerly emits <link rel="modulepreload"> for every chunk reachable
  // from the entry, including dynamic-import chunks. That defeats the lazy
  // split for vendor-xyflow / vendor-maps / vendor-md / exifr — every
  // visitor would download hundreds of KB they may never need. Strip those
  // chunks from the entry's preload list so they're fetched only when the
  // matching `import()` actually fires.
  modulePreload: {
    resolveDependencies: (_filename: string, deps: string[]) =>
      deps.filter(
        (d) =>
          !d.includes('vendor-xyflow') &&
          !d.includes('vendor-maps') &&
          !d.includes('vendor-md') &&
          !d.includes('exifr') &&
          !d.includes('full.esm') &&
          !d.includes('wiki-articles')
      ),
  },
};

// Client-only Preact alias. The CLIENT bundle swaps react/react-dom for
// preact/compat (saves ~120KB of parse work; mobile Lighthouse bottleneck
// is React's parse cost on simulated slow CPU). The SERVER bundle keeps
// react/react-dom because:
//   1. renderToReadableStream from 'react-dom/server.browser' is needed
//      for Phase 3 streaming SSR (await Suspense boundaries).
//   2. Server runs once at build time on fast Node CPU — Preact's parse
//      win doesn't apply there.
// Preact's hydration is designed to be lenient about React's HTML output
// (including <!--$--> Suspense markers), so the cross-runtime split is
// supported. Verified empirically on the deploy below.
const clientResolveAlias = {
  react: 'preact/compat',
  'react-dom': 'preact/compat',
  'react-dom/test-utils': 'preact/test-utils',
  'react/jsx-runtime': 'preact/jsx-runtime',
};

export default defineConfig(({ mode }) => ({
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [
    react(),
    mode === 'analyze' &&
      visualizer({
        open: true,
        filename: 'stats.html',
        gzipSize: true,
        brotliSize: true,
      }),
  ].filter(Boolean),
  base: '/',
  build: isSsrBuild ? ssrBuild : clientBuild,
  // SSR build keeps React; client build swaps to preact/compat.
  resolve: isSsrBuild ? {} : { alias: clientResolveAlias },
  optimizeDeps: {
    include: ['lucide-react'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
}));
