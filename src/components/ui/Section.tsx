import type { ReactNode } from 'react';

export interface SectionProps {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
  id?: string;
  spacing?: 'sm' | 'md' | 'lg';
}

const SPACING: Record<string, string> = {
  sm: 'py-8',
  md: 'py-12 lg:py-16',
  lg: 'py-16 lg:py-24',
};

export function Section({ children, className = '', as: Tag = 'section', id, spacing = 'lg' }: SectionProps) {
  return (
    <Tag id={id} className={`animate-fade-in-up ${SPACING[spacing]} ${className}`}>
      {children}
    </Tag>
  );
}
