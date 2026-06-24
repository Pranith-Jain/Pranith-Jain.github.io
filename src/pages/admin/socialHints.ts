export type SocialPlatform = 'twitter' | 'linkedin' | 'instagram';

/**
 * Static 2026 best-time-to-post guidance for a B2B / infosec audience.
 * Directional (sources disagree on exact hour) — A/B test rather than treat
 * as gospel. Surfaced as a reminder next to the manual-posting controls.
 */
export function bestTimeHint(platform: SocialPlatform): string {
  if (platform === 'linkedin') {
    return 'Best: Tue–Thu, ~10am or ~4–5pm (audience local). Link in the first comment, not the body.';
  }
  if (platform === 'instagram') {
    return 'Best: Mon–Fri, 11am–1pm or 7–9pm (audience local).';
  }
  return 'Best: Tue–Thu, 9–11am (audience local). Link in the first reply, not post 1.';
}
