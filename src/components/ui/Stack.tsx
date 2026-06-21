import type { ReactNode } from 'react';

export type StackDirection = 'vertical' | 'horizontal';
export type StackSpacing = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type StackAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';

export interface StackProps {
  children: ReactNode;
  direction?: StackDirection;
  spacing?: StackSpacing;
  align?: StackAlign;
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

// Literal class lookup. `items-${align}` (template literal) was a
// Tailwind JIT trap — the scanner only sees strings written verbatim
// in source, so the responsive/align variants could silently fall
// out of the build. Mapping each option to its literal class makes
// the contract explicit and lets the build catch typos.
const ALIGN: Record<StackAlign, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
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
      className={`flex ${dir} ${SPACING[spacing]} ${align ? ALIGN[align] : ''} ${wrap ? 'flex-wrap' : ''} ${className}`.trim()}
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
