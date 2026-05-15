import { useState } from 'react';
import { Github, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { projects } from '../../data/content';

const TRUNCATE_THRESHOLD = 240;

interface ProjectCardProps {
  project: (typeof projects)[number];
}

function ProjectCard({ project }: ProjectCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const needsToggle = project.description.length > TRUNCATE_THRESHOLD;

  return (
    <div className="animate-fade-in-up glass rounded-2xl p-6 shadow-sm transition-all hover:shadow-glow hover:border-brand-500/40">
      <div className="flex items-start justify-between gap-4">
        <div className="text-base font-semibold text-slate-900 dark:text-white">{project.title}</div>
        {project.badge && (
          <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            {project.badge}
          </span>
        )}
      </div>
      <p
        className={`mt-2 text-sm text-slate-700 dark:text-slate-300 ${needsToggle && !expanded ? 'line-clamp-3' : ''}`}
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
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {project.tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center rounded-full border border-slate-200/70 bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 transition-transform hover:scale-105"
          >
            {tag}
          </span>
        ))}
        {project.github && (
          <a
            href={project.github}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-slate-200/70 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-xl transition-transform hover:scale-105 hover:bg-slate-200 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-700/60"
            aria-label={`View ${project.title} on GitHub`}
          >
            <Github className="w-3.5 h-3.5" aria-hidden="true" />
            Code
          </a>
        )}
        {project.href && (
          <Link
            to={project.href}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200/70 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 shadow-sm backdrop-blur-xl transition-transform hover:scale-105 hover:bg-brand-100 dark:border-white/10 dark:bg-brand-900/30 dark:text-brand-300 dark:hover:bg-brand-800/40"
            aria-label={`View ${project.title}`}
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            View Tool
          </Link>
        )}
        {project.externalUrl && (
          <a
            href={project.externalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-slate-200/70 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 shadow-sm backdrop-blur-xl transition-transform hover:scale-105 hover:bg-brand-100 dark:border-white/10 dark:bg-brand-900/30 dark:text-brand-300 dark:hover:bg-brand-800/40"
            aria-label={`Open ${project.title} live demo`}
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            Live Demo
          </a>
        )}
      </div>
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
      <div className="mb-12 max-w-2xl">
        <div className="animate-fade-in-up mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
          Projects
        </div>
        <h2 className="animate-fade-in-up text-4xl font-extrabold tracking-tight sm:text-5xl text-slate-900 dark:text-white">
          Selected projects &amp; initiatives
        </h2>
      </div>

      <div className="animate-fade-in-up grid gap-6">
        {visible.map((project) => (
          <ProjectCard key={project.title} project={project} />
        ))}
      </div>

      {remaining > 0 && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-5 py-2.5 text-sm font-semibold text-slate-700 backdrop-blur-md transition-all hover:border-brand-500/50 hover:text-brand-600 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:text-brand-400"
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
