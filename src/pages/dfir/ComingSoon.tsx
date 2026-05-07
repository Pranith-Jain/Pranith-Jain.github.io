import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface Props {
  title: string;
  description: string;
}

export function ComingSoon({ title, description }: Props): JSX.Element {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa]">
      <section className="max-w-3xl mx-auto px-8 py-20">
        <Link
          to="/dfir"
          className="inline-flex items-center gap-2 text-sm text-[#a1a1aa] hover:text-[#00fff9] transition-colors mb-12 font-mono"
        >
          <ArrowLeft size={14} />
          /dfir
        </Link>

        <span className="inline-block text-xs uppercase tracking-[0.2em] text-[#00fff9] font-mono mb-4">
          Coming soon
        </span>

        <h1 className="text-4xl sm:text-5xl font-display font-bold mb-6 leading-tight">{title}</h1>

        <p className="text-lg text-[#a1a1aa] leading-relaxed max-w-2xl">{description}</p>

        <div className="mt-12 pt-8 border-t border-[#1f1f23]">
          <p className="text-sm text-[#71717a] font-mono">
            Status: <span className="text-[#00fff9]">scheduled · phase 2</span>
          </p>
        </div>
      </section>
    </div>
  );
}
