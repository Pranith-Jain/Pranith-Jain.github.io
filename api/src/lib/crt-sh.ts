export interface CtEntry {
  id: number;
  issuer: string;
  not_before: string;
  not_after: string;
  subjects: string[];
}

interface CrtShRow {
  id: number;
  common_name: string;
  name_value: string;
  issuer_name: string;
  not_before: string;
  not_after: string;
}

export async function ctLogs(domain: string): Promise<CtEntry[]> {
  try {
    const res = await fetch(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`);
    if (!res.ok) return [];
    const rows = (await res.json()) as CrtShRow[];
    return rows
      .map((r) => ({
        id: r.id,
        issuer: r.issuer_name?.match(/CN=([^,]+)/)?.[1] ?? r.issuer_name ?? 'unknown',
        not_before: r.not_before,
        not_after: r.not_after,
        subjects: Array.from(new Set([r.common_name, ...r.name_value.split('\n')].filter(Boolean))),
      }))
      .sort((a, b) => b.not_before.localeCompare(a.not_before))
      .slice(0, 50);
  } catch {
    return [];
  }
}
