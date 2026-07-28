// Countries with lat/lng (for the globe) and nation-state attribution bucket.
// Only nations that have attributed APT activity are included.

import type { Country } from '../types';

export const NATION_PALETTE: Record<string, { name: string; color: string }> = {
  RU: { name: 'Russia',      color: '#e35d6a' },
  CN: { name: 'China',       color: '#e2b15c' },
  KP: { name: 'North Korea', color: '#a18bf5' },
  IR: { name: 'Iran',        color: '#5dc28a' },
  IN: { name: 'India',       color: '#f59a3c' },
  PK: { name: 'Pakistan',    color: '#7c8df0' },
  IL: { name: 'Israel',      color: '#4ec9d4' },
  TR: { name: 'Türkiye',     color: '#e0a3c8' },
  SA: { name: 'Saudi Arabia',color: '#b6cf6a' },
  AE: { name: 'UAE',         color: '#d2c39a' },
  EG: { name: 'Egypt',       color: '#cf9a5e' },
  SY: { name: 'Syria',       color: '#b96c8d' },
  LB: { name: 'Lebanon',     color: '#9ec0a3' },
  YE: { name: 'Yemen',       color: '#8aa888' },
  VN: { name: 'Vietnam',     color: '#e88a4f' },
  MM: { name: 'Myanmar',     color: '#a89060' },
  UZ: { name: 'Uzbekistan',  color: '#7a8aa8' },
  BY: { name: 'Belarus',     color: '#b08c6c' },
  KZ: { name: 'Kazakhstan',  color: '#7bbfa1' },
  GB: { name: 'United Kingdom', color: '#7d9cf0' },
  US: { name: 'United States', color: '#6b8ce0' },
  KR: { name: 'South Korea', color: '#e88a4f' },
  // unattributed / criminal
  XX: { name: 'Unattributed',  color: '#7a8294' },
  CR: { name: 'Criminal',      color: '#c97e62' },
  Unknown: { name: 'Unknown',  color: '#7a8294' },
};

export const COUNTRIES: Country[] = [
  { code: 'RU', name: 'Russia',         region: 'EU', lat: 61.524, lng: 105.319, nation: 'RU' },
  { code: 'CN', name: 'China',          region: 'EA', lat: 35.861, lng: 104.195, nation: 'CN' },
  { code: 'KP', name: 'North Korea',    region: 'EA', lat: 40.339, lng: 127.510, nation: 'KP' },
  { code: 'IR', name: 'Iran',           region: 'ME', lat: 32.428, lng: 53.688,  nation: 'IR' },
  { code: 'IN', name: 'India',          region: 'SA', lat: 20.594, lng: 78.963,  nation: 'IN' },
  { code: 'PK', name: 'Pakistan',       region: 'SA', lat: 30.375, lng: 69.345,  nation: 'PK' },
  { code: 'IL', name: 'Israel',         region: 'ME', lat: 31.046, lng: 34.852,  nation: 'IL' },
  { code: 'TR', name: 'Türkiye',        region: 'EU', lat: 38.964, lng: 35.243,  nation: 'TR' },
  { code: 'SA', name: 'Saudi Arabia',   region: 'ME', lat: 23.886, lng: 45.079,  nation: 'SA' },
  { code: 'AE', name: 'United Arab Emirates', region: 'ME', lat: 23.424, lng: 53.848, nation: 'AE' },
  { code: 'EG', name: 'Egypt',          region: 'AF', lat: 26.820, lng: 30.802,  nation: 'EG' },
  { code: 'SY', name: 'Syria',          region: 'ME', lat: 34.802, lng: 38.997,  nation: 'SY' },
  { code: 'LB', name: 'Lebanon',        region: 'ME', lat: 33.854, lng: 35.862,  nation: 'LB' },
  { code: 'YE', name: 'Yemen',          region: 'ME', lat: 15.553, lng: 48.516,  nation: 'YE' },
  { code: 'VN', name: 'Vietnam',        region: 'EA', lat: 14.058, lng: 108.277, nation: 'VN' },
  { code: 'MM', name: 'Myanmar',        region: 'EA', lat: 21.916, lng: 95.956,  nation: 'MM' },
  { code: 'UZ', name: 'Uzbekistan',     region: 'SA', lat: 41.377, lng: 64.585,  nation: 'UZ' },
  { code: 'BY', name: 'Belarus',        region: 'EU', lat: 53.710, lng: 27.953,  nation: 'BY' },
  { code: 'KZ', name: 'Kazakhstan',     region: 'SA', lat: 48.020, lng: 66.924,  nation: 'KZ' },
  { code: 'GB', name: 'United Kingdom', region: 'EU', lat: 55.378, lng:  -3.436, nation: 'GB' },
  { code: 'US', name: 'United States',  region: 'NA', lat: 37.090, lng: -95.713, nation: 'US' },
  { code: 'KR', name: 'South Korea',    region: 'EA', lat: 35.908, lng: 127.767, nation: 'KR' },
];

export function getCountry(code: string): Country | undefined {
  return COUNTRIES.find(c => c.code === code);
}

export function getNation(code: string) {
  return NATION_PALETTE[code] ?? NATION_PALETTE.XX;
}
