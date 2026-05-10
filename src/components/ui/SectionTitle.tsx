interface SectionTitleProps {
  label: string;
  title: string;
  description?: string;
  className?: string;
  id?: string;
}

export function SectionTitle({ label, title, description, className = '', id }: SectionTitleProps) {
  return (
    <div className={`mb-12 max-w-3xl ${className}`} id={id}>
      <div
        className="animate-fade-in-up mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400"
        aria-hidden="true"
      >
        {label}
      </div>
      <h2 className="animate-fade-in-up text-4xl font-extrabold tracking-tight sm:text-5xl text-slate-900 dark:text-white">
        {title}
      </h2>
      {description && (
        <p className="animate-fade-in-up mt-4 text-lg text-slate-700 dark:text-slate-400">{description}</p>
      )}
    </div>
  );
}
