import type { ReactNode } from 'react';

export type ContainerWidth = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl' | 'full';

export interface PageContainerProps {
  children: ReactNode;
  as?: 'div' | 'main' | 'section' | 'article';
  width?: ContainerWidth;
  className?: string;
  padding?: boolean;
}

const WIDTH: Record<ContainerWidth, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-full',
};

export function PageContainer({
  children,
  as: Tag = 'div',
  width = '5xl',
  className = '',
  padding = true,
}: PageContainerProps) {
  const base = `${WIDTH[width]} mx-auto`;
  const spacing = padding ? 'px-4 sm:px-8 py-12' : '';
  return <Tag className={`${base} ${spacing} text-slate-900 dark:text-slate-100 ${className}`}>{children}</Tag>;
}
