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
} from '../entities';

export interface IPortfolioRepository {
  getPersonalInfo(): PersonalInfo;
  getStats(): StatItem[];
  getSkills(): Skill[];
  getExperiences(): Experience[];
  getCertifications(): CertificationGroup;
  getEducation(): Education[];
  getProjects(): Project[];
  getFeaturedArticles(): FeaturedArticle[];
  getMemberships(): Membership[];
  getNavLinks(): NavLink[];
  getCompanies(): Company[];
}
