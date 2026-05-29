import type { IPortfolioRepository } from '../../core/ports';
import {
  getProfileData,
  getSkillsData,
  getExperiencesData,
  getProjectsData,
} from '../../core/use-cases';
import type { ProfileData, SkillsData, ExperiencesData, ProjectsData } from '../../core/use-cases';

export class PortfolioService {
  constructor(private repo: IPortfolioRepository) {}

  getProfile(): ProfileData {
    return getProfileData(this.repo);
  }

  getSkills(): SkillsData {
    return getSkillsData(this.repo);
  }

  getExperiences(): ExperiencesData {
    return getExperiencesData(this.repo);
  }

  getProjects(): ProjectsData {
    return getProjectsData(this.repo);
  }
}
