import type { CSSProperties, ReactNode } from 'react';

export type SkeletonVariant = 'text' | 'circular' | 'rectangular' | 'chip';

export interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({ variant = 'text', width, height, className = '', style }: SkeletonProps) {
  const base = 'animate-pulse bg-slate-200/80 dark:bg-slate-800/80';

  const styles: Record<SkeletonVariant, string> = {
    text: `${base} h-4 rounded`,
    circular: `${base} rounded-full`,
    rectangular: `${base} rounded-xl`,
    chip: `${base} rounded-full h-6`,
  };

  const defaultSize: Record<SkeletonVariant, { width: string; height: string }> = {
    text: { width: '100%', height: '' },
    circular: { width: '40px', height: '40px' },
    rectangular: { width: '100%', height: '120px' },
    chip: { width: '80px', height: '' },
  };

  const w = width ?? defaultSize[variant].width;
  const h = height ?? defaultSize[variant].height;

  return (
    <div
      className={`${styles[variant]} ${className}`}
      style={{
        width: typeof w === 'number' ? `${w}px` : w,
        height: typeof h === 'number' ? `${h}px` : h || undefined,
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

export interface SkeletonGroupProps {
  rows?: number;
  variant?: SkeletonVariant;
  widths?: (string | number)[];
  className?: string;
  children?: ReactNode;
}

export function SkeletonGroup({ rows = 3, variant = 'text', widths, className = '' }: SkeletonGroupProps) {
  return (
    <div className={`space-y-3 ${className}`} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton
          key={i}
          variant={variant}
          width={widths?.[i % widths.length]}
          style={{ animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  );
}
