import { useState, useRef, useId, useCallback, type ReactNode } from 'react';
import { Upload } from 'lucide-react';

export interface FileDropZoneProps {
  onFile: (file: File) => void;
  accept?: string;
  label?: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
  icon?: ReactNode;
}

export function FileDropZone({
  onFile,
  accept,
  label,
  hint,
  disabled = false,
  className = '',
  icon,
}: FileDropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const handleFile = useCallback(
    (file: File) => {
      if (!disabled) onFile(file);
    },
    [onFile, disabled]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label || 'Upload file'}
      aria-disabled={disabled || undefined}
      onDragOver={(e) => {
        if (!disabled) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (disabled || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault(); // Space on a role=button must not scroll the page
        inputRef.current?.click();
      }}
      className={[
        'rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
        disabled ? 'opacity-50 cursor-not-allowed' : '',
        dragging
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/10'
          : 'border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-400 dark:hover:border-brand-600',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <input
        ref={inputRef}
        id={`file-input-${id}`}
        type="file"
        accept={accept}
        className="hidden"
        onChange={onChange}
        tabIndex={-1}
        aria-hidden="true"
      />
      <div className={`mb-3 transition-colors ${dragging ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'}`}>
        {icon || <Upload className="mx-auto h-8 w-8" aria-hidden="true" />}
      </div>
      {label && (
        <p className="font-mono text-sm text-slate-600 dark:text-slate-400">
          {label} <span className="text-brand-600 dark:text-brand-400 hover:underline">click to browse</span>
        </p>
      )}
      {hint && <p className="mt-1 text-xs font-mono text-slate-500">{hint}</p>}
    </div>
  );
}
