import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

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
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching. Each entry below produces
        // a dedicated chunk so that bumping one consumer doesn't invalidate
        // the vendor's edge cache.
        manualChunks: {
          // Core React stack.
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Icon set used across every page.
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
        assetFileNames: (assetInfo) => {
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
    target: 'es2020',
    // CSS code splitting
    cssCodeSplit: true,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'lucide-react'],
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
