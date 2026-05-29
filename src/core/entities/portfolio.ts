export interface StatItem {
  label: string;
  value: string;
  suffix?: string;
  target?: number;
  description: string;
  badge?: string;
  progress?: number;
}

export interface Skill {
  title: string;
  icon: string;
  items: string[];
}

export interface ExperienceSection {
  title: string;
  icon: string;
  items: string[];
}

export interface Experience {
  title: string;
  company: string;
  location?: string;
  period: string;
  badge?: string;
  sections?: ExperienceSection[];
  items?: string[];
}

export interface Certification {
  title: string;
  issuer: string;
  year: string;
  featured?: boolean;
}

export interface CertificationGroup {
  core: Certification[];
  training: Certification[];
  bootcamps: Certification[];
  additional: Certification[];
  internships: Certification[];
  simulations: Certification[];
}

export interface Education {
  degree: string;
  school: string;
}

export interface Project {
  title: string;
  description: string;
  tags: string[];
  github?: string;
  badge?: string;
  href?: string;
  externalUrl?: string;
}

export interface FeaturedArticle {
  title: string;
  description: string;
  source: string;
  category: string;
  url: string;
}

export interface MembershipDetail {
  label: string;
  text: string;
}

export interface Membership {
  name: string;
  abbreviation: string;
  period: string;
  description: string;
  details?: MembershipDetail[];
  color: string;
}

export interface NavLinkChild {
  label: string;
  href: string;
}

export interface NavLink {
  label: string;
  href: string;
  children?: NavLinkChild[];
  cta?: boolean;
}

export type Company = string;

export interface PersonalInfo {
  name: string;
  title: string;
  shortTitle: string;
  headline: string;
  description: string;
  currentFocus: string;
  currentlyLearning: string;
  availability: string;
  email: string;
  phone: string;
  calendlyUrl: string;
  linkedInUrl: string;
  githubUrl: string;
  resumeUrl: string;
  featuredUrl: string;
}
