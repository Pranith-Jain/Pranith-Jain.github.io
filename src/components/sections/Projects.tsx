import { useState } from 'react';
import { Github, ExternalLink, ChevronDown, ChevronUp, ArrowRight, Clock, Calendar } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Project } from '../../core/entities';
import { publishedCaseStudies } from '../../data/case-studies';
import { Badge } from '../Badge';

interface ProjectsProps {
  projects: Project[];
}

/**
 * Projects list — improved with better visual hierarchy for case studies,
 * timeline indicators, and tool links.
 */

const TRUNCATE_THRESHOLD = 240;

interface ProjectCardProps {
  project: Project;
}

function ProjectCard({ project }: ProjectCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const needsToggle = project.description.length > TRUNCATE_THRESHOLD;

  return (
    <div className="surface-card p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display font-semibold text-lg text-slate-900 dark:text-white">{project.title}</h3>
        {project.badge && (
          <Badge tone="success" className="shrink-0">
            {project.badge}
          </Badge>
        )}
      </div>
      <p className={`mt-2 text-sm text-muted leading-relaxed ${needsToggle && !expanded ? 'line-clamp-3' : ''}`}>
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

export function Projects({ projects }: ProjectsProps) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? projects : projects.slice(0, INITIAL_PROJECTS);
  const remaining = projects.length - INITIAL_PROJECTS;

  return (
    <section id="projects" className="scroll-mt-24">
      <div className="mb-10 max-w-2xl">
        <div className="mb-3 text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          Projects
        </div>
        <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
          Selected projects &amp; initiatives
        </h2>
        <p className="mt-3 text-base text-muted leading-relaxed">
          Real-world security work: incident response, detection engineering, threat intelligence, and the tools that
          make it all possible.
        </p>
      </div>

      {/* Case studies — the credibility document. Featured prominently
          with timeline indicators and outcome metrics. */}
      {publishedCaseStudies.length > 0 && (
        <div className="mb-12">
          <div className="mb-4 flex items-center gap-2">
            <div className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Case Studies
            </div>
            <span className="text-xs font-mono text-slate-400">· {publishedCaseStudies.length} published</span>
          </div>

          {/* Timeline layout */}
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200 dark:bg-[rgb(var(--surface-300))] hidden sm:block" />

            <div className="space-y-4">
              {publishedCaseStudies.map((cs) => (
                <Link
                  key={cs.slug}
                  to={`/projects/${cs.slug}`}
                  className="group relative sm:pl-10 block surface-card card-hover p-5 hover:border-brand-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                >
                  {/* Timeline dot */}
                  <div className="absolute left-2.5 top-6 w-3 h-3 rounded-full bg-brand-500 border-2 border-white dark:border-slate-900 hidden sm:block" />

                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-micro font-mono uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
                      {cs.kicker}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                      <Calendar size={10} />
                      {new Date(cs.publishedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                      <Clock size={10} />
                      {cs.readingTime}
                    </span>
                  </div>

                  <h3 className="font-display font-semibold text-lg text-slate-900 dark:text-white leading-snug group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    {cs.title}
                  </h3>

                  <p className="mt-2 text-sm text-muted leading-relaxed line-clamp-2">{cs.excerpt}</p>

                  {/* Outcome metrics */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {cs.outcome.split(' · ').map((metric) => (
                      <span
                        key={metric}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-xs font-mono text-slate-600 dark:text-slate-300"
                      >
                        {metric}
                      </span>
                    ))}
                  </div>

                  {/* Tags */}
                  {cs.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {cs.tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="text-micro font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500"
                        >
                          {tag}
                        </span>
                      ))}
                      {cs.tags.length > 4 && (
                        <span className="text-micro font-mono text-slate-400">+{cs.tags.length - 4}</span>
                      )}
                    </div>
                  )}

                  <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-700 dark:text-brand-400">
                    Read case study
                    <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mb-3 text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
        Tools &amp; initiatives
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
