export type IndicatorType = 'ipv4' | 'ipv6' | 'domain' | 'url' | 'hash' | 'email' | 'unknown';

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_RE = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
const HASH_RE = /^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$/;
const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function refang(input: string): string {
  return input
    .replace(/hxxps?:\/\//gi, (m) => m.replace(/hxxp/i, 'http'))
    .replace(/\[\.\]/g, '.')
    .replace(/\[:\]/g, ':')
    .replace(/\[at\]/gi, '@');
}

export function defang(input: string): string {
  return input.replace(/^https?:\/\//i, (m) => m.replace(/http/i, 'hxxp')).replace(/(?<!\[)\.(?!\])/g, '[.]');
}

export function detectType(rawInput: string): IndicatorType {
  const input = refang(rawInput.trim());
  if (!input) return 'unknown';
  if (URL_RE.test(input)) return 'url';
  if (EMAIL_RE.test(input)) return 'email';
  if (IPV4_RE.test(input)) {
    const parts = input.split('.').map(Number);
    if (parts.every((p) => p >= 0 && p <= 255)) return 'ipv4';
  }
  if (IPV6_RE.test(input) && input.includes(':')) return 'ipv6';
  if (HASH_RE.test(input)) return 'hash';
  if (DOMAIN_RE.test(input)) return 'domain';
  return 'unknown';
}
