export async function structuralFingerprint(html: string): Promise<string> {
  const structure = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+([^<]+\s+)?</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
  const enc = new TextEncoder().encode(structure);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex;
}

export interface FingerprintResult {
  match: boolean;
  first_seen?: string;
  count?: number;
  urls?: string[];
}

export async function submitFingerprint(hash: string, url: string): Promise<FingerprintResult> {
  const r = await fetch('/api/v1/phishing/fingerprint', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hash, url }),
  });
  return r.json() as Promise<FingerprintResult>;
}
