import { Skills, Certifications } from '../components/sections';
import { skills, certifications, education } from '../data/content';

export default function SkillsPage() {
  return (
    <>
      <h1 className="sr-only">Skills & Expertise — Pranith Jain</h1>
      <Skills skills={skills} />
      <Certifications certifications={certifications} education={education} />
    </>
  );
}
