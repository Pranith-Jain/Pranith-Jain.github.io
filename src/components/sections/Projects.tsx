import { useState } from 'react';
import { Github, ExternalLink, ChevronDown, ChevronUp, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { projects } from '../../data/content';
import { FiledTag } from '../editorial';

const TRUNCATE_THRESHOLD = 240;

interface ProjectRowProps {
  project: (typeof projects)[number];
  index: number;
}

function ProjectRow({ project, index }: ProjectRowProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const needsToggle = project.description.length > TRUNCATE_THRESHOLD;
  const indexLabel = String(index + 1).padStart(2, '0');

  return (
    <li className="group grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 py-8 sm:grid-cols-[auto_1fr_auto] sm:gap-x-6">
      <div className="row-span-2 pt-2 sm:row-span-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">{indexLabel}</span>
      </div>

      <div className="min-w-0">
        <h3 className="font-serif text-xl font-medium leading-tight text-ink-1 transition-colors duration-enter group-hover:text-accent sm:text-2xl">
          {project.title}
        </h3>
        {project.badge && (
          <span className="ml-0 mt-2 inline-flex items-center font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            {project.badge}
          </span>
        )}
        <p
          className={`mt-3 max-w-[65ch] text-sm leading-[1.55] text-ink-2 ${
            needsToggle && !expanded ? 'line-clamp-3' : ''
          }`}
        >
          {project.description}
        </p>
        {needsToggle && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-accent transition-colors duration-enter hover:text-brand-700"
            aria-expanded={expanded}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" aria-hidden="true" /> show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" aria-hidden="true" /> read more
              </>
            )}
          </button>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center border border-rule px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="col-start-2 flex flex-wrap items-center gap-3 sm:col-start-3 sm:flex-col sm:items-end sm:gap-2">
        {project.github && (
          <a
            href={project.github}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-2 transition-colors duration-enter hover:text-accent"
            aria-label={`View ${project.title} on GitHub`}
          >
            <Github className="h-3 w-3" aria-hidden="true" /> code
          </a>
        )}
        {project.href && (
          <Link
            to={project.href}
            className="inline-flex items-center gap-1 font-mono text-[11px] text-accent transition-colors duration-enter hover:text-brand-700"
            aria-label={`View ${project.title}`}
          >
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" /> view
          </Link>
        )}
        {project.externalUrl && (
          <a
            href={project.externalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[11px] text-accent transition-colors duration-enter hover:text-brand-700"
            aria-label={`Open ${project.title} live demo`}
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" /> live
          </a>
        )}
      </div>
    </li>
  );
}

export function Projects() {
  return (
    <section id="projects" className="scroll-mt-24 py-16 lg:py-24">
      <div className="mb-10 max-w-[65ch]">
        <FiledTag number="04" subject="Projects — Shipped Tooling" />
        <h2 className="font-serif text-3xl font-medium leading-[1.15] tracking-[-0.01em] text-ink-1 sm:text-4xl">
          Selected projects &amp; initiatives
        </h2>
        <p className="mt-4 text-base leading-[1.55] text-ink-2">
          Tooling shipped on shift and on side time. Most are free, edge-hosted, and run without a signup.
        </p>
      </div>

      <ul className="divide-y divide-rule border-y border-rule">
        {projects.map((project, idx) => (
          <ProjectRow key={project.title} project={project} index={idx} />
        ))}
      </ul>
    </section>
  );
}
