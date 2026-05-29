import { Loader2 } from 'lucide-react';

export type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';

export interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
  label?: string;
}

const SIZE: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
};

export function Spinner({ size = 'md', className = '', label = 'Loading…' }: SpinnerProps) {
  return (
    <div role="status" aria-live="polite" className={`inline-flex items-center gap-2 ${className}`}>
      <Loader2 className={`animate-spin text-slate-400 ${SIZE[size]}`} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function SpinnerCentered({ size = 'lg', label = 'Loading…' }: SpinnerProps) {
  return (
    <div className="flex min-h-[200px] items-center justify-center">
      <Spinner size={size} label={label} />
    </div>
  );
}
