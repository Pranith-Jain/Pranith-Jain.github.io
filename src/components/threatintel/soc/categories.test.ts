import { describe, it, expect } from 'vitest';
import { normalizeSector, normalizeCountry, normalizeVendor, normalizeSeverity } from './categories';

describe('normalizeSector', () => {
  it('maps spanish/foreign sector names to canonical english', () => {
    expect(normalizeSector('Salud')).toBe('Healthcare');
    expect(normalizeSector('SERVICIOS')).toBe('Professional Services');
    expect(normalizeSector('Construcción')).toBe('Construction');
    expect(normalizeSector('Educación')).toBe('Education');
    expect(normalizeSector('Financiero')).toBe('Finance');
  });
  it('passes through canonical english unchanged', () => {
    expect(normalizeSector('Healthcare')).toBe('Healthcare');
    expect(normalizeSector('finance')).toBe('Finance');
  });
  it('buckets empty/garbage/otros to Unknown', () => {
    expect(normalizeSector('')).toBe('Unknown');
    expect(normalizeSector('Otros')).toBe('Unknown');
    expect(normalizeSector('   ')).toBe('Unknown');
  });
});

describe('normalizeCountry', () => {
  it('maps spanish country names + codes to english', () => {
    expect(normalizeCountry('Estados Unidos')).toBe('United States');
    expect(normalizeCountry('Reino Unido')).toBe('United Kingdom');
    expect(normalizeCountry('Alemania')).toBe('Germany');
    expect(normalizeCountry('US')).toBe('United States');
  });
  it('buckets desconocido/empty to Unknown', () => {
    expect(normalizeCountry('Desconocido')).toBe('Unknown');
    expect(normalizeCountry('')).toBe('Unknown');
  });
});

describe('normalizeVendor', () => {
  it('rejects heuristic junk tokens', () => {
    expect(normalizeVendor('Improper')).toBe('Unknown');
    expect(normalizeVendor('Missing')).toBe('Unknown');
    expect(normalizeVendor('Unspecified')).toBe('Unknown');
    expect(normalizeVendor('Other')).toBe('Unknown');
    expect(normalizeVendor('')).toBe('Unknown');
  });
  it('canonicalizes known vendor casings', () => {
    expect(normalizeVendor('wordpress')).toBe('WordPress');
    expect(normalizeVendor('GOOGLE')).toBe('Google');
  });
  it('keeps an unknown-but-plausible vendor as-is', () => {
    expect(normalizeVendor('Acme')).toBe('Acme');
  });
});

describe('normalizeSeverity', () => {
  it('maps spanish severities to canonical tokens', () => {
    expect(normalizeSeverity('ALTO')).toBe('HIGH');
    expect(normalizeSeverity('Medio')).toBe('MEDIUM');
    expect(normalizeSeverity('crítico')).toBe('CRITICAL');
    expect(normalizeSeverity('bajo')).toBe('LOW');
  });
  it('passes english severities through', () => {
    expect(normalizeSeverity('critical')).toBe('CRITICAL');
  });
  it('buckets unknown to UNKNOWN', () => {
    expect(normalizeSeverity('weird')).toBe('UNKNOWN');
  });
});
