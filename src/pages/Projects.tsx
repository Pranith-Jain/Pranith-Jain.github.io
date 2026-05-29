import { Projects } from '../components/sections';
import { portfolioRepository } from '../infrastructure/repositories';
import { getProjectsData } from '../core/use-cases';

const { projects } = getProjectsData(portfolioRepository);

export default function ProjectsPage() {
  return <Projects projects={projects} />;
}
