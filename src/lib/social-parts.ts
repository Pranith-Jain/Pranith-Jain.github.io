export interface SocialParts {
  /** The post/thread body, with the link + carousel blocks removed. */
  body: string;
  /** The link block to post separately (LinkedIn first comment / X first reply). */
  link?: { label: string; value: string };
  /** Optional carousel slide outline (LinkedIn document posts). */
  carousel?: string;
}

/**
 * Split generated social copy into the parts you post separately. The 2026
 * prompts append a "FIRST COMMENT: <url>" / "FIRST REPLY: <url>" block (the
 * link must NOT be in the body) and optionally a "CAROUSEL OUTLINE:" block, so
 * the UI can offer a copy button per part instead of one blob the user has to
 * hand-separate.
 */
export function splitSocial(text: string): SocialParts {
  let body = (text ?? '').trim();
  let link: { label: string; value: string } | undefined;
  let carousel: string | undefined;

  const linkMatch = body.match(/^[ \t]*FIRST (COMMENT|REPLY):[ \t]*(\S.*)$/im);
  if (linkMatch && linkMatch.index !== undefined) {
    link = {
      label: linkMatch[1]!.toUpperCase() === 'COMMENT' ? 'First comment' : 'First reply',
      value: linkMatch[2]!.trim(),
    };
    body = (body.slice(0, linkMatch.index) + body.slice(linkMatch.index + linkMatch[0].length)).trim();
  }

  const carIdx = body.search(/^[ \t]*CAROUSEL OUTLINE:/im);
  if (carIdx >= 0) {
    carousel = body
      .slice(carIdx)
      .replace(/^[ \t]*CAROUSEL OUTLINE:[ \t]*\n?/i, '')
      .trim();
    body = body.slice(0, carIdx).trim();
  }

  return { body, link, carousel };
}
