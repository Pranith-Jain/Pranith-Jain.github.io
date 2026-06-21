import { Projects } from '../components/sections';
import { projects } from '../data/content';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

export default function ProjectsPage() {
  useDocumentMeta({
    title: 'Projects',
    description:
      'Case studies from the security desk: phishing program at scale (250+ incidents), DMARC spoofing drop, detection-rule converter workflow, and more.',
    canonicalPath: '/projects',
  });
  return (
    <>
      <h1 className="sr-only">Projects — Pranith Jain</h1>
      <Projects projects={projects} />
    </>
  );
}
