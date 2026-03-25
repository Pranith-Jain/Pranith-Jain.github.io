import { personalInfo } from '../data/content';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-32 pb-12">
      <div className="flex flex-col items-center justify-between gap-6 border-t border-slate-200/60 pt-12 dark:border-white/10 md:flex-row">
        <a href="#top" className="group inline-flex items-center gap-3">
          <span className="h-10 w-10 rounded-xl shadow-glow flex items-center justify-center overflow-hidden transition group-hover:scale-110">
            <svg viewBox="0 0 36 36" className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="pjGradientFooter" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#2c3ee5" />
                  <stop offset="100%" stopColor="#435ef1" />
                </linearGradient>
              </defs>
              <rect width="36" height="36" rx="8" fill="url(#pjGradientFooter)" />
              <text
                x="50%"
                y="50%"
                dominantBaseline="central"
                textAnchor="middle"
                fill="white"
                fontFamily="Poppins, sans-serif"
                fontWeight="800"
                fontSize="16"
              >
                PJ
              </text>
            </svg>
          </span>
          <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
            {personalInfo.name}
          </span>
        </a>

        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
          © {currentYear} {personalInfo.name}. Focused on Threat Intel, Email Security & Cloud Identity.
        </p>
      </div>
    </footer>
  );
}
