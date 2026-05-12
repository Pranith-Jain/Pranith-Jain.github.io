import { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-14 sm:px-6">{children}</div>
    </div>
  );
}
