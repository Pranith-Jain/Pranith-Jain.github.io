import { describe, it, expect } from 'vitest';
import { djb2, fingerprintHash } from './privacy-checks';

describe('djb2', () => {
  it('produces the same hash for identical input', () => {
    expect(djb2('abc')).toBe(djb2('abc'));
  });
  it('produces different hashes for different inputs', () => {
    expect(djb2('abc')).not.toBe(djb2('abd'));
  });
});

describe('fingerprintHash', () => {
  it('is deterministic for same inputs', () => {
    const fp = {
      userAgent: 'Mozilla/5.0',
      platform: 'MacIntel',
      language: 'en-US',
      languages: [],
      timezone: 'UTC',
      cookieEnabled: true,
      doNotTrack: null,
      hardwareConcurrency: 8,
      deviceMemory: 8,
      screenResolution: '2560x1440',
      colorDepth: 30,
      pixelRatio: 2,
      vendor: 'Google Inc.',
      canvasHash: 'aabbcc',
    };
    expect(fingerprintHash(fp)).toBe(fingerprintHash(fp));
  });
});
