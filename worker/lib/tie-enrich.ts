export interface TieEnrichResult {
  ioc: string;
  iocType: 'ip' | 'hash' | 'domain' | 'url';
  reputation?: unknown;
  geo?: unknown;
  phantomcandle?: unknown;
  domainIntel?: unknown;
  phishingAnalysis?: unknown;
  malpedia?: unknown;
  mitre?: unknown;
  diagnostics: Array<{ provider: string; status: 'ok' | 'skipped' | 'failed'; ms: number; error?: string }>;
}

interface DiagnosticAccumulator {
  diag: TieEnrichResult['diagnostics'];
}

async function enrichIp(self: Fetcher, ioc: string, acc: DiagnosticAccumulator): Promise<Partial<TieEnrichResult>> {
  const t0 = Date.now();
  try {
    const [rep, geo, pc] = await Promise.allSettled([
      self.fetch(`https://placeholder/api/v1/ioc/check?indicator=${encodeURIComponent(ioc)}`, {
        headers: { 'x-internal-agent': 'tie-enrich', accept: 'application/json' },
      }),
      self.fetch(`https://placeholder/api/v1/ip-geo?ip=${encodeURIComponent(ioc)}`, {
        headers: { 'x-internal-agent': 'tie-enrich', accept: 'application/json' },
      }),
      self.fetch(`https://placeholder/api/v1/ip/${encodeURIComponent(ioc)}/phantomcandle`, {
        headers: { 'x-internal-agent': 'tie-enrich', accept: 'application/json' },
      }),
    ]);
    const now = Date.now();
    const check = rep.status === 'fulfilled' && rep.value.ok ? await rep.value.json() : undefined;
    acc.diag.push({
      provider: 'check_ioc',
      status: check ? 'ok' : 'failed',
      ms: now - t0,
      error: rep.status === 'rejected' ? rep.reason?.message : undefined,
    });
    const geoData = geo.status === 'fulfilled' && geo.value.ok ? await geo.value.json() : undefined;
    acc.diag.push({
      provider: 'lookup_ip_geo',
      status: geoData ? 'ok' : 'failed',
      ms: now - t0,
      error: geo.status === 'rejected' ? geo.reason?.message : undefined,
    });
    const pcData = pc.status === 'fulfilled' && pc.value.ok ? await pc.value.json() : undefined;
    acc.diag.push({
      provider: 'phantomcandle',
      status: pcData ? 'ok' : 'skipped',
      ms: now - t0,
      error: pc.status === 'rejected' ? pc.reason?.message : undefined,
    });
    return { reputation: check, geo: geoData, phantomcandle: pcData };
  } catch {
    return {};
  }
}

async function enrichHash(self: Fetcher, ioc: string, acc: DiagnosticAccumulator): Promise<Partial<TieEnrichResult>> {
  const t0 = Date.now();
  try {
    const [rep, mal] = await Promise.allSettled([
      self.fetch(`https://placeholder/api/v1/ioc/check?indicator=${encodeURIComponent(ioc)}`, {
        headers: { 'x-internal-agent': 'tie-enrich', accept: 'application/json' },
      }),
      self.fetch(`https://placeholder/api/v1/search-malpedia?q=${encodeURIComponent(ioc)}`, {
        headers: { 'x-internal-agent': 'tie-enrich', accept: 'application/json' },
      }),
    ]);
    const now = Date.now();
    const check = rep.status === 'fulfilled' && rep.value.ok ? await rep.value.json() : undefined;
    acc.diag.push({
      provider: 'check_ioc',
      status: check ? 'ok' : 'failed',
      ms: now - t0,
      error: rep.status === 'rejected' ? rep.reason?.message : undefined,
    });
    const m = mal.status === 'fulfilled' && mal.value.ok ? await mal.value.json() : undefined;
    acc.diag.push({
      provider: 'search_malpedia',
      status: m ? 'ok' : 'skipped',
      ms: now - t0,
      error: mal.status === 'rejected' ? mal.reason?.message : undefined,
    });
    return { reputation: check, malpedia: m };
  } catch {
    return {};
  }
}

async function enrichDomain(self: Fetcher, ioc: string, acc: DiagnosticAccumulator): Promise<Partial<TieEnrichResult>> {
  const t0 = Date.now();
  try {
    const [rep, dom] = await Promise.allSettled([
      self.fetch(`https://placeholder/api/v1/ioc/check?indicator=${encodeURIComponent(ioc)}`, {
        headers: { 'x-internal-agent': 'tie-enrich', accept: 'application/json' },
      }),
      self.fetch(`https://placeholder/api/v1/domain?domain=${encodeURIComponent(ioc)}`, {
        headers: { 'x-internal-agent': 'tie-enrich', accept: 'application/json' },
      }),
    ]);
    const now = Date.now();
    const check = rep.status === 'fulfilled' && rep.value.ok ? await rep.value.json() : undefined;
    acc.diag.push({
      provider: 'check_ioc',
      status: check ? 'ok' : 'failed',
      ms: now - t0,
      error: rep.status === 'rejected' ? rep.reason?.message : undefined,
    });
    const di = dom.status === 'fulfilled' && dom.value.ok ? await dom.value.json() : undefined;
    acc.diag.push({
      provider: 'lookup_domain',
      status: di ? 'ok' : 'failed',
      ms: now - t0,
      error: dom.status === 'rejected' ? dom.reason?.message : undefined,
    });
    return { reputation: check, domainIntel: di };
  } catch {
    return {};
  }
}

async function enrichUrl(self: Fetcher, ioc: string, acc: DiagnosticAccumulator): Promise<Partial<TieEnrichResult>> {
  const t0 = Date.now();
  try {
    const [rep, ph] = await Promise.allSettled([
      self.fetch(`https://placeholder/api/v1/ioc/check?indicator=${encodeURIComponent(ioc)}`, {
        headers: { 'x-internal-agent': 'tie-enrich', accept: 'application/json' },
      }),
      self.fetch(`https://placeholder/api/v1/phishing/url?url=${encodeURIComponent(ioc)}`, {
        headers: { 'x-internal-agent': 'tie-enrich', accept: 'application/json' },
      }),
    ]);
    const now = Date.now();
    const check = rep.status === 'fulfilled' && rep.value.ok ? await rep.value.json() : undefined;
    acc.diag.push({
      provider: 'check_ioc',
      status: check ? 'ok' : 'failed',
      ms: now - t0,
      error: rep.status === 'rejected' ? rep.reason?.message : undefined,
    });
    const pa = ph.status === 'fulfilled' && ph.value.ok ? await ph.value.json() : undefined;
    acc.diag.push({
      provider: 'analyze_phishing_url',
      status: pa ? 'ok' : 'skipped',
      ms: now - t0,
      error: ph.status === 'rejected' ? ph.reason?.message : undefined,
    });
    return { reputation: check, phishingAnalysis: pa };
  } catch {
    return {};
  }
}

export async function enrichIoc(
  self: Fetcher,
  ioc: string,
  iocType: 'ip' | 'hash' | 'domain' | 'url'
): Promise<TieEnrichResult> {
  const acc: DiagnosticAccumulator = { diag: [] };
  let partial: Partial<TieEnrichResult> = {};

  if (iocType === 'ip') partial = await enrichIp(self, ioc, acc);
  else if (iocType === 'hash') partial = await enrichHash(self, ioc, acc);
  else if (iocType === 'domain') partial = await enrichDomain(self, ioc, acc);
  else if (iocType === 'url') partial = await enrichUrl(self, ioc, acc);

  // MITRE mapping — fire-and-forget for every type
  try {
    const t0 = Date.now();
    const res = await self.fetch(`https://placeholder/api/v1/attack/extract?text=${encodeURIComponent(ioc)}`, {
      headers: { 'x-internal-agent': 'tie-enrich', accept: 'application/json' },
    });
    if (res.ok) {
      partial.mitre = await res.json();
      acc.diag.push({ provider: 'extract_ttps', status: 'ok', ms: Date.now() - t0 });
    } else {
      acc.diag.push({ provider: 'extract_ttps', status: 'skipped', ms: Date.now() - t0 });
    }
  } catch {
    acc.diag.push({ provider: 'extract_ttps', status: 'failed', ms: 0 });
  }

  return {
    ioc,
    iocType,
    reputation: partial.reputation,
    geo: partial.geo,
    phantomcandle: partial.phantomcandle,
    domainIntel: partial.domainIntel,
    phishingAnalysis: partial.phishingAnalysis,
    malpedia: partial.malpedia,
    mitre: partial.mitre,
    diagnostics: acc.diag,
  };
}
