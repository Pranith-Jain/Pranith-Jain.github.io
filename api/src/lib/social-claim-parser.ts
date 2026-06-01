/**
 * Heuristic classifier for free-text threat-intel social posts (X / Telegram
 * channels such as FalconFeeds.io and Dark Web Intelligence / @DailyDarkWeb).
 *
 * These channels post prose, not structured fields, so extraction is
 * deliberately CONSERVATIVE — optimised for precision over recall. A post is
 * only classified as a `ransomware` victim claim when BOTH a ransomware group
 * AND a victim can be pulled from a recognised template; otherwise it falls
 * back to `breach` (data-leak / DB-for-sale claims) or `other`. The downstream
 * ransomware-live feed requires victim+group, so a missed extraction simply
 * drops the post rather than injecting a garbage row into a clean feed.
 */

export type SocialClaimKind = 'ransomware' | 'breach' | 'other';

export interface SocialClaim {
  kind: SocialClaimKind;
  /** Targeted organisation, when a template match yields one. */
  victim?: string;
  /** Ransomware group/operation name (only for kind === 'ransomware'). */
  group?: string;
  /** Country, from a leading flag-emoji + name prefix ("🇲🇽 Mexico - …"). */
  country?: string;
}

/** Strip t.co / generic URLs, unescape a couple of entities, collapse whitespace. */
function clean(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tidy an extracted victim span: trim, drop trailing punctuation/connectors,
 * strip a leading flag/emoji, and reject spans that are obviously not a name
 * (too short, or starting lowercase noise). Returns undefined when unusable.
 */
function tidyVictim(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let v = raw.replace(/\s+/g, ' ').trim();
  // Cut at the first sentence/clause boundary so we don't swallow the rest.
  v = v.split(/[.;|\n]| - | – /)[0]!.trim();
  // Drop trailing connectors/punctuation left by the cut.
  v = v
    .replace(/[\s,:;]+$/, '')
    .replace(/\s+(?:and|the|a|an|in|of|for|with|to)$/i, '')
    .trim();
  // Drop trailing common-noun descriptors that aren't part of the org name
  // ("POLRI personnel" → "POLRI", "Acme customers data" → "Acme"). Repeated so
  // stacked descriptors unwind; capitalised tokens and parentheticals (real
  // name parts, e.g. "del Centro (UTC)") are preserved.
  const DESCRIPTORS =
    /\s+(?:personnel|data|records?|customers?|users?|employees?|database|systems?|network|information|accounts?|members?|citizens?|residents?)$/i;
  let prev: string;
  do {
    prev = v;
    v = v.replace(DESCRIPTORS, '').trim();
  } while (v !== prev);
  // Drop a trailing parenthetical that's a lowercase descriptor
  // ("( a US-based company )") while keeping an acronym ("(UTC)").
  v = v.replace(/\s*\(\s*[a-z][^)]*\)?\s*$/u, '').trim();
  // Strip a leading flag emoji / stray punctuation.
  v = v.replace(/^[^\p{L}\p{N}(]+/u, '').trim();
  if (v.length < 2 || v.length > 90) return undefined;
  // A span containing "ransomware"/"gang" is the group sentence, not a victim
  // (e.g. "The Qilin ransomware group" wrongly captured by a "… has added" match).
  if (/\bransomware\b|\bgang\b/i.test(v)) return undefined;
  // Reject generic count/quantity phrases that aren't an org name
  // ("3 new victims", "new victims", "more companies").
  if (
    /^(?:\d+\s+)?(?:new\s+|more\s+|several\s+|multiple\s+)?(?:victims?|companies|organi[sz]ations?|targets?|entities|firms?)$/i.test(
      v
    )
  ) {
    return undefined;
  }
  return v;
}

/** Pull "🇲🇽 Mexico - …" or "🇻🇪 Venezuela: …" country prefix. */
function extractCountry(text: string): string | undefined {
  // Flag = two regional-indicator symbols; capture the words that follow it
  // up to a separator. These channels lead ransomware/breach posts this way.
  const m = /^[\s]*[\u{1F1E6}-\u{1F1FF}]{2}\s*([A-Z][A-Za-z.()\- ]{1,40}?)\s*[-:]/u.exec(text);
  if (m?.[1]) {
    const c = m[1].trim();
    if (c.length >= 2 && c.length <= 40) return c;
  }
  return undefined;
}

// Group sits immediately before "ransomware (group|gang|operation|team)", or
// after an explicit "ransomware group:" / "group:" label.
const GROUP_BEFORE_RE = /\b(?:by|from|the)\s+([A-Za-z0-9][\w'.-]*(?:\s+[A-Za-z0-9][\w'.-]*){0,2}?)\s+ransomware\b/i;
// Require an explicit separator after the label — without it, "ransomware
// group has added …" wrongly captured the verb "has" as the group name.
const GROUP_LABEL_RE = /\bransomware\s+(?:group|gang|operation|team)\s*[:-]\s*([A-Za-z0-9][\w'.-]{1,28})/i;

// Verbs / fillers that can sit next to "ransomware" but are never a group name.
const GROUP_STOPWORDS =
  /^(?:the|a|an|this|that|new|recent|by|from|another|has|have|had|was|were|is|are|been|being|added|claims?|claimed|posted|listed|targeted|just|recently|also|now|today|their|its)$/i;

function extractGroup(text: string): string | undefined {
  const m = GROUP_BEFORE_RE.exec(text) ?? GROUP_LABEL_RE.exec(text);
  // Strip a leading article the connector may have left ("the LockBit" → "LockBit").
  const g = m?.[1]?.replace(/^(?:the|a|an|this|that)\s+/i, '').trim();
  if (!g || GROUP_STOPWORDS.test(g)) return undefined;
  return g;
}

// Victim templates, tried in order. Each capture is run through tidyVictim.
const VICTIM_RES: RegExp[] = [
  /\b(?:victim|target)\s*[:-]\s*([^\n]{2,90})/i,
  /\badded\s+(.+?)\s+to\s+(?:their|its|the)\b/i,
  /\b([A-Z][\w&.,'()\- ]{1,80}?)\s+has\s+(?:reportedly\s+)?(?:been\s+)?(?:fallen victim|listed|added|claimed|targeted)/,
  /\bbelonging to\s+([^\n]{2,90})/i,
  /\bassociated with\s+([A-Z][\w&.'()\- ]{1,80})/,
  /\blinked to\s+([A-Z][\w&.'()\- ]{1,80})/i,
  /\b([A-Z][\w&.,'()\- ]{1,80}?)\s+(?:allegedly\s+)?breached\b/i,
];

function extractVictim(text: string): string | undefined {
  for (const re of VICTIM_RES) {
    const m = re.exec(text);
    const v = tidyVictim(m?.[1]);
    if (v) return v;
  }
  return undefined;
}

const RANSOMWARE_RE = /\bransomware\b/i;
const BREACH_RE =
  /\b(?:breach(?:ed|es)?|database|db\s+leak|leaked|data\s+leak|for\s+sale|records?\s+(?:exposed|leaked|claimed)|compromised|exposed|stealer\s+logs?|infostealer)\b/i;

export function classifySocialClaim(input: string): SocialClaim {
  const text = clean(input);
  if (!text) return { kind: 'other' };
  const country = extractCountry(input);

  // Ransomware victim claim: requires the word "ransomware" AND a group token.
  if (RANSOMWARE_RE.test(text)) {
    const group = extractGroup(text);
    if (group) {
      const victim = extractVictim(text);
      return { kind: 'ransomware', group, ...(victim ? { victim } : {}), ...(country ? { country } : {}) };
    }
  }

  // Breach / data-leak claim.
  if (BREACH_RE.test(text)) {
    const victim = extractVictim(text);
    return { kind: 'breach', ...(victim ? { victim } : {}), ...(country ? { country } : {}) };
  }

  return { kind: 'other' };
}
