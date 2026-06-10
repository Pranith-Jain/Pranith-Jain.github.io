import { describe, it, expect } from 'vitest';
import { resolveSeedLabel } from '../../src/lib/address-labels';

describe('resolveSeedLabel', () => {
  it('matches a known EVM address case-insensitively', () => {
    const r = resolveSeedLabel('0x28C6c06298d514Db089934071355E5743Bf21d60', 'evm');
    expect(r).not.toBeNull();
    expect(r!.category).toBe('exchange');
    expect(r!.label).toBe('Binance 14');
    expect(r!.source).toBe('curated');
  });

  it('matches a mixer', () => {
    const r = resolveSeedLabel('0x722122dF12D4e14e13Ac3b6895a86e84145b6967', 'evm');
    expect(r!.category).toBe('mixer');
  });

  it('returns null for an unknown address', () => {
    expect(resolveSeedLabel('0x0000000000000000000000000000000000000001', 'evm')).toBeNull();
  });
});
