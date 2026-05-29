import type { IPortfolioRepository } from '../ports';
import type { Project } from '../entities';

export interface ProjectsData {
  projects: Project[];
}

export function getProjectsData(repo: IPortfolioRepository): ProjectsData {
  return {
    projects: repo.getProjects(),
  };
}
