import { Link } from 'react-router-dom';
import { ArrowRight, type LucideIcon } from 'lucide-react';

export interface TaskCard {
  /** What the user wants to do, in plain language. */
  task: string;
  /** Which tool(s) solve this task. */
  tools: { path: string; label: string }[];
  /** One-line plain-language explanation of what happens. */
  outcome: string;
  /** Icon for the card. */
  icon: LucideIcon;
}

interface TaskCardsProps {
  tasks: TaskCard[];
  tone?: 'brand' | 'rose';
}

const TONE_CLASSES = {
  brand: {
    card: 'border-brand-500/15 bg-brand-50/20 dark:bg-brand-900/10 hover:border-brand-500/40',
    icon: 'text-brand-600 dark:text-brand-400',
    tool: 'border-brand-500/30 text-brand-700 dark:text-brand-300 hover:border-brand-500/60',
    arrow: 'text-brand-600 dark:text-brand-400',
  },
  rose: {
    card: 'border-rose-500/15 bg-rose-50/20 dark:bg-rose-900/10 hover:border-rose-500/40',
    icon: 'text-rose-600 dark:text-rose-400',
    tool: 'border-rose-500/30 text-rose-700 dark:text-rose-300 hover:border-rose-500/60',
    arrow: 'text-rose-600 dark:text-rose-400',
  },
} as const;

/**
 * Task-based navigation cards — the "I need to..." surface for first-time
 * visitors. Each card maps a real-world job to the specific tool(s) that
 * solve it, with plain-language descriptions instead of tool names.
 *
 * Solves the hub problem: a novice doesn't know which of 60+ tools to
 * pick. These cards answer "I have a suspicious IP" or "I got a phishing
 * email" with a direct path to the right tool.
 */
export function TaskCards({ tasks, tone = 'brand' }: TaskCardsProps): JSX.Element {
  const t = TONE_CLASSES[tone];
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-4">
        <h2 className="font-display font-bold text-xl text-slate-900 dark:text-slate-100">What do you need to do?</h2>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-5 max-w-3xl leading-relaxed">
        Pick a task — each one takes you straight to the right tool.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tasks.map((task) => {
          const Icon = task.icon;
          return (
            <div
              key={task.task}
              className={`group rounded-xl border p-4 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-e2 ${t.card}`}
            >
              <div className="flex items-start gap-3 mb-3">
                <Icon size={18} className={`mt-0.5 shrink-0 ${t.icon}`} aria-hidden="true" />
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">{task.task}</p>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3">{task.outcome}</p>
              <div className="flex flex-wrap gap-1.5">
                {task.tools.map((tool) => (
                  <Link
                    key={tool.path}
                    to={tool.path}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-mono transition-colors ${t.tool}`}
                  >
                    {tool.label}
                    <ArrowRight size={10} className="opacity-60" />
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
