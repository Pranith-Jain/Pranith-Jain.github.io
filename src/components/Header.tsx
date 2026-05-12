import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown } from 'lucide-react';
import { ThemeToggle } from './ui/ThemeToggle';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { navLinks } from '../data/content';
import { preloadRoute } from '../lib/route-preloaders';

interface HeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
}

export function Header({ isDark, onToggleTheme }: HeaderProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();

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
      <header className="sticky top-0 z-50 border-b border-rule bg-surface-page" role="banner">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6 sm:py-3">
          {/* Masthead — editorial wordmark */}
          <Link
            to="/"
            className="font-serif text-lg font-medium tracking-tight text-ink-1"
            aria-label="Pranith Jain — back to home"
          >
            Pranith Jain
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-1 md:flex" role="navigation" aria-label="Main navigation">
            {navLinks
              .filter((link) => link.label !== 'Home')
              .map((link) => (
                <div
                  key={link.href}
                  className="relative"
                  ref={(el) => {
                    if (el) dropdownRefs.current.set(link.href, el);
                  }}
                >
                  {'children' in link && link.children ? (
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
                        className={`inline-flex items-center gap-1 py-1.5 text-sm font-medium tracking-tight transition-colors duration-enter ${
                          isActive(link.href)
                            ? 'text-ink-1 underline decoration-accent decoration-2 underline-offset-8'
                            : 'text-ink-2 hover:text-ink-1 hover:underline hover:decoration-accent hover:decoration-2 hover:underline-offset-8'
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
                          className="absolute left-0 top-full mt-2 min-w-[220px] border border-rule bg-surface-raised py-2"
                          onMouseLeave={() => setOpenDropdown(null)}
                        >
                          {link.children.map((child) => (
                            <Link
                              key={child.href}
                              to={child.href}
                              className="block px-4 py-2 text-sm text-ink-2 transition-colors duration-enter hover:bg-accent-soft hover:text-ink-1 focus:bg-accent-soft focus:text-ink-1"
                              onClick={() => setOpenDropdown(null)}
                              onMouseEnter={() => preloadRoute(child.href)}
                              onFocus={() => preloadRoute(child.href)}
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
                      onMouseEnter={() => preloadRoute(link.href)}
                      onFocus={() => preloadRoute(link.href)}
                      className={`inline-flex items-center py-1.5 text-sm font-medium tracking-tight transition-colors duration-enter ${
                        isActive(link.href)
                          ? 'text-ink-1 underline decoration-accent decoration-2 underline-offset-8'
                          : 'text-ink-2 hover:text-ink-1 hover:underline hover:decoration-accent hover:decoration-2 hover:underline-offset-8'
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
              className="grid h-10 w-10 place-items-center border border-rule text-ink-1 transition-colors duration-enter hover:border-ink-1 md:hidden"
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
          <div className="absolute inset-0 bg-ink-1/40" onClick={closeMobileMenu} aria-hidden="true" />

          {/* Menu */}
          <nav
            className="absolute top-[64px] left-0 right-0 border-t border-rule bg-surface-page max-h-[calc(100vh-64px)] overflow-y-auto"
            role="navigation"
            aria-label="Mobile navigation"
          >
            <div className="flex flex-col p-4 space-y-1">
              {navLinks.map((link) => (
                <div key={link.href}>
                  <Link
                    to={link.href}
                    onClick={closeMobileMenu}
                    className={`block px-4 py-3 text-sm font-medium ${
                      isActive(link.href)
                        ? 'text-ink-1 underline decoration-accent decoration-2 underline-offset-8'
                        : 'text-ink-2 hover:text-ink-1'
                    }`}
                  >
                    {link.label}
                  </Link>
                  {'children' in link && link.children && (
                    <div className="ml-4 mt-1 space-y-1">
                      {link.children.map((child) => (
                        <Link
                          key={child.href}
                          to={child.href}
                          onClick={closeMobileMenu}
                          className="block px-4 py-2 text-xs text-ink-3 hover:text-ink-1"
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
