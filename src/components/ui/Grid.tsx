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

const COLS: Record<GridCols, string> = {
  '1': 'grid-cols-1',
  '2': 'grid-cols-2',
  '3': 'grid-cols-3',
  '4': 'grid-cols-4',
  '5': 'grid-cols-5',
  '6': 'grid-cols-6',
  auto: 'grid-cols-[repeat(auto-fill,minmax(200px,1fr))]',
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
    sm ? `sm:${COLS[sm]}` : '',
    md ? `md:${COLS[md]}` : '',
    lg ? `lg:${COLS[lg]}` : '',
    GAP[gap],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <Tag className={classes}>{children}</Tag>;
}
