import type { ReactNode } from 'react';

export type StackDirection = 'vertical' | 'horizontal';
export type StackSpacing = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface StackProps {
  children: ReactNode;
  direction?: StackDirection;
  spacing?: StackSpacing;
  align?: string;
  wrap?: boolean;
  className?: string;
  as?: 'div' | 'nav' | 'section' | 'ul' | 'ol';
}

const SPACING: Record<StackSpacing, string> = {
  none: '',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
};

export function Stack({
  children,
  direction = 'vertical',
  spacing = 'md',
  align,
  wrap = false,
  className = '',
  as: Tag = 'div',
}: StackProps) {
  const dir = direction === 'horizontal' ? 'flex-row' : 'flex-col';
  return (
    <Tag
      className={`flex ${dir} ${SPACING[spacing]} ${align ? `items-${align}` : ''} ${wrap ? 'flex-wrap' : ''} ${className}`}
    >
      {children}
    </Tag>
  );
}

export function HStack(props: Omit<StackProps, 'direction'>) {
  return <Stack direction="horizontal" {...props} />;
}

export function VStack(props: Omit<StackProps, 'direction'>) {
  return <Stack direction="vertical" {...props} />;
}
