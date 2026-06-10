export interface DorkQuery {
  label: string;
  q: string;
  webUrl: string;
  apiPath: string;
}

const DORK_SITES: { label: string; tmpl: (a: string) => string }[] = [
  { label: 'Etherscan', tmpl: (a) => `"${a}" site:etherscan.io` },
  { label: 'GitHub', tmpl: (a) => `"${a}" site:github.com` },
  { label: 'Twitter/X', tmpl: (a) => `"${a}" (site:twitter.com OR site:x.com)` },
  { label: 'Telegram', tmpl: (a) => `"${a}" site:t.me` },
  { label: 'Reddit', tmpl: (a) => `"${a}" site:reddit.com` },
  { label: 'Paste sites', tmpl: (a) => `"${a}" (site:pastebin.com OR site:ghostbin.com OR site:throwbin.io)` },
  { label: 'Web (broad)', tmpl: (a) => `"${a}"` },
];

export function buildDorkQueries(address: string): DorkQuery[] {
  return DORK_SITES.map(({ label, tmpl }) => {
    const q = tmpl(address);
    const enc = encodeURIComponent(q);
    return { label, q, webUrl: `https://www.google.com/search?q=${enc}`, apiPath: `/api/v1/google-dorks?q=${enc}` };
  });
}

export interface OsintTargets {
  ens: string | null;
  domains: string[];
  usernames: string[];
}

/** ENS-label-only derivation (no email pattern-guessing). Pure. */
export function deriveOsintTargets(label: string | null, ensName?: string | null): OsintTargets {
  const candidate = (ensName ?? label ?? '').trim();
  const ens = /\.eth$/i.test(candidate) ? candidate : (ensName ?? null);
  const domains: string[] = [];
  const usernames: string[] = [];
  if (/\.eth$/i.test(candidate)) {
    usernames.push(candidate.replace(/\.eth$/i, ''));
  } else if (/^[a-z0-9-]+\.[a-z]{2,}$/i.test(candidate)) {
    domains.push(candidate.toLowerCase());
  } else if (/^[a-z0-9_]{3,30}$/i.test(candidate)) {
    usernames.push(candidate);
  }
  return { ens, domains, usernames };
}

export interface PivotLink {
  label: string;
  apiPath: string;
}

/**
 * Map derived targets to existing OSINT route deep-links. Paths verified against
 * api/src/index.ts registration.
 */
export function tier2Pivots(t: OsintTargets): PivotLink[] {
  const out: PivotLink[] = [];
  for (const d of t.domains) {
    const e = encodeURIComponent(d);
    out.push({ label: `Breach search: ${d}`, apiPath: `/api/v1/breach/domain?domain=${e}` });
    out.push({ label: `Infostealer logs: ${d}`, apiPath: `/api/v1/hudsonrock?domain=${e}` });
    out.push({ label: `LeakIX: ${d}`, apiPath: `/api/v1/leakix?q=${e}` });
  }
  for (const u of t.usernames) {
    const e = encodeURIComponent(u);
    out.push({ label: `Threat hunt: ${u}`, apiPath: `/api/v1/threat-hunt?q=${e}` });
    out.push({ label: `Combolist: ${u}`, apiPath: `/api/v1/proxynova?q=${e}` });
  }
  return out;
}
