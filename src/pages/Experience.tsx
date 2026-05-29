import { Experience, Companies } from '../components/sections';
import { portfolioRepository } from '../infrastructure/repositories';
import { getExperiencesData } from '../core/use-cases';

const { experiences, companies } = getExperiencesData(portfolioRepository);

export default function ExperiencePage() {
  return (
    <>
      <Experience experiences={experiences} />
      <Companies companies={companies} />
    </>
  );
}
