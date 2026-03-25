import { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen relative" style={{ zIndex: 2 }}>
      {/* Decorative Background Blobs */}
      <div className="pointer-events-none absolute left-0 top-0 -z-10 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/10 blur-[120px] dark:bg-brand-500/5"></div>
      <div className="pointer-events-none absolute right-0 top-1/4 -z-10 h-[400px] w-[400px] translate-x-1/2 rounded-full bg-brand-600/10 blur-[100px] dark:bg-brand-600/5"></div>

      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-14 sm:px-6">
        {children}
      </div>
    </div>
  );
}
