import { useState } from 'react';
import { Github, ExternalLink, ChevronDown, ChevronUp, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { projects } from '../../data/content';

const TRUNCATE_THRESHOLD = 240;

interface ProjectRowProps {
  project: (typeof projects)[number];
  index: number;
}

/**
 * Single-row editorial layout adopted from bencium-marketplace's
 * design-principles + impeccable.style's labeled-row pattern.
 *
 * grid layout: index (mono) | title + body | tags + links (right rail)
 * Hover on title slides it forward 1-2px (impeccable's spring easing).
 */
function ProjectRow({ project, index }: ProjectRowProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const needsToggle = project.description.length > TRUNCATE_THRESHOLD;
  const indexLabel = String(index + 1).padStart(2, '0');

  return (
    <li className="group grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 py-7 sm:grid-cols-[auto_1fr_auto] sm:gap-x-6 sm:py-8">
      {/* Index — mono number, runs full row height */}
      <div className="row-span-2 pt-1 sm:row-span-1 sm:pt-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">{indexLabel}</span>
      </div>

      {/* Title + body */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-serif text-xl font-normal italic leading-tight text-slate-900 transition-transform duration-200 ease-spring group-hover:translate-x-1 sm:text-2xl dark:text-white">
            {project.title}
          </h3>
          {project.badge && (
            <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              {project.badge}
            </span>
          )}
        </div>
        <p
          className={`mt-2 max-w-[65ch] text-[14px] leading-relaxed text-slate-700 dark:text-slate-300 ${
            needsToggle && !expanded ? 'line-clamp-3' : ''
          }`}
        >
          {project.description}
        </p>
        {needsToggle && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
          >
            {expanded ? (
              <>
                <ChevronUp size={11} /> show less
              </>
            ) : (
              <>
                <ChevronDown size={11} /> read more
              </>
            )}
          </button>
        )}
        {/* Tags inline below body */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded border border-slate-300 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-600 dark:border-slate-700 dark:text-slate-400"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Right rail — links */}
      <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-3 sm:flex-col sm:items-end sm:gap-1.5">
        {project.github && (
          <a
            href={project.github}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-600 transition-colors duration-200 ease-spring hover:text-brand-700 dark:text-slate-400 dark:hover:text-brand-300"
            aria-label={`View ${project.title} on GitHub`}
          >
            <Github className="h-3 w-3" aria-hidden="true" />
            code
          </a>
        )}
        {project.href && (
          <Link
            to={project.href}
            className="inline-flex items-center gap-1 font-mono text-[11px] text-brand-700 transition-colors duration-200 ease-spring hover:text-brand-500 dark:text-brand-400 dark:hover:text-brand-300"
            aria-label={`View ${project.title}`}
          >
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            view
          </Link>
        )}
        {project.externalUrl && (
          <a
            href={project.externalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[11px] text-brand-700 transition-colors duration-200 ease-spring hover:text-brand-500 dark:text-brand-400 dark:hover:text-brand-300"
            aria-label={`Open ${project.title} live demo`}
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            live
          </a>
        )}
      </div>
    </li>
  );
}

export function Projects() {
  return (
    <section id="projects" className="mt-24 scroll-mt-24">
      <div className="mb-8 max-w-3xl">
        <div className="animate-fade-in-up mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
          04 — Projects
        </div>
        <h2 className="animate-fade-in-up font-serif text-3xl font-normal italic tracking-tight text-slate-900 sm:text-4xl dark:text-white">
          Selected projects &amp; initiatives
        </h2>
        <p className="mt-3 max-w-[65ch] text-base text-slate-700 dark:text-slate-400">
          Tooling shipped on shift and on side time. Most are free, edge-hosted, and run without a signup.
        </p>
      </div>

      <ul className="animate-fade-in-up divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {projects.map((project, idx) => (
          <ProjectRow key={project.title} project={project} index={idx} />
        ))}
      </ul>
    </section>
  );
}
