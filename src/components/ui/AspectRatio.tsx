import type { ReactNode } from 'react';

export interface AspectRatioProps {
  ratio?: number;
  children: ReactNode;
  className?: string;
  as?: 'div' | 'figure';
}

export function AspectRatio({ ratio = 16 / 9, children, className = '', as: Tag = 'div' }: AspectRatioProps) {
  return (
    <Tag className={`relative w-full ${className}`} style={{ aspectRatio: `${ratio}` }}>
      {children}
    </Tag>
  );
}
