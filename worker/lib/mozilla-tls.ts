export interface MozillaTlsResult {
  scanId?: number;
  url?: string;
  status?: string;
  results?: {
    score?: number;
    grade?: string;
    protocols?: string[];
    cipherSuites?: string[];
    vulnerabilities?: string[];
    warnings?: string[];
  };
}

export async function mozillaTlsScan(
  url: string
): Promise<{ success: boolean; data?: MozillaTlsResult; error?: string }> {
  const result: { success: boolean; data?: MozillaTlsResult; error?: string } = { success: false };
  try {
    const res = await fetch(`https://tls-observatory.services.mozilla.com/api/v1/scan?url=${encodeURIComponent(url)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      result.error = `Mozilla TLS returned ${res.status}`;
      return result;
    }
    result.data = (await res.json()) as MozillaTlsResult;
    result.success = true;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }
  return result;
}
