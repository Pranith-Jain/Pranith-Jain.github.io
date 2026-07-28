import type { CitationEntry } from './types';
import type { SourceReliability } from '../confidence';

type CiteInput = {
  sourceId: string;
  name: string;
  authority: SourceReliability;
  fragment: string;
  url?: string;
  fetched_at?: string;
};

/** Assigns stable [n] citation numbers and dedupes by (sourceId, fragment). */
export class CitationIndex {
  private byKey = new Map<string, number>();
  private list: CitationEntry[] = [];

  ref(input: CiteInput): number {
    const key = `${input.sourceId}::${input.fragment}`;
    const existing = this.byKey.get(key);
    if (existing !== undefined) return existing;

    const ref = this.list.length + 1;
    this.byKey.set(key, ref);
    this.list.push({
      ref,
      sourceId: input.sourceId,
      name: input.name,
      authority: input.authority,
      fragment: input.fragment,
      url: input.url,
      fetched_at: input.fetched_at,
    });
    return ref;
  }

  entries(): CitationEntry[] {
    return [...this.list];
  }
}
