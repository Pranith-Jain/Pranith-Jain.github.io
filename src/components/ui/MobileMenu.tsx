import { navLinks } from '../../data/content';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  if (!isOpen) return null;

  const handleLinkClick = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/20 backdrop-blur-sm dark:bg-slate-950/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Menu */}
      <div className="absolute top-[72px] left-0 right-0 border-t border-slate-200/60 bg-white/95 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95">
        <nav className="flex flex-col p-4 space-y-2">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={handleLinkClick}
              className="rounded-lg px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
