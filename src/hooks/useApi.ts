import { useDataFetch, type UseDataFetchOptions, type UseDataFetchResult } from './useDataFetch';

export function useApi<T = unknown>(
  url: string | null,
  opts?: Omit<UseDataFetchOptions<T>, 'url'>
): UseDataFetchResult<T> {
  return useDataFetch<T>({ url, ...opts });
}

export { useDataFetch } from './useDataFetch';
export type { UseDataFetchOptions, UseDataFetchResult } from './useDataFetch';
