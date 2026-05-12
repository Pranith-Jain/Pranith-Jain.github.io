import { Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { personalInfo } from '../data/content';
import { usePageViewCounter, formatViewCount } from '../hooks';

/**
 * Footer — three quiet columns: section index, stack info, contact +
 * visitor count. Hairline rules between elements; no decorative heavy
 * stripe at the top.
 */

interface FooterHeadProps {
  label: string;
}

function FooterHead({ label }: FooterHeadProps): JSX.Element {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-3">{label}</span>
      <span className="h-px flex-1 bg-rule" aria-hidden="true" />
    </div>
  );
}

const SECTIONS_INDEX: Array<{ subject: string; href: string }> = [
  { subject: 'Welcome', href: '#top' },
  { subject: 'About', href: '/about' },
  { subject: 'Experience', href: '/experience' },
  { subject: 'Projects', href: '/projects' },
  { subject: 'Skills', href: '/skills' },
  { subject: 'Contact', href: '/#contact' },
];

export function Footer() {
  const currentYear = new Date().getFullYear();
  const { count, isNewSession } = usePageViewCounter();

  return (
    <footer className="mt-32 border-t border-rule" role="contentinfo">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        {/* Masthead bar */}
        <div className="mb-12">
          <a
            href="#top"
            className="group inline-flex items-baseline gap-3"
            aria-label={`${personalInfo.name} — back to top`}
          >
            <span className="font-serif text-3xl font-medium leading-none text-ink-1 transition-colors duration-enter group-hover:text-accent">
              Pranith Jain
            </span>
          </a>
        </div>

        {/* Three quiet columns */}
        <div className="grid gap-12 sm:grid-cols-3 sm:gap-8">
          {/* Index */}
          <section>
            <FooterHead label="Index" />
            <ul className="space-y-1.5 font-mono text-[12px]">
              {SECTIONS_INDEX.map((s) => {
                const isExternal = s.href.startsWith('#') || s.href.startsWith('/#');
                const className =
                  'group flex items-baseline gap-3 text-ink-2 transition-colors duration-enter hover:text-accent';
                const inner = (
                  <>
                    <span className="flex-1">{s.subject}</span>
                    <span
                      aria-hidden="true"
                      className="h-px flex-1 bg-rule transition-colors duration-enter group-hover:bg-accent"
                    />
                  </>
                );
                if (isExternal) {
                  return (
                    <li key={s.href}>
                      <a href={s.href} className={className}>
                        {inner}
                      </a>
                    </li>
                  );
                }
                return (
                  <li key={s.href}>
                    <Link to={s.href} className={className}>
                      {inner}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Stack info */}
          <section>
            <FooterHead label="Colophon" />
            <dl className="space-y-3 font-mono text-[11px] leading-relaxed text-ink-2">
              <div>
                <dt className="text-[9px] uppercase tracking-[0.22em] text-ink-3">Set in</dt>
                <dd className="mt-1 text-ink-2">
                  <span className="font-serif text-[15px]">Newsreader</span> · Inter · JetBrains Mono
                </dd>
              </div>
              <div>
                <dt className="text-[9px] uppercase tracking-[0.22em] text-ink-3">Hosted</dt>
                <dd className="mt-1 text-ink-2">Cloudflare Workers · edge · no signup</dd>
              </div>
              <div>
                <dt className="text-[9px] uppercase tracking-[0.22em] text-ink-3">Built with</dt>
                <dd className="mt-1 text-ink-2">React · Vite · Tailwind · Hono</dd>
              </div>
            </dl>
          </section>

          {/* Contact + visitor count */}
          <section>
            <FooterHead label="Contact" />
            <ul className="space-y-2 font-mono text-[12px]">
              <li>
                <a
                  href={`mailto:${personalInfo.email}`}
                  className="group inline-flex items-baseline gap-2 text-ink-2 transition-colors duration-enter hover:text-accent"
                >
                  <span className="text-[9px] uppercase tracking-[0.22em] text-ink-3">Email</span>
                  <span className="underline decoration-1 underline-offset-4 group-hover:decoration-accent">
                    hello@pranithjain.qzz.io
                  </span>
                </a>
              </li>
              <li>
                <a
                  href={personalInfo.linkedInUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-baseline gap-2 text-ink-2 transition-colors duration-enter hover:text-accent"
                >
                  <span className="text-[9px] uppercase tracking-[0.22em] text-ink-3">LinkedIn</span>
                  <span className="underline decoration-1 underline-offset-4">in/pranithjain</span>
                </a>
              </li>
              <li>
                <a
                  href={personalInfo.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-baseline gap-2 text-ink-2 transition-colors duration-enter hover:text-accent"
                >
                  <span className="text-[9px] uppercase tracking-[0.22em] text-ink-3">GitHub</span>
                  <span className="underline decoration-1 underline-offset-4">@Pranith-Jain</span>
                </a>
              </li>
              <li>
                <a
                  href={personalInfo.calendlyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-baseline gap-2 text-ink-2 transition-colors duration-enter hover:text-accent"
                >
                  <span className="text-[9px] uppercase tracking-[0.22em] text-ink-3">Calls</span>
                  <span className="underline decoration-1 underline-offset-4">calendly · 30m</span>
                </a>
              </li>
            </ul>

            {/* Visitor count */}
            <div
              className="mt-6 inline-flex items-center gap-2 border border-rule px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3"
              aria-live="polite"
              aria-atomic="true"
            >
              <Eye className="h-3 w-3" aria-hidden="true" />
              Visitors&nbsp;·&nbsp;
              <span className="text-ink-2">{formatViewCount(count)}</span>
              {isNewSession && <span className="sr-only"> (new session)</span>}
            </div>
          </section>
        </div>

        {/* Bottom rule + copyright */}
        <div className="mt-14 border-t border-rule pt-6 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-3">
          © {currentYear} {personalInfo.name} · All rights reserved
        </div>
      </div>
    </footer>
  );
}
