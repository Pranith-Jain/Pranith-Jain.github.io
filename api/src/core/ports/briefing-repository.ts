import type { Briefing, BriefingType } from '../entities';

export interface IBriefingRepository {
  list(type?: BriefingType, limit?: number): Promise<Briefing[]>;
  get(slug: string): Promise<Briefing | null>;
  today(type: BriefingType): Promise<Briefing | null>;
  save(briefing: Briefing): Promise<void>;
  sweep(maxAgeDays: number): Promise<number>;
}
