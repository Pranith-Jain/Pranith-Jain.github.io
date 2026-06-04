import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        singleWorker: true,
        miniflare: {
          compatibilityFlags: ['nodejs_compat'],
          modules: true,
        },
        wrangler: { configPath: './wrangler.toml' },
      },
    },
  },
});
