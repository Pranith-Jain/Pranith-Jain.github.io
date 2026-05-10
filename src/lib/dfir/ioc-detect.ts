/**
 * Cheap "does this blob look like it contains IOCs?" check.
 *
 * Used by sister-tool pipes (PowerShell Deobfuscator, Decoder, Phishing
 * Analyzer) to decide whether to surface the "send to IOC Extractor"
 * button. Intentionally permissive — false positives are cheap (the
 * button shows but the extractor finds nothing, no harm done), false
 * negatives are expensive (analyst misses a usable pivot).
 *
 * The actual extraction lives in IocExtractor — this is just a yes/no
 * gate for showing the CTA.
 */
export function hasIocCandidates(text: string): boolean {
  if (!text) return false;
  if (/\bhttps?:\/\//i.test(text)) return true; // URLs
  if (/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(text)) return true; // IPv4
  if (/\b[a-f0-9]{32,64}\b/i.test(text)) return true; // MD5/SHA-1/SHA-256
  if (/\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:[a-z]{2,63})\b/i.test(text)) return true; // domains
  return false;
}
