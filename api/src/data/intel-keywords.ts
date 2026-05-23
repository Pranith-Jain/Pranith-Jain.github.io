/**
 * Curated theme keywords for the heuristic extractor.
 *
 * Each entry is a (canonical, aliases[]) pair. A case-insensitive whole-word
 * match anywhere in (title + body) of a feed item adds the canonical token
 * to the extracted `tags` array.
 *
 * Keep this list TIGHT — additions cost extractor latency. Reject any phrase
 * that's too generic to be useful on its own ("security", "attack", "breach").
 * Source-of-truth lives here; mirror additions in `src/data/dfir/...` only if
 * the frontend also needs them.
 */
export interface IntelKeyword {
  canonical: string;
  aliases: string[];
}

export const INTEL_KEYWORDS: IntelKeyword[] = [
  // Delivery / initial access
  { canonical: 'spear-phishing', aliases: ['spear phishing', 'spearphishing'] },
  { canonical: 'phishing', aliases: [] },
  { canonical: 'watering hole', aliases: ['waterhole'] },
  { canonical: 'business email compromise', aliases: ['BEC', 'CEO fraud'] },
  { canonical: 'smishing', aliases: ['SMS phishing'] },
  { canonical: 'vishing', aliases: ['voice phishing'] },
  { canonical: 'malvertising', aliases: [] },
  { canonical: 'supply chain', aliases: ['supply-chain attack', 'software supply chain'] },
  { canonical: 'drive-by download', aliases: ['drive by download'] },

  // Tradecraft / techniques
  { canonical: 'zero-day', aliases: ['0-day', 'zero day', '0day'] },
  { canonical: 'n-day', aliases: ['n day'] },
  { canonical: 'living-off-the-land', aliases: ['LOLBin', 'LOLBAS', 'lolbins'] },
  { canonical: 'lateral movement', aliases: [] },
  { canonical: 'credential theft', aliases: ['credential harvesting', 'credential dumping'] },
  { canonical: 'data exfiltration', aliases: ['data exfil', 'exfiltrated'] },
  { canonical: 'persistence', aliases: [] },
  { canonical: 'privilege escalation', aliases: ['privesc'] },
  { canonical: 'defense evasion', aliases: [] },

  // Outcomes / categories
  { canonical: 'ransomware', aliases: ['raas'] },
  { canonical: 'double extortion', aliases: ['double-extortion'] },
  { canonical: 'wiper', aliases: ['data wiper'] },
  { canonical: 'cryptojacking', aliases: ['crypto miner', 'cryptominer', 'coinminer'] },
  { canonical: 'ddos', aliases: ['distributed denial of service'] },
  { canonical: 'infostealer', aliases: ['info stealer', 'info-stealer', 'stealer logs'] },
  { canonical: 'banking trojan', aliases: ['banker trojan'] },
  { canonical: 'rat', aliases: ['remote access trojan'] },
  { canonical: 'backdoor', aliases: ['back door'] },
  { canonical: 'rootkit', aliases: [] },
  { canonical: 'botnet', aliases: [] },
  { canonical: 'c2', aliases: ['command and control', 'command-and-control'] },
  { canonical: 'cryptocurrency theft', aliases: ['crypto theft', 'crypto heist'] },
  { canonical: 'pig butchering', aliases: ['pig-butchering', 'sha zhu pan'] },
  { canonical: 'romance scam', aliases: [] },

  // Targets / themes
  { canonical: 'critical infrastructure', aliases: ['ICS', 'OT', 'SCADA'] },
  { canonical: 'healthcare', aliases: [] },
  { canonical: 'financial services', aliases: ['fintech', 'banking sector'] },
  { canonical: 'government', aliases: [] },
  { canonical: 'defense industrial base', aliases: ['DIB'] },
  { canonical: 'diplomatic lure', aliases: ['diplomatic communications', 'diplomatic theme'] },

  // Cloud / SaaS
  { canonical: 'cloud breach', aliases: ['cloud compromise'] },
  { canonical: 'okta', aliases: [] },
  { canonical: 'microsoft 365', aliases: ['m365', 'office 365', 'o365'] },
  { canonical: 'azure ad', aliases: ['entra id', 'azuread'] },

  // Defense / response
  { canonical: 'edr bypass', aliases: ['edr evasion'] },
  { canonical: 'incident response', aliases: ['IR'] },
];
