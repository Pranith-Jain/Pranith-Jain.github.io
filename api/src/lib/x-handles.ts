/**
 * Canonical X (Twitter) handle registry for the threat-intel ingestion layer.
 *
 * Single source of truth for the handles the backend fetches. Two consumers
 * derive from it:
 *   - `x-claims.ts` fetches `CTI_CLAIM_HANDLES` and runs each post through the
 *     ransomware/breach claim parser.
 *   - `cyberpulse-ingest.ts` fetches the full `X_ACCOUNTS` set (claim handles
 *     plus vendor/lab/researcher accounts) for the incident tracker, and uses
 *     `CLAIM_HANDLES_LOWER` to skip direct fetches for handles already covered
 *     by the x-claims pipeline.
 *
 * Keeping these in one module prevents the lists from drifting (previously
 * three separate copies disagreed on casing - `FalconFeedsIO` vs
 * `FalconFeedsio`, `dailydarkweb` vs `DailyDarkWeb` - and the ingestion list
 * accumulated corrupted handles like `dnaborhacks`/`paborhack` that failed
 * UserByScreenName resolution on every cron tick). X resolves handles
 * case-insensitively, so the casing here is canonical-for-display only.
 */

/** Curated CTI/breach channels that post ransomware leak-site + breach claims. */
export const CTI_CLAIM_HANDLES: string[] = [
  'FalconFeedsio',
  'DailyDarkWeb',
  'DarkWebInformer',
  'ransomnews',
  'LeakRadario',
  'MonThreat',
  'VivekIntel',
  'DarkForumss',
  'VulnCheckAI',
  'etugenio',
  'drb_ra',
  '3xp0rtblog',
  'alphahunt_io',
  'CTI__Updates',
  'spchainattack',
];

/** Vendor labs, researchers and news accounts fetched directly (not claim feeds). */
export const X_DIRECT_ACCOUNTS: string[] = [
  'RansomLook',
  'BleepinComputer',
  'TheHackerNews',
  'ido_cohen2',
  'MalwareTechBlog',
  'TalosSecurity',
  'unit42',
  'Mandiant',
  'RecordedFuture',
  'FlashpointIntel',
  'SOCRadar',
  'GroupIB',
  'intel471',
];

/** Full CyberPulse ingestion set: claim feeds first, then direct accounts. */
export const X_ACCOUNTS: string[] = [...CTI_CLAIM_HANDLES, ...X_DIRECT_ACCOUNTS];

/** Lowercased claim handles - used to skip direct fetches for covered handles. */
export const CLAIM_HANDLES_LOWER: Set<string> = new Set(CTI_CLAIM_HANDLES.map((h) => h.toLowerCase()));
