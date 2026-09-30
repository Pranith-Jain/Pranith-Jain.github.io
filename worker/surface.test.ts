/**
 * Surface resolution (worker/surface.ts) — which of the two front doors a
 * request Host selects.
 * Run via: npx vitest run worker/surface.test.ts
 */
import { describe, it, expect } from 'vitest';
import { surfaceForHostname } from './surface';
import { getAllowedOrigins } from '../api/src/lib/site-config';
import type { Env } from './env';

const TOOLS = 'tools.pranithjain.qzz.io';

function envWith(toolsHost?: string): Env {
  return { TOOLS_HOST: toolsHost } as Env;
}

describe('surfaceForHostname', () => {
  it('selects the tools surface on the configured host', () => {
    expect(surfaceForHostname(TOOLS, envWith(TOOLS))).toBe('tools');
  });

  it('selects the portfolio surface on the apex host', () => {
    expect(surfaceForHostname('pranithjain.qzz.io', envWith(TOOLS))).toBe('portfolio');
  });

  it('is case-insensitive on both sides of the comparison', () => {
    expect(surfaceForHostname('Tools.PranithJain.QZZ.io', envWith('TOOLS.PRANITHJAIN.QZZ.IO'))).toBe('tools');
  });

  it('ignores a port suffix', () => {
    expect(surfaceForHostname(`${TOOLS}:8443`, envWith(TOOLS))).toBe('tools');
  });

  it('tolerates whitespace around the configured host', () => {
    expect(surfaceForHostname(TOOLS, envWith(`  ${TOOLS} `))).toBe('tools');
  });

  it('fails safe to portfolio when TOOLS_HOST is unset, empty or whitespace', () => {
    // The split can only engage once the var is configured — a missing var
    // must reproduce today's single-surface behaviour rather than404.
    expect(surfaceForHostname(TOOLS, envWith(undefined))).toBe('portfolio');
    expect(surfaceForHostname(TOOLS, envWith(''))).toBe('portfolio');
    expect(surfaceForHostname(TOOLS, envWith('   '))).toBe('portfolio');
  });

  it('treats an empty hostname as portfolio', () => {
    expect(surfaceForHostname('', envWith(TOOLS))).toBe('portfolio');
  });
});

// getAllowedOrigins is the single allow-list behind the CORS preflight and the
// auth same-origin bypass. The tools surface is the same app on a second
// front door, so its origin has to be in there or every API call made from
// tools.pranithjain.qzz.io is rejected as cross-origin.
describe('getAllowedOrigins with a tools surface configured', () => {
  it('allows both the apex and the tools origin', () => {
    const origins = getAllowedOrigins({
      SITE_URL: 'https://pranithjain.qzz.io',
      TOOLS_HOST: TOOLS,
    });
    expect(origins).toContain('https://pranithjain.qzz.io');
    expect(origins).toContain(`https://${TOOLS}`);
  });

  it('does not duplicate the apex when TOOLS_HOST points at it', () => {
    const origins = getAllowedOrigins({
      SITE_URL: 'https://pranithjain.qzz.io',
      TOOLS_HOST: 'pranithjain.qzz.io',
    });
    expect(origins.filter((o) => o === 'https://pranithjain.qzz.io')).toHaveLength(1);
  });

  it('omits the tools origin when TOOLS_HOST is unset or blank', () => {
    for (const toolsHost of [undefined, '', '   ']) {
      const origins = getAllowedOrigins({ SITE_URL: 'https://pranithjain.qzz.io', TOOLS_HOST: toolsHost });
      expect(origins.some((o) => o.includes('tools.'))).toBe(false);
    }
  });
});
