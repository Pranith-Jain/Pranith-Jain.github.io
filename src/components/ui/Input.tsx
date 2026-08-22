import { forwardRef } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';

/**
 * Shared input styling — the canonical "tool input" look used across DFIR/threat-intel
 * pages. Replaces the hand-rolled `w-full px-4 py-3 bg-white dark:bg-[...] border
 * border-slate-200 ... rounded-xl font-mono ... focus:border-brand-500` className
 * repeated in 50+ pages.
 *
 *   <Input value={ioc} onChange={...} placeholder="1.2.3.4" />
 *   <Textarea rows={5} value={bulk} onChange={...} />
 *   <Select value={mode} onChange={...}>...</Select>
 *
 * All accept standard HTML attributes (type, value, onChange, placeholder, etc.)
 * and forward refs. The `mono` prop toggles the monospace font (default: true for
 * tool inputs; pass mono={false} for prose-style inputs).
 */

const BASE_INPUT =
  'w-full px-4 py-3 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl text-tool text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400 transition-colors';

const MONO = 'font-mono';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Use monospace font (default: true for tool inputs). */
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { mono = true, className = '', ...props },
  ref
) {
  return <input ref={ref} className={`${BASE_INPUT} ${mono ? MONO : ''} ${className}`} {...props} />;
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  mono?: boolean;
}

export function Textarea({ mono = true, className = '', ...props }: TextareaProps) {
  return <textarea className={`${BASE_INPUT} ${mono ? MONO : ''} ${className}`} {...props} />;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  mono?: boolean;
}

export function Select({ mono = true, className = '', children, ...props }: SelectProps) {
  return (
    <select className={`${BASE_INPUT} ${mono ? MONO : ''} ${className}`} {...props}>
      {children}
    </select>
  );
}

/**
 * Field wrapper — label + input + optional hint/error. Use for forms that
 * need consistent label/input spacing and error display.
 *
 *   <Field label="IOC" hint="IP, domain, URL, or hash">
 *     <Input value={ioc} onChange={...} />
 *   </Field>
 */
export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, error, htmlFor, children, className = '' }: FieldProps) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-eyebrow font-mono uppercase tracking-[0.12em] text-muted mb-1.5">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-mini text-muted">{hint}</p>}
      {error && (
        <p className="mt-1.5 text-mini text-rose-600 dark:text-rose-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
