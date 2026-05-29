import type { IPortfolioRepository } from '../ports';
import type { Skill, CertificationGroup, Education } from '../entities';

export interface SkillsData {
  skills: Skill[];
  certifications: CertificationGroup;
  education: Education[];
}

export function getSkillsData(repo: IPortfolioRepository): SkillsData {
  return {
    skills: repo.getSkills(),
    certifications: repo.getCertifications(),
    education: repo.getEducation(),
  };
}
