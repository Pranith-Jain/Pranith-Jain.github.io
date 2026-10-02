#!/usr/bin/env node
/**
 * Measure Cumulative Layout Shift and attribute it to DOM elements.
 *
 * Uses the LayoutShift PerformanceObserver plus the `sources` array, which
 * names the nodes that moved. Output mirrors the browser DevTools "CLS
 * culprits" panel so results can be compared against it directly.
 *
 * Usage:
 *   node scripts/measure-cls.mjs <url> [moreUrls...]
 *   node scripts/measure-cls.mjs https://pranithjain.qzz.io/
 *
 * Options via env:
 *   CLS_SETTLE_MS  how long to wait after load for late shifts (default 6000)
 *   CLS_SKIP_CACHE  1 = bypass HTTP cache (default), 0 = allow cache
 *   CLS_VIEWPORT   WxH, e.g. 390x844 (default 1280x900)
 */
import { chromium } from 'playwright';

const SETTLE_MS = Number(process.env.CLS_SETTLE_MS ?? 6000);
const SKIP_CACHE = process.env.CLS_SKIP_CACHE !== '0';
const [VW, VH] = (process.env.CLS_VIEWPORT ?? '1280x900').split('x').map(Number);

const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error('usage: node scripts/measure-cls.mjs <url> [...]');
  process.exit(1);
}

const browser = await chromium.launch();

for (const url of urls) {
  const context = await browser.newContext({
    viewport: { width: VW, height: VH },
    isMobile: VW < 700,
    hasTouch: VW < 700,
    bypassCSP: false,
  });
  const page = await context.newPage();

  // DevTools and Lighthouse both throttle by default, and throttling is what
  // makes late-arriving content visibly shift. Unthrottled numbers understate
  // the problem, so CPU throttling defaults on.
  const cpus = Number(process.env.CLS_CPU ?? 4);
  if (cpus > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpus });
  }

  if (SKIP_CACHE) {
    await context.route('**/*', (route) =>
      route.continue({ headers: { ...route.request().headers(), 'cache-control': 'no-cache' } }),
    );
  }

  // Installed before any script runs so no shift is missed.
  await page.addInitScript(() => {
    window.__cls = { total: 0, entries: [] };
    const describe = (node) => {
      if (!node || node.nodeType !== 1) return '(detached)';
      let el = node;
      let s = el.tagName.toLowerCase();
      if (el.id) s += `#${el.id}`;
      const cls = (el.getAttribute?.('class') ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 4);
      if (cls.length) s += `.${cls.join('.')}`;
      return s;
    };
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        // hadRecentInput: only count shifts NOT following a user interaction.
        if (e.hadRecentInput) continue;
        window.__cls.total += e.value;
        window.__cls.entries.push({
          value: e.value,
          time: Math.round(e.startTime),
          sources: (e.sources ?? []).map((s) => ({
            node: describe(s.node),
            from: s.previousRect ? `${Math.round(s.previousRect.width)}x${Math.round(s.previousRect.height)}` : '',
            to: s.currentRect ? `${Math.round(s.currentRect.width)}x${Math.round(s.currentRect.height)}` : '',
          })),
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  } catch (err) {
    console.log(`\n${url}\n  navigation failed: ${err.message}`);
    await context.close();
    continue;
  }

  // Let late shifts land: async data, font swap, lazy hydration.
  await page.waitForTimeout(SETTLE_MS);

  const result = await page.evaluate(() => {
    // Aggregate by selector so a repeatedly-shifting element is one row.
    const byNode = new Map();
    for (const e of window.__cls.entries) {
      const key = e.sources.map((s) => s.node).join(' > ') || '(no source)';
      const prev = byNode.get(key) ?? { total: 0, count: 0 };
      prev.total += e.value;
      prev.count += 1;
      byNode.set(key, prev);
    }
    return {
      total: window.__cls.total,
      count: window.__cls.entries.length,
      rows: [...byNode.entries()]
        .map(([node, v]) => ({ node, total: v.total, count: v.count }))
        .sort((a, b) => b.total - a.total),
    };
  });

  const rating = result.total < 0.1 ? 'GOOD' : result.total < 0.25 ? 'needs-improvement' : 'POOR';
  console.log(`\n${url}`);
  console.log(`  CLS ${result.total.toFixed(3)}  [${rating}]  (${result.count} shifts)`);
  for (const r of result.rows.slice(0, 12)) {
    console.log(`    ${r.total.toFixed(3)}  x${String(r.count).padEnd(3)} ${r.node.slice(0, 130)}`);
  }

  await context.close();
}

await browser.close();