import { useState } from 'react';
import type { DomainLookupResponse } from '../../lib/dfir/types';

export function CertList({ certs }: { certs: DomainLookupResponse['certificates'] }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? certs : certs.slice(0, 10);
  return (
    <section className="rounded-2xl border border-[#1f1f23] bg-[#111113] p-6">
      <h3 className="font-display font-bold text-lg mb-3">
        Certificate Transparency <span className="text-sm font-mono text-[#a1a1aa]">({certs.length} entries)</span>
      </h3>
      <div className="space-y-2">
        {visible.map((c) => (
          <div key={c.id} className="rounded-lg border border-[#1f1f23] p-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-display font-semibold text-[#fafafa]">{c.issuer}</span>
              <span className="font-mono text-xs text-[#a1a1aa]">
                {c.not_before.slice(0, 10)} → {c.not_after.slice(0, 10)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {c.subjects.slice(0, 4).map((s) => (
                <span
                  key={s}
                  className="text-xs font-mono px-1.5 py-0.5 rounded bg-[#0a0a0a] text-[#a1a1aa] border border-[#1f1f23] break-all"
                >
                  {s}
                </span>
              ))}
              {c.subjects.length > 4 && (
                <span className="text-xs font-mono text-[#71717a]">+{c.subjects.length - 4} more</span>
              )}
            </div>
          </div>
        ))}
      </div>
      {certs.length > 10 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-xs font-mono text-[#00fff9] hover:underline"
        >
          {expanded ? 'show less' : `show all ${certs.length}`}
        </button>
      )}
    </section>
  );
}
