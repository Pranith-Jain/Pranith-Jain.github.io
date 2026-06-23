import { Experience, Companies } from '../components/sections';
import { experiences, companies } from '../data/content';
import { PageMeta } from '../components/PageMeta';

export default function ExperiencePage() {
  return (
    <>
      <PageMeta
        title="Experience"
        description="Professional experience and the teams and companies Pranith Jain has worked with across DFIR, threat intelligence, and security engineering."
        canonicalPath="/experience"
      />
      <h1 className="sr-only">Experience — Pranith Jain</h1>
      <div className="space-y-16">
        <Experience experiences={experiences} />
        <Companies companies={companies} />
      </div>
    </>
  );
}
