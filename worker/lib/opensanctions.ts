export interface OpensanctionsMatch {
  schema?: string;
  id?: string;
  caption?: string;
  properties?: Record<string, string[]>;
  datasets?: string[];
  score?: number;
  topics?: string[];
}

export interface OpensanctionsSearchResponse {
  total?: { value?: number };
  results?: OpensanctionsMatch[];
}

export async function opensanctionsSearch(q: string, limit = 20) {
  const result: { success: boolean; data?: OpensanctionsSearchResponse; error?: string } = {
    success: false,
  };

  try {
    const res = await fetch(
      `https://api.opensanctions.org/search/default?q=${encodeURIComponent(q)}&limit=${Math.min(limit, 100)}`,
      {
        headers: { Accept: 'application/json', 'User-Agent': 'pranithjain-threatintel/1.0' },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!res.ok) {
      result.error = `OpenSanctions returned ${res.status}`;
      return result;
    }

    result.data = (await res.json()) as OpensanctionsSearchResponse;
    result.success = true;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }

  return result;
}

export async function opensanctionsEntity(id: string) {
  const result: { success: boolean; data?: unknown; error?: string } = { success: false };

  try {
    const res = await fetch(`https://api.opensanctions.org/entities/${encodeURIComponent(id)}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'pranithjain-threatintel/1.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 404) {
      result.error = 'entity not found';
      return result;
    }
    if (!res.ok) {
      result.error = `OpenSanctions returned ${res.status}`;
      return result;
    }

    result.data = await res.json();
    result.success = true;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }

  return result;
}

export async function opensanctionsStats() {
  const result: { success: boolean; data?: unknown; error?: string } = { success: false };

  try {
    const res = await fetch('https://api.opensanctions.org/statistics', {
      headers: { Accept: 'application/json', 'User-Agent': 'pranithjain-threatintel/1.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      result.error = `OpenSanctions stats returned ${res.status}`;
      return result;
    }

    result.data = await res.json();
    result.success = true;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }

  return result;
}
