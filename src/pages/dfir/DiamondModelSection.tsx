import { ThreatActor } from '../../data/dfir/threat-actors';

interface Props {
  actor: ThreatActor;
}

const VERTICES = [
  {
    id: 'adversary',
    label: 'Adversary',
    value: (a: ThreatActor) => (a.aliases.length > 0 ? `${a.name} (aka ${a.aliases.join(', ')})` : a.name),
    x: 150,
    y: 18,
  },
  {
    id: 'capability',
    label: 'Capability',
    value: (a: ThreatActor) => {
      const parts: string[] = [];
      if (a.malware.length > 0) parts.push(`malware: ${a.malware.join(', ')}`);
      if (a.techniques.length > 0) parts.push(`TTPs: ${a.techniques.join(', ')}`);
      return parts.length > 0 ? parts.join(' \u00b7 ') : '(no tooling data)';
    },
    x: 282,
    y: 150,
  },
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    value: () => '(no data)',
    x: 18,
    y: 150,
  },
  {
    id: 'victim',
    label: 'Victim',
    value: (a: ThreatActor) => a.targets.join(', '),
    x: 150,
    y: 282,
  },
];

export default function DiamondModelSection({ actor }: Props): JSX.Element {
  return (
    <section className="mb-8 rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] p-6">
      <h2 className="font-display font-bold text-lg mb-4">Diamond Model Analysis</h2>

      <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
        {/* ─── SVG diamond ─── */}
        <div className="flex items-center justify-center">
          <svg
            viewBox="0 0 300 300"
            className="w-full h-auto max-w-[260px]"
            role="img"
            aria-label="Diamond model for threat actor"
          >
            {/* Diamond outline */}
            <polygon
              points="150,30 270,150 150,270 30,150"
              fill="none"
              className="stroke-slate-300 dark:stroke-slate-700"
              strokeWidth="2"
            />
            {/* Diagonals */}
            <line
              x1="150"
              y1="30"
              x2="150"
              y2="270"
              className="stroke-slate-300 dark:stroke-slate-700"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <line
              x1="30"
              y1="150"
              x2="270"
              y2="150"
              className="stroke-slate-300 dark:stroke-slate-700"
              strokeWidth="1"
              strokeDasharray="4 4"
            />

            {VERTICES.map((v) => (
              <g key={v.id}>
                <circle cx={v.x} cy={v.y} r={34} className="fill-brand-500/20 stroke-brand-500" strokeWidth="2" />
                <text
                  x={v.x}
                  y={v.y - 4}
                  textAnchor="middle"
                  className="font-display font-semibold fill-slate-900 dark:fill-slate-100"
                  style={{ fontSize: 10 }}
                >
                  {v.label}
                </text>
                <text
                  x={v.x}
                  y={v.y + 12}
                  textAnchor="middle"
                  className="font-mono fill-emerald-600 dark:fill-emerald-400"
                  style={{ fontSize: 7.5 }}
                >
                  filled
                </text>
              </g>
            ))}
          </svg>
        </div>

        {/* ─── Vertex details + meta-features ─── */}
        <div className="space-y-3">
          <div className="space-y-2">
            {VERTICES.map((v) => (
              <div key={v.id}>
                <span className="text-micro font-mono font-semibold text-brand-600 dark:text-brand-400 uppercase tracking-wider">
                  {v.label}
                </span>
                <p className="text-sm font-mono text-slate-700 dark:text-slate-300 leading-relaxed break-words">
                  {v.value(actor)}
                </p>
              </div>
            ))}
          </div>

          <hr className="border-slate-200 dark:border-[#1e2030]" />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-micro font-mono font-semibold uppercase tracking-wider text-slate-500">Motivation</p>
              <p className="text-xs font-mono text-slate-900 dark:text-slate-100 mt-0.5">{actor.motivation}</p>
            </div>
            <div>
              <p className="text-micro font-mono font-semibold uppercase tracking-wider text-slate-500">Active Since</p>
              <p className="text-xs font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                {actor.active_since || '\u2014'}
              </p>
            </div>
            <div>
              <p className="text-micro font-mono font-semibold uppercase tracking-wider text-slate-500">
                Sophistication
              </p>
              <p className="text-xs font-mono capitalize text-slate-900 dark:text-slate-100 mt-0.5">
                {actor.sophistication}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
