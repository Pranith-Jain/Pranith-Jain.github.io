import { useState, useEffect } from 'react';

/**
 * Debounce a value by `delay` milliseconds.
 *
 * Returns the debounced value that only updates after the specified delay
 * has passed since the last change. Useful for search inputs to prevent
 * excessive re-renders and API calls during fast typing.
 *
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default: 150ms)
 * @returns The debounced value
 *
 * @example
 * const [query, setQuery] = useState('');
 * const debouncedQuery = useDebounce(query, 150);
 * // debouncedQuery only updates 150ms after the user stops typing
 */
export function useDebounce<T>(value: T, delay: number = 150): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
