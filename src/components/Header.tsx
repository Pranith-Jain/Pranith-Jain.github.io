import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown } from 'lucide-react';
import { ThemeToggle } from './ui/ThemeToggle';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface NavItem {
  label: string;
  href: string;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  { label: 'About', href: '/about' },
  { label: 'Skills', href: '/skills' },
  { label: 'Experience', href: '/experience' },
  { label: 'Projects', href: '/projects' },
  { label: 'DFIR Tools', href: '/dfir' },
];

interface HeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
}

export function Header({ isDark, onToggleTheme }: HeaderProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();

  // Track scroll position for header styling
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

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

  // Handle mobile menu close and return focus to button
  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
    setTimeout(() => {
      mobileMenuButtonRef.current?.focus();
    }, 0);
  }, []);

  // Handle escape key for mobile menu and dropdowns
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isMobileMenuOpen) {
          closeMobileMenu();
        } else if (openDropdown) {
          setOpenDropdown(null);
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isMobileMenuOpen, openDropdown, closeMobileMenu]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  // Focus trap for mobile menu
  const mobileMenuRef = useFocusTrap({
    isActive: isMobileMenuOpen,
    onEscape: closeMobileMenu,
  });

  // Toggle dropdown with keyboard support
  const toggleDropdown = useCallback((href: string) => {
    setOpenDropdown((prev) => (prev === href ? null : href));
  }, []);

  const isActive = (href: string) => location.pathname === href;

  return (
    <>
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'border-b border-slate-200/60 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/80'
            : 'border-b border-transparent bg-white/65 backdrop-blur-xl dark:bg-slate-950/60'
        }`}
        role="banner"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          {/* Logo */}
          <Link
            to="/"
            className="group inline-flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 rounded-lg"
            aria-label="Pranith Jain Portfolio - Back to home"
          >
            <span className="h-9 w-9 rounded-xl shadow-glow flex items-center justify-center overflow-hidden">
              <svg viewBox="0 0 36 36" className="h-full w-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-1 md:flex" role="navigation" aria-label="Main navigation">
            {navItems.map((link) => (
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
                      onClick={() => toggleDropdown(link.href)}
                      onMouseEnter={() => setOpenDropdown(link.href)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleDropdown(link.href);
                        }
                      }}
                      className={`flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                        isActive(link.href)
                          ? 'text-brand-600 dark:text-brand-400 bg-brand-500/10'
                          : 'text-slate-700 hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white'
                      }`}
                      aria-expanded={openDropdown === link.href}
                      aria-haspopup="true"
                      aria-controls={`dropdown-${link.href.replace('/', '')}`}
                    >
                      {link.label}
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${openDropdown === link.href ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                      />
                    </button>
                    {openDropdown === link.href && (
                      <div
                        id={`dropdown-${link.href.replace('/', '')}`}
                        className="absolute left-0 top-full mt-1 min-w-[200px] rounded-xl border border-slate-200/60 bg-white/95 py-2 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95"
                        onMouseLeave={() => setOpenDropdown(null)}
                      >
                        {link.children.map((child) => (
                          <Link
                            key={child.href}
                            to={child.href}
                            className="block px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10 focus:outline-none focus:bg-slate-100 dark:focus:bg-white/10"
                            onClick={() => setOpenDropdown(null)}
                            role="menuitem"
                          >
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <Link
                    to={link.href}
                    className={`rounded-full px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                      isActive(link.href)
                        ? 'text-brand-600 dark:text-brand-400 bg-brand-500/10'
                        : 'text-slate-700 hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white'
                    }`}
                  >
                    {link.label}
                  </Link>
                )}
              </div>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />

            <button
              ref={mobileMenuButtonRef}
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="grid h-10 w-10 place-items-center rounded-full border border-slate-200/60 bg-white/70 text-slate-700 shadow-sm transition hover:shadow-md dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 md:hidden focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
              aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
            >
              {isMobileMenuOpen ? (
                <X className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          id="mobile-menu"
          ref={mobileMenuRef as React.RefObject<HTMLDivElement>}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-950/20 backdrop-blur-sm dark:bg-slate-950/40"
            onClick={closeMobileMenu}
            aria-hidden="true"
          />

          {/* Menu */}
          <nav
            className="absolute top-[72px] left-0 right-0 border-t border-slate-200/60 bg-white/95 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95 max-h-[calc(100vh-80px)] overflow-y-auto"
            role="navigation"
            aria-label="Mobile navigation"
          >
            <div className="flex flex-col p-4 space-y-1">
              <Link
                to="/"
                onClick={closeMobileMenu}
                className={`rounded-lg px-4 py-3 text-sm font-medium block focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                  isActive('/')
                    ? 'text-brand-600 dark:text-brand-400 bg-brand-500/10'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10'
                }`}
              >
                Home
              </Link>
              {navItems.map((link) => (
                <div key={link.href}>
                  <Link
                    to={link.href}
                    onClick={closeMobileMenu}
                    className={`rounded-lg px-4 py-3 text-sm font-medium block focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                      isActive(link.href)
                        ? 'text-brand-600 dark:text-brand-400 bg-brand-500/10'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10'
                    }`}
                  >
                    {link.label}
                  </Link>
                  {link.children && (
                    <div className="ml-4 mt-1 space-y-1">
                      {link.children.map((child) => (
                        <Link
                          key={child.href}
                          to={child.href}
                          onClick={closeMobileMenu}
                          className="block rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
