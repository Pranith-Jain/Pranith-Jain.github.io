const DOH = 'https://cloudflare-dns.com/dns-query';

const TYPE_NUM: Record<string, number> = {
  A: 1,
  AAAA: 28,
  NS: 2,
  CNAME: 5,
  SOA: 6,
  MX: 15,
  TXT: 16,
  CAA: 257,
};

export type RecordType = keyof typeof TYPE_NUM;

export interface ResolveResult {
  records: string[];
  error?: string;
}

interface DoHAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

interface DoHResponse {
  Status: number;
  Answer?: DoHAnswer[];
}

function clean(data: string, _type: RecordType): string {
  let v = data.trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  // For other record types: pass through verbatim (MX comes as "<priority> <host>")
  return v;
}

export async function resolveRecord(name: string, type: RecordType): Promise<ResolveResult> {
  try {
    const url = `${DOH}?name=${encodeURIComponent(name)}&type=${type}`;
    const res = await fetch(url, { headers: { accept: 'application/dns-json' } });
    if (!res.ok) return { records: [], error: `${res.status} ${res.statusText}`.trim() };
    const json = (await res.json()) as DoHResponse;
    const answers = json.Answer ?? [];
    return { records: answers.map((a) => clean(a.data, type)) };
  } catch (err) {
    return { records: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export async function resolveAllStandard(name: string): Promise<Record<RecordType, ResolveResult>> {
  const types = Object.keys(TYPE_NUM) as RecordType[];
  const entries = await Promise.all(types.map(async (t) => [t, await resolveRecord(name, t)] as const));
  return Object.fromEntries(entries) as Record<RecordType, ResolveResult>;
}
