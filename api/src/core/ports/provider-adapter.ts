import type { Indicator, ProviderResult } from '../entities';

export interface IProviderAdapter {
  readonly id: string;
  readonly supportedTypes: string[];
  check(indicator: Indicator, env: Record<string, string | undefined>): Promise<ProviderResult>;
}
