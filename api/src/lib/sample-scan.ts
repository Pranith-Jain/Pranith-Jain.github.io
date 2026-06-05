/**
 * Public free sandbox lookup links.
 *
 * The "lite 0x12" experience can't run a Windows VM (Cloudflare Containers
 * are Paid-plan only — see Cloudflare pricing docs as of 2026-05). What it
 * CAN do for free is: fan out a hash to the dozen free lookup APIs we
 * already wire, then surface the public **web UIs** of major free
 * detonation sandboxes as one-click deep links. The user pastes / opens
 * the file in their browser of choice — same posture as the existing
 * /dfir/malware-scan page, but centralised in one response.
 *
 * Each entry knows how to build the hash-specific URL for its engine.
 * Engines that demand a free account / API key are flagged with
 * `requiresKey: true` so the UI can label them.
 */

export interface PublicSandbox {
  /** Display name shown in the UI. */
  name: string;
  /** 1-sentence description. */
  description: string;
  /** Free, no key required for the URL below. */
  requiresKey: boolean;
  /** Per-hash-type URL builder. `null` = no hash lookup; only manual paste. */
  build: ((hash: string, type: 'md5' | 'sha1' | 'sha256') => string) | null;
}

const SHA256 = 'sha256' as const;

export const PUBLIC_SANDBOXES: ReadonlyArray<PublicSandbox> = [
  {
    name: 'VirusTotal',
    description: '70+ engine scan with community comments. Free 4 lookups/minute per IP.',
    requiresKey: false,
    build: (h, _t) => `https://www.virustotal.com/gui/file/${h}`,
  },
  {
    name: 'MalwareBazaar',
    description: 'abuse.ch sample database with YARA / signature tags. Free.',
    requiresKey: false,
    build: (h, t) => (t === SHA256 ? `https://bazaar.abuse.ch/sample/${h}/` : null) as unknown as string,
  },
  {
    name: 'Triage',
    description: 'Public sandbox reports (community tier). Free key gives 200 submissions/day.',
    requiresKey: false,
    build: (h, _t) => `https://tria.ge/s?q=${encodeURIComponent(h)}`,
  },
  {
    name: 'Hybrid Analysis',
    description: 'CrowdStrike Falcon sandbox reports (community tier). Free key needed for full API.',
    requiresKey: true,
    build: (h, _t) => `https://www.hybrid-analysis.com/search?query=${encodeURIComponent(h)}`,
  },
  {
    name: 'CAPE Sandbox (public)',
    description: 'kevoreilly/CAPEv2 community detonation results.',
    requiresKey: false,
    build: (h, _t) => `https://cape.sandbox.capev2.com/api/v1/tasks/search/sha256/${h}/`,
  },
  {
    name: 'ANY.RUN',
    description: 'Interactive cloud sandbox. Free community tier with replay limits.',
    requiresKey: false,
    build: (h, _t) => `https://app.any.run/submissions/?search=${encodeURIComponent(h)}`,
  },
  {
    name: 'Joe Sandbox',
    description: 'Basic free tier with limited public reports.',
    requiresKey: false,
    build: (h, _t) => `https://www.joesandbox.com/search?q=${encodeURIComponent(h)}`,
  },
  {
    name: 'Intezer Analyze',
    description: 'Code-reuse DNA detection. Free community key needed for full results.',
    requiresKey: true,
    build: (h, _t) => `https://analyze.intezer.com/files/${h}`,
  },
  {
    name: 'YARAify',
    description: 'abuse.ch YARA + ClamAV + static rule matches. Free with abuse.ch API key.',
    requiresKey: true,
    build: (h, _t) => `https://yaraify-api.abuse.ch/sample/${h}`,
  },
  {
    name: 'ThreatFox',
    description: 'abuse.ch IOC database — confirms a hash is in the wild.',
    requiresKey: false,
    build: (h, _t) => `https://threatfox.abuse.ch/browse?search=hash%3A${h}`,
  },
  {
    name: 'InQuest Labs',
    description: 'Deep file analysis + REiFS reputation. Free.',
    requiresKey: false,
    build: (h, _t) => `https://labs.inquest.net/dfi/sha256/${h}`,
  },
  {
    name: 'OTX (AlienVault)',
    description: 'Open Threat Exchange — community pulses referencing the hash.',
    requiresKey: false,
    build: (h, _t) => `https://otx.alienvault.com/indicator/file/${h}`,
  },
];

/**
 * Return every public-sandbox entry that supports the given hash type.
 * Filters out engines whose `build` only handles one hash type when the
 * caller passed a different one.
 */
export function publicSandboxesFor(hash: string, type: 'md5' | 'sha1' | 'sha256'): PublicSandbox[] {
  if (!hash) return [];
  return PUBLIC_SANDBOXES.filter((s) => {
    if (!s.build) return false;
    const url = s.build(hash, type);
    return typeof url === 'string' && url.length > 0;
  }).map((s) => ({ ...s, build: s.build }));
}
