import { describe, it, expect } from 'vitest';
import { safeErrorMessage } from '../../src/lib/error';

describe('safeErrorMessage', () => {
  it('returns "upstream error" in production (no dev flag)', () => {
    const env = {};
    expect(safeErrorMessage(env, new Error('boom: api key sk-1234 leaked'))).toBe('upstream error');
  });

  it('returns the raw error.message when DFIR_DEV_ERRORS=1', () => {
    const env = { DFIR_DEV_ERRORS: '1' };
    expect(safeErrorMessage(env, new Error('boom: api key sk-1234 leaked'))).toBe('boom: api key sk-1234 leaked');
  });

  it('returns "upstream error" when DFIR_DEV_ERRORS is any non-"1" string', () => {
    const env = { DFIR_DEV_ERRORS: 'true' };
    expect(safeErrorMessage(env, new Error('boom'))).toBe('upstream error');
  });

  it('returns "upstream error" when DFIR_DEV_ERRORS is undefined', () => {
    expect(safeErrorMessage({ DFIR_DEV_ERRORS: undefined }, new Error('boom'))).toBe('upstream error');
  });

  it('handles non-Error throws by String()-ifying them in dev mode', () => {
    const env = { DFIR_DEV_ERRORS: '1' };
    expect(safeErrorMessage(env, 'string error')).toBe('string error');
    expect(safeErrorMessage(env, { code: 502 })).toBe('[object Object]');
    expect(safeErrorMessage(env, null)).toBe('null');
  });

  it('still scrubs to "upstream error" in prod for non-Error throws', () => {
    expect(safeErrorMessage({}, 'string error')).toBe('upstream error');
    expect(safeErrorMessage({}, { code: 502 })).toBe('upstream error');
  });
});
