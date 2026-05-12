/**
 * Full-page SVG-noise grain overlay at 3% opacity.
 *
 * Adopted from impeccable.style. Sits fixed at z-9999 with
 * pointer-events-none so it never interferes with input. The texture
 * applies to portfolio routes AND the /dfir + /threatintel app shells
 * — it's a global finish, not a per-section decoration.
 *
 * The SVG noise is encoded as a data: URL so there's no extra request.
 * feTurbulence baseFrequency 0.8 with 4 octaves produces a fine,
 * uniform grain reminiscent of analog film stock.
 */

const NOISE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'>
  <filter id='n'>
    <feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/>
    <feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0'/>
  </filter>
  <rect width='100%' height='100%' filter='url(#n)'/>
</svg>`;

const NOISE_DATA_URL = `url("data:image/svg+xml;utf8,${encodeURIComponent(NOISE_SVG)}")`;

export function GrainOverlay(): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[9999] opacity-[0.03] mix-blend-multiply dark:opacity-[0.05] dark:mix-blend-overlay"
      style={{
        backgroundImage: NOISE_DATA_URL,
        backgroundSize: '200px 200px',
      }}
    />
  );
}
