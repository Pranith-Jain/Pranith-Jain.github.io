import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';

export interface TableProps {
  children: ReactNode;
  className?: string;
}

export function Table({ children, className = '' }: TableProps) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-sm ${className}`}>{children}</table>
    </div>
  );
}

export function Thead({ children, className = '' }: TableProps) {
  return (
    <thead
      className={`border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500 dark:border-[rgb(var(--border-400))] ${className}`}
    >
      {children}
    </thead>
  );
}

export function Th({
  children,
  className = '',
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <th scope="col" className={`py-2 pr-4 font-medium ${className}`} {...props}>
      {children}
    </th>
  );
}

export function Tbody({ children, className = '' }: TableProps) {
  return <tbody className={className}>{children}</tbody>;
}

export function Tr({ children, className = '', ...props }: TableProps & { onClick?: () => void }) {
  return (
    <tr
      className={`border-b border-slate-100 align-top transition-colors last:border-0 dark:border-[rgb(var(--border-400))] ${className}`}
      {...props}
    >
      {children}
    </tr>
  );
}

export function Td({
  children,
  className = '',
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <td className={`py-2 pr-4 ${className}`} {...props}>
      {children}
    </td>
  );
}
