import { Skills, Certifications } from '../components/sections';
import { skills, certifications, education } from '../data/content';
import { PageMeta } from '../components/PageMeta';

export default function SkillsPage() {
  return (
    <>
      <PageMeta
        title="Skills & Expertise"
        description="Technical skills, certifications, and education — DFIR, threat intelligence, cloud security, and detection engineering."
        canonicalPath="/skills"
      />
      <h1 className="sr-only">Skills & Expertise — Pranith Jain</h1>
      <Skills skills={skills} />
      <Certifications certifications={certifications} education={education} />
    </>
  );
}
