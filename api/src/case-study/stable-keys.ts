function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function nonEmpty(s: string, field: string): string {
  if (!s || !s.trim()) throw new Error(`${field} must not be empty`);
  return s;
}

export function cveKey(cveId: string): string {
  return nonEmpty(cveId, 'cveId').toLowerCase();
}

export function actorKey(name: string): string {
  return `actor-${slugify(nonEmpty(name, 'name'))}`;
}

export function malwareKey(family: string): string {
  return `malware-${slugify(nonEmpty(family, 'family'))}`;
}

export function ransomKey(group: string, when: Date): string {
  const y = when.getUTCFullYear();
  const m = String(when.getUTCMonth() + 1).padStart(2, '0');
  return `ransom-${slugify(nonEmpty(group, 'group'))}-${y}-${m}`;
}

export function slotIdFor(slotAtIso: string): string {
  return `slot-${slotAtIso.toLowerCase().replace(/[:.]/g, '-')}`;
}
