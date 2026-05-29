import type { IPortfolioRepository } from '../ports';
import type { PersonalInfo, StatItem } from '../entities';

export interface ProfileData {
  personalInfo: PersonalInfo;
  stats: StatItem[];
}

export function getProfileData(repo: IPortfolioRepository): ProfileData {
  return {
    personalInfo: repo.getPersonalInfo(),
    stats: repo.getStats(),
  };
}
