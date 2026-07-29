import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
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
      manualChunks(id: string) {
        if (id.includes('node_modules/preact/') || id.includes('node_modules/react-router-dom')) {
          return 'vendor-react';
        }
        if (id.includes('node_modules/lucide-react')) {
          return 'vendor-icons';
        }
        if (id.includes('node_modules/@xyflow/react')) {
          return 'vendor-xyflow';
        }
        if (id.includes('node_modules/react-simple-maps')) {
          return 'vendor-maps';
        }
        // NOTE (2026-07-29 perf audit): manual chunks for recharts/d3-*
        // ("vendor-charts") and jspdf ("vendor-pdf") were REMOVED. Nothing in
        // the eager graph imports those libs (every consumer is a lazy route
        // or a dynamic import()), yet rolldown's manualChunks hoisted the two
        // chunks into the entry's STATIC import list, so every page load
        // shipped ~540KB of recharts/d3 + ~432KB of jspdf (~300KB gzip) that
        // the landing page never uses. Natural code splitting keeps them as
        // shared dynamic chunks fetched only by the lazy pages that need
        // them. Do not re-add manual chunk rules for libraries that are only
        // dynamically reachable - same footgun as the 2026-05-12 vendor-icons
        // note above, in the opposite direction.
        if (id.includes('node_modules/tesseract.js')) {
          return 'vendor-ocr';
        }
        // "vendor-md" (marked + isomorphic-dompurify) was removed in the same
        // 2026-07-29 audit pass for the same reason: every importer uses a
        // dynamic import(), and after the charts/pdf rules went away the
        // manual chunk got hoisted into the entry's static imports instead.
        if (
          id.includes('src/data/threatintel-hubs') ||
          id.includes('src/data/dfir-hubs') ||
          id.includes('components/dfir/tool-sections') ||
          id.includes('src/data/threatintel-sections') ||
          id.includes('src/data/sidebar-nav')
        ) {
          return 'data-catalogs';
        }
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
  // react-simple-maps ships a UMD "browser" build that references prop-types
  // as a bare external — rolldown can't resolve it. Force the ESM build.
  'react-simple-maps': 'react-simple-maps/dist/index.es.js',
};

export default defineConfig(({ mode }) => ({
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [
    tailwindcss(),
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
