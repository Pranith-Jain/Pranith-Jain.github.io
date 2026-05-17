import { useId } from 'react';

/**
 * The "PJ" brand mark. Single source of truth — was duplicated inline
 * three times (hero logo, hero avatar, footer). `useId` gives each
 * instance a unique gradient id so multiple marks on one page stay
 * valid SVG.
 */
export function PjMark({ className }: { className?: string }): JSX.Element {
  const id = useId();
  return (
    <svg viewBox="0 0 36 36" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2c3ee5" />
          <stop offset="100%" stopColor="#435ef1" />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="8" fill={`url(#${id})`} />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fill="white"
        fontFamily="'Bricolage Grotesque', sans-serif"
        fontWeight="800"
        fontSize="16"
      >
        PJ
      </text>
    </svg>
  );
}
