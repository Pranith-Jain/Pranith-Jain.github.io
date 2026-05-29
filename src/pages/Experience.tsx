import { Experience, Companies } from '../components/sections';
import { experiences, companies } from '../data/content';

export default function ExperiencePage() {
  return (
    <>
      <h1 className="sr-only">Experience — Pranith Jain</h1>
      <Experience experiences={experiences} />
      <Companies companies={companies} />
    </>
  );
}
