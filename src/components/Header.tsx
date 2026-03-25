import { useState, useEffect, useRef } from 'react';
import { Menu, X, ChevronDown } from 'lucide-react';
import { ThemeToggle } from './ui/ThemeToggle';
import { navLinks } from '../data/content';

interface NavLink {
  label: string;
  href: string;
  children?: NavLink[];
}

interface HeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
}

export function Header({ isDark, onToggleTheme }: HeaderProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (openDropdown) {
        const dropdownEl = dropdownRefs.current.get(openDropdown);
        if (dropdownEl && !dropdownEl.contains(e.target as Node)) {
          setOpenDropdown(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdown]);

  // Close mobile menu on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileMenuOpen(false);
        setOpenDropdown(null);
      }
    };

    if (isMobileMenuOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  return (
    <>
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'border-b border-slate-200/60 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/80'
            : 'border-b border-transparent bg-white/65 backdrop-blur-xl dark:bg-slate-950/60'
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          {/* Logo */}
          <a href="#top" className="group inline-flex items-center gap-3">
            <span className="h-9 w-9 rounded-xl shadow-glow flex items-center justify-center overflow-hidden">
              <svg viewBox="0 0 36 36" className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="pjGradientHeader" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#2c3ee5" />
                    <stop offset="100%" stopColor="#435ef1" />
                  </linearGradient>
                </defs>
                <rect width="36" height="36" rx="8" fill="url(#pjGradientHeader)" />
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
            <span className="hidden text-sm font-semibold tracking-tight sm:inline text-slate-900 dark:text-white">
              Pranith Jain<span className="text-slate-600 dark:text-slate-300"> • Portfolio</span>
            </span>
          </a>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-1 md:flex">
            {(navLinks as NavLink[]).map((link) => (
              <div
                key={link.href}
                className="relative"
                ref={(el) => {
                  if (el) dropdownRefs.current.set(link.href, el);
                }}
              >
                {link.children ? (
                  <>
                    <button
                      onClick={() => setOpenDropdown(openDropdown === link.href ? null : link.href)}
                      onMouseEnter={() => setOpenDropdown(link.href)}
                      className="flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white"
                      aria-expanded={openDropdown === link.href}
                      aria-haspopup="true"
                    >
                      {link.label}
                      <ChevronDown className={`h-4 w-4 transition-transform ${openDropdown === link.href ? 'rotate-180' : ''}`} />
                    </button>
                    {openDropdown === link.href && (
                      <div
                        className="absolute left-0 top-full mt-1 min-w-[200px] rounded-xl border border-slate-200/60 bg-white/95 py-2 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95"
                        onMouseLeave={() => setOpenDropdown(null)}
                      >
                        {link.children.map((child) => (
                          <a
                            key={child.href}
                            href={child.href}
                            className="block px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
                            onClick={() => setOpenDropdown(null)}
                          >
                            {child.label}
                          </a>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <a
                    href={link.href}
                    className="rounded-full px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    {link.label}
                  </a>
                )}
              </div>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />

            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="grid h-10 w-10 place-items-center rounded-full border border-slate-200/60 bg-white/70 text-slate-700 shadow-sm transition hover:shadow-md dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 md:hidden"
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-950/20 backdrop-blur-sm dark:bg-slate-950/40"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Menu */}
          <div className="absolute top-[72px] left-0 right-0 border-t border-slate-200/60 bg-white/95 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95">
            <nav className="flex flex-col p-4 space-y-1">
              {(navLinks as NavLink[]).map((link) => (
                <div key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => {
                      if (!link.children) {
                        setIsMobileMenuOpen(false);
                      }
                    }}
                    className="rounded-lg px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10 block"
                  >
                    {link.label}
                  </a>
                  {link.children && (
                    <div className="ml-4 mt-1 space-y-1">
                      {link.children.map((child) => (
                        <a
                          key={child.href}
                          href={child.href}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className="block rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
                        >
                          → {child.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
