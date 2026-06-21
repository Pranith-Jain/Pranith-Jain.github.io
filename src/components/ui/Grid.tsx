import type { ReactNode } from 'react';

export type GridCols = '1' | '2' | '3' | '4' | '5' | '6' | 'auto';
export type GridGap = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface GridProps {
  children: ReactNode;
  cols?: GridCols;
  sm?: GridCols;
  md?: GridCols;
  lg?: GridCols;
  gap?: GridGap;
  className?: string;
  as?: 'div' | 'ul' | 'section';
}

// Tailwind's JIT scanner only emits classes that appear as LITERAL strings
// in source. Building `sm:${COLS[sm]}` at runtime produces strings the
// scanner never sees, so the responsive rules never land in the CSS and
// pages stay single-column on tablet/desktop. Use four explicit maps so
// every variant is a string literal.

const COLS: Record<GridCols, string> = {
  '1': 'grid-cols-1',
  '2': 'grid-cols-2',
  '3': 'grid-cols-3',
  '4': 'grid-cols-4',
  '5': 'grid-cols-5',
  '6': 'grid-cols-6',
  auto: 'grid-cols-[repeat(auto-fill,minmax(200px,1fr))]',
};

const SM_COLS: Record<GridCols, string> = {
  '1': 'sm:grid-cols-1',
  '2': 'sm:grid-cols-2',
  '3': 'sm:grid-cols-3',
  '4': 'sm:grid-cols-4',
  '5': 'sm:grid-cols-5',
  '6': 'sm:grid-cols-6',
  auto: 'sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]',
};

const MD_COLS: Record<GridCols, string> = {
  '1': 'md:grid-cols-1',
  '2': 'md:grid-cols-2',
  '3': 'md:grid-cols-3',
  '4': 'md:grid-cols-4',
  '5': 'md:grid-cols-5',
  '6': 'md:grid-cols-6',
  auto: 'md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]',
};

const LG_COLS: Record<GridCols, string> = {
  '1': 'lg:grid-cols-1',
  '2': 'lg:grid-cols-2',
  '3': 'lg:grid-cols-3',
  '4': 'lg:grid-cols-4',
  '5': 'lg:grid-cols-5',
  '6': 'lg:grid-cols-6',
  auto: 'lg:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]',
};

const GAP: Record<GridGap, string> = {
  none: 'gap-0',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-3',
  lg: 'gap-4',
  xl: 'gap-6',
};

export function Grid({ children, cols = '1', sm, md, lg, gap = 'md', className = '', as: Tag = 'div' }: GridProps) {
  const classes = [
    'grid',
    COLS[cols],
    sm ? SM_COLS[sm] : '',
    md ? MD_COLS[md] : '',
    lg ? LG_COLS[lg] : '',
    GAP[gap],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <Tag className={classes}>{children}</Tag>;
}
