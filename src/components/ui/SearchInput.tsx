import { useState, useRef, useId, useCallback, type ReactNode, type KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';

export interface Suggestion {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
}

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  suggestions?: Suggestion[];
  onSelect?: (suggestion: Suggestion) => void;
  onClear?: () => void;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  maxResults?: number;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  suggestions,
  onSelect,
  onClear,
  loading = false,
  disabled = false,
  className = '',
  inputClassName = '',
  maxResults = 10,
}: SearchInputProps) {
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();
  const listId = `${id}-results`;

  const showSuggestions = focused && suggestions && suggestions.length > 0 && value.length > 0;
  const visible = suggestions ? suggestions.slice(0, maxResults) : [];

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      const vis = suggestions ? suggestions.slice(0, maxResults) : [];
      if (!showSuggestions || vis.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((prev) => (prev < vis.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((prev) => (prev > 0 ? prev - 1 : vis.length - 1));
      } else if (e.key === 'Enter' && activeIdx >= 0) {
        e.preventDefault();
        onSelect?.(vis[activeIdx]);
        setActiveIdx(-1);
      } else if (e.key === 'Escape') {
        setActiveIdx(-1);
        inputRef.current?.blur();
      }
    },
    [showSuggestions, suggestions, maxResults, activeIdx, onSelect]
  );

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setActiveIdx(-1);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          role="combobox"
          aria-expanded={showSuggestions}
          aria-controls={listId}
          aria-activedescendant={activeIdx >= 0 ? `${id}-item-${activeIdx}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          className={[
            'w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 font-mono text-sm text-slate-900 transition-colors placeholder:text-slate-400',
            'focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20',
            'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            inputClassName,
          ].join(' ')}
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              onClear?.();
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
            aria-label="Clear search"
          >
            {loading ? (
              <span
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600"
                aria-hidden="true"
              />
            ) : (
              <X className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      {showSuggestions && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {visible.map((s, i) => (
            <li
              key={s.id}
              id={`${id}-item-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect?.(s);
              }}
              onMouseEnter={() => setActiveIdx(i)}
              className={[
                'flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors',
                i === activeIdx
                  ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300'
                  : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800',
              ].join(' ')}
            >
              {s.icon && <span aria-hidden="true">{s.icon}</span>}
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{s.label}</div>
                {s.description && (
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">{s.description}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
