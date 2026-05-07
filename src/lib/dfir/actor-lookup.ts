import { threatActors, type ThreatActor } from '../../data/dfir/threat-actors';

export interface CtiHints {
  tags?: string[]; // e.g. ["tor", "phishing", "ransomware"]
  country?: string; // e.g. "Russia", "DE", "US"
  techniques?: string[]; // e.g. ["T1566.001"]
  malware?: string[]; // e.g. ["BlackEnergy", "WannaCry"]
  free_text?: string[]; // misc context, used for substring fallback
}

export interface ScoredActor {
  actor: ThreatActor;
  score: number;
  matched: string[]; // labels of what matched, e.g. ["country:Russia", "tag:tor"]
}

const COUNTRY_ALIAS: Record<string, string[]> = {
  ru: ['russia', 'gru', 'svr', 'fsb'],
  cn: ['china'],
  kp: ['north korea', 'dprk'],
  ir: ['iran'],
  us: ['united states', 'nsa'],
  de: ['germany'],
  ua: ['ukraine'],
};

function lc(s: string | undefined): string {
  return (s ?? '').toLowerCase();
}

function countryMatches(hint: string, actorCountry: string): boolean {
  const h = lc(hint);
  const c = lc(actorCountry);
  if (!h || !c) return false;
  if (c.includes(h) || h.includes(c)) return true;
  // ISO-2 → name expansion
  const aliases = COUNTRY_ALIAS[h];
  if (aliases && aliases.some((a) => c.includes(a))) return true;
  return false;
}

export function lookupActors(hints: CtiHints, max = 6): ScoredActor[] {
  const scored: ScoredActor[] = [];

  for (const actor of threatActors) {
    let score = 0;
    const matched: string[] = [];

    // Country match (high weight)
    if (hints.country && actor.country && countryMatches(hints.country, actor.country)) {
      score += 10;
      matched.push(`country:${actor.country}`);
    }

    // Technique match (high weight) — exact MITRE id
    if (hints.techniques?.length) {
      for (const tech of hints.techniques) {
        if (actor.techniques.some((t) => t.toLowerCase() === tech.toLowerCase())) {
          score += 8;
          matched.push(`technique:${tech}`);
        }
      }
    }

    // Malware match (high weight) — substring
    if (hints.malware?.length) {
      for (const mw of hints.malware) {
        const lcMw = lc(mw);
        if (actor.malware.some((m) => lc(m).includes(lcMw) || lcMw.includes(lc(m)))) {
          score += 7;
          matched.push(`malware:${mw}`);
        }
      }
    }

    // Tag match (medium weight) — tag in actor description / tags / motivation / targets / malware
    if (hints.tags?.length) {
      const haystack = [actor.description, actor.motivation, ...actor.targets, ...actor.malware]
        .join(' ')
        .toLowerCase();
      for (const tag of hints.tags) {
        const t = lc(tag);
        if (!t || t.length < 3) continue;
        if (haystack.includes(t)) {
          score += 3;
          matched.push(`tag:${tag}`);
        }
      }
    }

    // Free-text match (low weight)
    if (hints.free_text?.length) {
      const haystack = [actor.name, ...actor.aliases, actor.description, ...actor.malware, ...actor.targets]
        .join(' ')
        .toLowerCase();
      for (const ft of hints.free_text) {
        const f = lc(ft);
        if (!f || f.length < 4) continue;
        if (haystack.includes(f)) {
          score += 2;
          matched.push(`text:${ft.slice(0, 30)}`);
        }
      }
    }

    if (score > 0) scored.push({ actor, score, matched });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max);
}
