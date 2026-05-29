import type { IPortfolioRepository } from '../../core/ports';
import type {
  PersonalInfo,
  StatItem,
  Skill,
  Experience,
  CertificationGroup,
  Education,
  Project,
  FeaturedArticle,
  Membership,
  NavLink,
  Company,
} from '../../core/entities';
import {
  personalInfo,
  stats,
  skills,
  experiences,
  certifications,
  education,
  projects,
  featuredArticles,
  memberships,
  navLinks,
  companies,
} from '../../data/content';

export class StaticPortfolioRepository implements IPortfolioRepository {
  getPersonalInfo(): PersonalInfo {
    return personalInfo;
  }

  getStats(): StatItem[] {
    return stats;
  }

  getSkills(): Skill[] {
    return skills;
  }

  getExperiences(): Experience[] {
    return experiences;
  }

  getCertifications(): CertificationGroup {
    return certifications;
  }

  getEducation(): Education[] {
    return education;
  }

  getProjects(): Project[] {
    return projects;
  }

  getFeaturedArticles(): FeaturedArticle[] {
    return featuredArticles;
  }

  getMemberships(): Membership[] {
    return memberships;
  }

  getNavLinks(): NavLink[] {
    return navLinks;
  }

  getCompanies(): Company[] {
    return companies;
  }
}
