/**
 * Surface resolution (worker/surface.ts) — which front door a request Host
 * selects, and which host owns a path.
 * Run via: npx vitest run worker/surface.test.ts
 */
import { describe, it, expect } from 'vitest';
import { surfaceForHostname, owningToolHost } from './surface';
import { getAllowedOrigins } from '../api/src/lib/site-config';
import type { Env } from './env';

const APEX = 'pranithjain.qzz.io';
const CRUCIBLE = 'crucible.pranithjain.qzz.io';
const PANOPTICON = 'panopticon.pranithjain.qzz.io';
const SCOUT = 'scout.pranithjain.qzz.io';

/** Same shape as wrangler.jsonc#vars.TOOLS_HOSTS. */
const MAP = `/dfir=${CRUCIBLE},/threatintel=${PANOPTICON},/radar=${SCOUT}`;

function envWith(toolsHosts?: string): Env {
  return { TOOLS_HOSTS: toolsHosts } as Env;
}

describe('surfaceForHostname', () => {
  it('selects the tools surface on every configured host', () => {
    for (const host of [CRUCIBLE, PANOPTICON, SCOUT]) {
      expect(surfaceForHostname(host, envWith(MAP))).toBe('tools');
    }
  });

  it('selects the portfolio surface on the apex host', () => {
    expect(surfaceForHostname(APEX, envWith(MAP))).toBe('portfolio');
  });

  it('selects the portfolio surface on an unconfigured host', () => {
    expect(surfaceForHostname('argus.pranithjain.qzz.io', envWith(MAP))).toBe('portfolio');
  });

  it('is case-insensitive on both sides of the comparison', () => {
    expect(surfaceForHostname('Crucible.PranithJain.QZZ.io', envWith(MAP))).toBe('tools');
  });

  it('ignores a port suffix', () => {
    expect(surfaceForHostname(`${CRUCIBLE}:8443`, envWith(MAP))).toBe('tools');
  });

  it('fails safe to portfolio when TOOLS_HOSTS is unset, empty or whitespace', () => {
    // The split can only engage once the var is configured — a missing var
    // must reproduce the pre-split single-surface behaviour rather than 404.
    for (const raw of [undefined, '', '   ', ',,,']) {
      expect(surfaceForHostname(CRUCIBLE, envWith(raw))).toBe('portfolio');
      expect(surfaceForHostname(APEX, envWith(raw))).toBe('portfolio');
    }
  });

  it('ignores malformed entries instead of dropping the whole map', () => {
    // One bad pair must not take the others down with it.
    const raw = `nonsense,=,nodomain=,${MAP}`;
    expect(surfaceForHostname(CRUCIBLE, envWith(raw))).toBe('tools');
    expect(surfaceForHostname(SCOUT, envWith(raw))).toBe('tools');
  });

  it('treats an empty hostname as portfolio', () => {
    expect(surfaceForHostname('', envWith(MAP))).toBe('portfolio');
  });
});

describe('owningToolHost', () => {
  it('gives each configured prefix its own host', () => {
    expect(owningToolHost('/dfir', envWith(MAP))).toBe(CRUCIBLE);
    expect(owningToolHost('/threatintel', envWith(MAP))).toBe(PANOPTICON);
    expect(owningToolHost('/radar', envWith(MAP))).toBe(SCOUT);
  });

  it('matches nested paths', () => {
    expect(owningToolHost('/dfir/breach', envWith(MAP))).toBe(CRUCIBLE);
    expect(owningToolHost('/threatintel/tools/copilot', envWith(MAP))).toBe(PANOPTICON);
    expect(owningToolHost('/radar/node/42', envWith(MAP))).toBe(SCOUT);
  });

  it('is segment-aware — /dfir does not claim /dfir-extra', () => {
    expect(owningToolHost('/dfir-extra', envWith(MAP))).toBeNull();
    expect(owningToolHost('/radars', envWith(MAP))).toBeNull();
  });

  it('leaves portfolio routes on the apex', () => {
    expect(owningToolHost('/', envWith(MAP))).toBeNull();
    expect(owningToolHost('/projects', envWith(MAP))).toBeNull();
    expect(owningToolHost('/blog/unit-post', envWith(MAP))).toBeNull();
  });

  it('leaves an unconfigured app prefix on the apex', () => {
    // /argus has no hostname yet — pointing its canonical at a host with no
    // DNS record would be worse than leaving it on the apex.
    expect(owningToolHost('/argus', envWith(MAP))).toBeNull();
  });

  it('falls back to the apex for every path when unconfigured', () => {
    for (const path of ['/', '/dfir', '/threatintel', '/radar']) {
      expect(owningToolHost(path, envWith(undefined))).toBeNull();
      expect(owningToolHost(path, envWith(''))).toBeNull();
    }
  });
});

// getAllowedOrigins is the single allow-list behind the CORS preflight and the
// auth same-origin bypass. The tools surfaces are the same app on several
// front doors, so every one of their origins has to be in there or every API
// call made from them is rejected as cross-origin.
describe('getAllowedOrigins with tools surfaces configured', () => {
  it('allows the apex and every tools origin', () => {
    const origins = getAllowedOrigins({ SITE_URL: 'https://pranithjain.qzz.io', TOOLS_HOSTS: MAP });
    expect(origins).toContain('https://pranithjain.qzz.io');
    expect(origins).toContain(`https://${CRUCIBLE}`);
    expect(origins).toContain(`https://${PANOPTICON}`);
    expect(origins).toContain(`https://${SCOUT}`);
  });

  it('does not duplicate the apex when a mapping points at it', () => {
    const origins = getAllowedOrigins({ SITE_URL: 'https://pranithjain.qzz.io', TOOLS_HOSTS: `/dfir=${APEX}` });
    expect(origins.filter((o) => o === 'https://pranithjain.qzz.io')).toHaveLength(1);
  });

  it('adds each tools origin only once when several prefixes share a host', () => {
    const origins = getAllowedOrigins({ SITE_URL: 'https://pranithjain.qzz.io', TOOLS_HOSTS: `/dfir=${CRUCIBLE},/radar=${CRUCIBLE}` });
    expect(origins.filter((o) => o === `https://${CRUCIBLE}`)).toHaveLength(1);
  });

  it('omits every tools origin when TOOLS_HOSTS is unset or blank', () => {
    for (const raw of [undefined, '', '   ']) {
      const origins = getAllowedOrigins({ SITE_URL: 'https://pranithjain.qzz.io', TOOLS_HOSTS: raw });
      expect(origins.some((o) => o.includes('crucible.') || o.includes('panopticon.'))).toBe(false);
    }
  });
});
