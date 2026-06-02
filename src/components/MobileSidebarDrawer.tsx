import { Drawer } from './ui/Drawer';
import { SidebarContent } from './Sidebar';
import type { SidebarConfig } from '../data/sidebar-nav';

interface MobileSidebarDrawerProps {
  open: boolean;
  onClose: () => void;
  config: SidebarConfig;
}

/**
 * Mobile-only navigation drawer for /dfir and /threatintel. The desktop
 * sidebar is `hidden md:flex` (a sticky left rail). Below the md
 * breakpoint, that rail collapses and a hamburger button in the TopBar
 * opens THIS drawer instead, so mobile users still get the full
 * grouped-category navigation.
 *
 * Renders the same `SidebarContent` as the desktop sidebar — no
 * duplication, single source of truth for the nav. The Drawer handles
 * the Esc-to-close, body-scroll-lock, and focus-trap plumbing.
 */
export function MobileSidebarDrawer({ open, onClose, config }: MobileSidebarDrawerProps): JSX.Element {
  // The AppShell closes this on every route change by flipping `open` to
  // false; the Drawer owns body-scroll lock and focus management.
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`${config.sectionLabel} navigation`}
      side="left"
      size="sm"
      className="md:hidden"
    >
      <div id="mobile-sidebar-drawer" className="flex flex-col h-full bg-white dark:bg-slate-950">
        <SidebarContent config={config} />
      </div>
    </Drawer>
  );
}
