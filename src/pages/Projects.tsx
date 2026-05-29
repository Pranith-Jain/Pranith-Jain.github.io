import { Projects } from '../components/sections';
import { projects } from '../data/content';

export default function ProjectsPage() {
  return (
    <>
      <h1 className="sr-only">Projects — Pranith Jain</h1>
      <Projects projects={projects} />
    </>
  );
}
