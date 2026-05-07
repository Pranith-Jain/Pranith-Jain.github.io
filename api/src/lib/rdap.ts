export interface RdapResult {
  registrar?: string;
  created?: string;
  expires?: string;
  updated?: string;
  nameservers: string[];
  status: string[];
  error?: string;
}

interface RdapEvent {
  eventAction: string;
  eventDate: string;
}
interface RdapEntity {
  roles?: string[];
  vcardArray?: [string, Array<[string, Record<string, unknown>, string, string]>];
}
interface RdapNameserver {
  ldhName: string;
}
interface RdapResponse {
  events?: RdapEvent[];
  entities?: RdapEntity[];
  nameservers?: RdapNameserver[];
  status?: string[];
}

function vcardName(entity: RdapEntity): string | undefined {
  const arr = entity.vcardArray?.[1] ?? [];
  const fn = arr.find((p) => p[0] === 'fn');
  return fn ? fn[3] : undefined;
}

export async function rdapLookup(domain: string): Promise<RdapResult> {
  const empty: RdapResult = { nameservers: [], status: [] };
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { accept: 'application/rdap+json' },
      redirect: 'follow',
    });
    if (!res.ok) return { ...empty, error: `${res.status} ${res.statusText}`.trim() };
    const j = (await res.json()) as RdapResponse;
    const eventBy = (action: string) => j.events?.find((e) => e.eventAction === action)?.eventDate;
    const registrarEntity = j.entities?.find((e) => e.roles?.includes('registrar'));
    return {
      registrar: registrarEntity ? vcardName(registrarEntity) : undefined,
      created: eventBy('registration'),
      expires: eventBy('expiration'),
      updated: eventBy('last changed'),
      nameservers: (j.nameservers ?? []).map((n) => n.ldhName),
      status: j.status ?? [],
    };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }
}
