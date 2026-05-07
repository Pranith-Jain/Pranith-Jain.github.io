import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { threatActors } from '../../data/dfir/threat-actors';

export default function ActorDetail(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const actor = threatActors.find((a) => a.slug === slug);

  if (!actor) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa]">
        <div className="max-w-3xl mx-auto px-8 py-20">
          <Link
            to="/dfir/actors"
            className="inline-flex items-center gap-2 text-sm text-[#a1a1aa] hover:text-[#00fff9] mb-8 font-mono"
          >
            <ArrowLeft size={14} /> /dfir/actors
          </Link>
          <h1 className="font-display font-bold text-3xl">Actor not found</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa]">
      <div className="max-w-4xl mx-auto px-8 py-12">
        <Link
          to="/dfir/actors"
          className="inline-flex items-center gap-2 text-sm text-[#a1a1aa] hover:text-[#00fff9] mb-8 font-mono"
        >
          <ArrowLeft size={14} /> /dfir/actors
        </Link>

        <div className="mb-8">
          <h1 className="text-5xl font-display font-bold mb-3">{actor.name}</h1>
          {actor.aliases.length > 0 && (
            <p className="text-base font-mono text-[#a1a1aa] mb-4">aka {actor.aliases.join(', ')}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <span
              className={`text-xs font-mono px-2 py-1 rounded border ${
                actor.status === 'active'
                  ? 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/40'
                  : 'bg-[#71717a]/15 text-[#71717a] border-[#71717a]/40'
              }`}
            >
              {actor.status}
            </span>
            <span className="text-xs font-mono px-2 py-1 rounded border bg-[#00fff9]/15 text-[#00fff9] border-[#00fff9]/40">
              {actor.sophistication}
            </span>
            {actor.country && (
              <span className="text-xs font-mono px-2 py-1 rounded border border-[#1f1f23] text-[#a1a1aa]">
                {actor.country}
              </span>
            )}
          </div>
        </div>

        <section className="mb-8 rounded-2xl border border-[#1f1f23] bg-[#111113] p-6">
          <p className="text-base text-[#a1a1aa] leading-relaxed whitespace-pre-line">{actor.description}</p>
        </section>

        <div className="grid sm:grid-cols-2 gap-6 mb-8">
          <section className="rounded-2xl border border-[#1f1f23] bg-[#111113] p-6">
            <h2 className="font-display font-bold text-lg mb-3">Motivation</h2>
            <p className="font-mono text-sm text-[#fafafa]">{actor.motivation}</p>
            {actor.active_since && (
              <p className="mt-2 font-mono text-xs text-[#a1a1aa]">active since: {actor.active_since}</p>
            )}
            {actor.last_activity && (
              <p className="font-mono text-xs text-[#a1a1aa]">last activity: {actor.last_activity}</p>
            )}
          </section>

          <section className="rounded-2xl border border-[#1f1f23] bg-[#111113] p-6">
            <h2 className="font-display font-bold text-lg mb-3">Targets</h2>
            <ul className="space-y-1 text-sm font-mono text-[#a1a1aa]">
              {actor.targets.map((t) => (
                <li key={t}>· {t}</li>
              ))}
            </ul>
          </section>
        </div>

        <section className="mb-8 rounded-2xl border border-[#1f1f23] bg-[#111113] p-6">
          <h2 className="font-display font-bold text-lg mb-3">Malware &amp; Tools</h2>
          {actor.malware.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {actor.malware.map((m) => (
                <span
                  key={m}
                  className="text-xs font-mono px-2 py-1 rounded bg-[#0a0a0a] text-[#fafafa] border border-[#1f1f23]"
                >
                  {m}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm font-mono text-[#71717a]">No specific malware attributed.</p>
          )}
        </section>

        <section className="mb-8 rounded-2xl border border-[#1f1f23] bg-[#111113] p-6">
          <h2 className="font-display font-bold text-lg mb-3">MITRE ATT&amp;CK Techniques</h2>
          <div className="flex flex-wrap gap-2">
            {actor.techniques.map((t) => (
              <a
                key={t}
                href={`https://attack.mitre.org/techniques/${t.replace('.', '/')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono px-2 py-1 rounded bg-[#0a0a0a] text-[#00fff9] border border-[#1f1f23] hover:border-[#00fff9]/40"
              >
                {t}
              </a>
            ))}
          </div>
        </section>

        {actor.references && actor.references.length > 0 && (
          <section className="rounded-2xl border border-[#1f1f23] bg-[#111113] p-6">
            <h2 className="font-display font-bold text-lg mb-3">References</h2>
            <ul className="space-y-2">
              {actor.references.map((r) => (
                <li key={r}>
                  <a
                    href={r}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-mono text-[#00fff9] hover:underline inline-flex items-center gap-1"
                  >
                    {r} <ExternalLink size={10} />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
