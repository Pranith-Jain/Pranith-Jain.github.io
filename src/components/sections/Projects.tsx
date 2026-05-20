import { useState } from 'react';
import { Github, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { projects } from '../../data/content';
import { Badge } from '../Badge';

/**
 * Projects list — minimal cards aligned with the rest of the redesigned
 * portfolio sections: thin border, no glass, no rounded-full pill action
 * buttons. Action links read as inline text-with-icon at the foot of the
 * card; tags remain as small badges (already minimal via the Badge
 * primitive).
 */

const TRUNCATE_THRESHOLD = 240;

interface ProjectCardProps {
  project: (typeof projects)[number];
}

function ProjectCard({ project }: ProjectCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const needsToggle = project.description.length > TRUNCATE_THRESHOLD;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display font-semibold text-lg text-slate-900 dark:text-white">{project.title}</h3>
        {project.badge && (
          <Badge tone="success" className="shrink-0">
            {project.badge}
          </Badge>
        )}
      </div>
      <p
        className={`mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed ${
          needsToggle && !expanded ? 'line-clamp-3' : ''
        }`}
      >
        {project.description}
      </p>
      {needsToggle && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline"
        >
          {expanded ? (
            <>
              <ChevronUp size={12} /> show less
            </>
          ) : (
            <>
              <ChevronDown size={12} /> read more
            </>
          )}
        </button>
      )}

      {project.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {project.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      )}

      {/* Action row — plain text links with icons. No pills, no scale-hover,
          no backdrop-blur. Separated from the tag row above by mt-4 so the
          actions feel like actions, not more tags. */}
      {(project.github || project.href || project.externalUrl) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium">
          {project.github && (
            <a
              href={project.github}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-slate-600 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400"
              aria-label={`View ${project.title} on GitHub`}
            >
              <Github className="w-3.5 h-3.5" aria-hidden="true" />
              Code
            </a>
          )}
          {project.href && (
            <Link
              to={project.href}
              className="inline-flex items-center gap-1.5 text-brand-700 hover:underline dark:text-brand-400"
              aria-label={`View ${project.title}`}
            >
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              View tool
            </Link>
          )}
          {project.externalUrl && (
            <a
              href={project.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-brand-700 hover:underline dark:text-brand-400"
              aria-label={`Open ${project.title} live demo`}
            >
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              Live demo
            </a>
          )}
        </div>
      )}
    </div>
  );
}

const INITIAL_PROJECTS = 6;

export function Projects() {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? projects : projects.slice(0, INITIAL_PROJECTS);
  const remaining = projects.length - INITIAL_PROJECTS;

  return (
    <section id="projects" className="mt-20 scroll-mt-24">
      <div className="mb-10 max-w-2xl">
        <div className="mb-3 text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">Projects</div>
        <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white">
          Selected projects &amp; initiatives
        </h2>
      </div>

      <div className="grid gap-3">
        {visible.map((project) => (
          <ProjectCard key={project.title} project={project} />
        ))}
      </div>

      {remaining > 0 && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400"
            aria-expanded={showAll}
          >
            {showAll ? (
              <>
                <ChevronUp size={14} aria-hidden="true" /> Show fewer
              </>
            ) : (
              <>
                <ChevronDown size={14} aria-hidden="true" /> Show all {projects.length} projects
              </>
            )}
          </button>
        </div>
      )}
    </section>
  );
}
