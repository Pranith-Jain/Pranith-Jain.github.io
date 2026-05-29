import type { IPortfolioRepository } from '../ports';
import type { Experience, Company } from '../entities';

export interface ExperiencesData {
  experiences: Experience[];
  companies: Company[];
}

export function getExperiencesData(repo: IPortfolioRepository): ExperiencesData {
  return {
    experiences: repo.getExperiences(),
    companies: repo.getCompanies(),
  };
}
