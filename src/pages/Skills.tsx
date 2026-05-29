import { Skills, Certifications } from '../components/sections';
import { portfolioRepository } from '../infrastructure/repositories';
import { getSkillsData } from '../core/use-cases';

const { skills, certifications, education } = getSkillsData(portfolioRepository);

export default function SkillsPage() {
  return (
    <>
      <h1 className="sr-only">Skills & Expertise — Pranith Jain</h1>
      <Skills skills={skills} />
      <Certifications certifications={certifications} education={education} />
    </>
  );
}
