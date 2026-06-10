import type { ProviderId, ProviderAdapter, ProviderEnv } from './types';
import { PROVIDER_SUPPORT, PROVIDER_TIMEOUT_MS } from './types';
import { virustotal } from './virustotal';
import { abuseipdb } from './abuseipdb';
import { shodan } from './shodan';
import { censys } from './censys';
import { netlas } from './netlas';
import { otx } from './otx';
import { urlscan } from './urlscan';
import { hybridanalysis } from './hybridanalysis';
import { spamhaus } from './spamhaus';
import { tor } from './tor';
import { doh } from './doh';
import { openphish } from './openphish';
import { threatfox } from './threatfox';
import { urlhaus } from './urlhaus';
import { malwarebazaar } from './malwarebazaar';
import { malshare } from './malshare';
import { hashlookup } from './hashlookup';
import { cinsarmy } from './cinsarmy';
import { bitwire } from './bitwire';
import { blocklistde } from './blocklistde';
import { binarydefense } from './binarydefense';
import { ipsum } from './ipsum';
import { phishingArmy } from './phishingArmy';
import { tweetfeed } from './tweetfeed';
import { greynoise } from './greynoise';
import { c2tracker } from './c2tracker';
import { sslbl } from './sslbl';
import { yaraify } from './yaraify';
import { phishtank } from './phishtank';
import { malwareworld } from './malwareworld';
import { emailrep } from './emailrep';
import { malpedia } from './malpedia';
import { pulsedive } from './pulsedive';
import { shodanInternetDB } from './shodan-internetdb';
import { spur } from './spur';
import { crowdsec } from './crowdsec';
import { ipinfo } from './ipinfo';
import { phishstats } from './phishstats';
import { digitalside } from './digitalside';
import { criminalip } from './criminalip';
import { certpl } from './certpl';
import { x4bnet } from './x4bnet';
import { kaspersky } from './kaspersky';
import { vulncheck } from './vulncheck';
import { maltiverse } from './maltiverse';
import { secrets } from './secrets';
import { webamon } from './webamon';
import { stopforumspam } from './stopforumspam';
import { dshield } from './dshield';

export { PROVIDER_SUPPORT, PROVIDER_TIMEOUT_MS };

export const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  virustotal,
  abuseipdb,
  shodan,
  censys,
  netlas,
  otx,
  urlscan,
  hybridanalysis,
  spamhaus,
  tor,
  doh,
  openphish,
  threatfox,
  urlhaus,
  malwarebazaar,
  malshare,
  hashlookup,
  cinsarmy,
  bitwire,
  blocklistde,
  binarydefense,
  ipsum,
  phishingArmy,
  tweetfeed,
  greynoise,
  c2tracker,
  sslbl,
  yaraify,
  phishtank,
  malwareworld,
  emailrep,
  malpedia,
  pulsedive,
  'shodan-internetdb': shodanInternetDB,
  spur,
  crowdsec,
  ipinfo,
  phishstats,
  digitalside,
  criminalip,
  certpl,
  x4bnet,
  kaspersky,
  vulncheck,
  maltiverse,
  secrets,
  webamon,
  stopforumspam,
  dshield,
};

export const BULK_ADAPTERS: Partial<Record<ProviderId, ProviderAdapter>> = {
  urlhaus,
  threatfox,
  malwarebazaar,
  malshare,
  yaraify,
  tor,
  spamhaus,
  doh,
  openphish,
  cinsarmy,
  bitwire,
  blocklistde,
  binarydefense,
  ipsum,
  phishingArmy,
  tweetfeed,
  hashlookup,
  c2tracker,
  sslbl,
  malwareworld,
  emailrep,
  pulsedive,
  kaspersky,
  stopforumspam,
  dshield,
};

export const PROVIDER_LABELS: Record<string, string> = {
  virustotal: 'VirusTotal',
  abuseipdb: 'AbuseIPDB',
  shodan: 'Shodan',
  spamhaus: 'Spamhaus',
  threatfox: 'ThreatFox',
  urlhaus: 'URLhaus',
  otx: 'AlienVault OTX',
  greynoise: 'GreyNoise',
  openphish: 'OpenPhish',
  tor: 'TOR Exit Nodes',
  cinsarmy: 'CINS Army',
  bitwire: 'Bitwire',
  blocklistde: 'BlockList.de',
  binarydefense: 'BinaryDefense',
  ipsum: 'IPsum',
  malwareworld: 'MalwareWorld',
  tweetfeed: 'TweetFeed',
  crowdsec: 'CrowdSec',
  vulncheck: 'VulnCheck',
  kaspersky: 'Kaspersky',
  urlscan: 'urlscan.io',
  hybridanalysis: 'Hybrid Analysis',
  malwarebazaar: 'MalwareBazaar',
  malshare: 'MalShare',
  hashlookup: 'HashLookup',
  phishtank: 'PhishTank',
  pulsedive: 'PulseDive',
  maltiverse: 'Maltiverse',
  phishstats: 'PhishStats',
  'shodan-internetdb': 'Shodan InternetDB',
  emailrep: 'EmailRep',
  certpl: 'CERT.PL',
  x4bnet: 'X4B.net',
  c2tracker: 'C2 Tracker',
  sslbl: 'SSL Blacklist',
  yaraify: 'YARAify',
  malpedia: 'Malpedia',
  ipinfo: 'IPinfo',
  spur: 'Spur',
  doh: 'DNS over HTTPS',
  phishingArmy: 'Phishing Army',
  secrets: 'Secrets Scan',
  censys: 'Censys',
  netlas: 'Netlas',
  criminalip: 'CriminalIP',
  digitalside: 'DigitalSide',
  webamon: 'Webamon Intel',
  stopforumspam: 'StopForumSpam',
  dshield: 'SANS ISC / DShield',
};

export function buildProviderEnv(env: {
  VT_API_KEY?: string;
  ABUSEIPDB_API_KEY?: string;
  SHODAN_API_KEY?: string;
  CENSYS_PAT?: string;
  CENSYS_ORG_ID?: string;
  NETLAS_API_KEY?: string;
  OTX_API_KEY?: string;
  URLSCAN_API_KEY?: string;
  HYBRID_ANALYSIS_API_KEY?: string;
  ABUSECH_AUTH_KEY?: string;
  MALSHARE_API_KEY?: string;
  CROWDSEC_API_KEY?: string;
  IPINFO_TOKEN?: string;
  CRIMINALIP_API_KEY?: string;
  KASPERSKY_API_KEY?: string;
  SPUR_API_KEY?: string;
  VULNCHECK_API_TOKEN?: string;
}): ProviderEnv {
  return {
    VT_API_KEY: env.VT_API_KEY ?? '',
    ABUSEIPDB_API_KEY: env.ABUSEIPDB_API_KEY ?? '',
    SHODAN_API_KEY: env.SHODAN_API_KEY ?? '',
    CENSYS_PAT: env.CENSYS_PAT ?? '',
    CENSYS_ORG_ID: env.CENSYS_ORG_ID ?? '',
    NETLAS_API_KEY: env.NETLAS_API_KEY ?? '',
    OTX_API_KEY: env.OTX_API_KEY ?? '',
    URLSCAN_API_KEY: env.URLSCAN_API_KEY ?? '',
    HYBRID_ANALYSIS_API_KEY: env.HYBRID_ANALYSIS_API_KEY ?? '',
    ABUSECH_AUTH_KEY: env.ABUSECH_AUTH_KEY,
    MALSHARE_API_KEY: env.MALSHARE_API_KEY,
    CROWDSEC_API_KEY: env.CROWDSEC_API_KEY,
    IPINFO_TOKEN: env.IPINFO_TOKEN,
    CRIMINALIP_API_KEY: env.CRIMINALIP_API_KEY,
    KASPERSKY_API_KEY: env.KASPERSKY_API_KEY,
    SPUR_API_KEY: env.SPUR_API_KEY,
    VULNCHECK_API_TOKEN: env.VULNCHECK_API_TOKEN,
  };
}
