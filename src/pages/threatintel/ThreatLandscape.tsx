import { useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bug,
  LayoutDashboard,
  Minus,
  Shield,
  Target,
  TrendingUp,
} from 'lucide-react';
import {
  LANDSCAPE_STATS,
  TRENDING_ACTORS,
  TOP_MALWARE,
  EMERGING_THREATS,
  ATTACK_VECTORS,
} from '../../data/threatintel/threat-landscape';

type Tab = 'overview' | 'actors' | 'malware' | 'vectors';

export default function ThreatLandscape(): JSX.Element {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<LayoutDashboard size={28} />}
      title="Threat Landscape"
      maxWidthClass="max-w-6xl"
      description="Current threat landscape overview — key statistics, trending actors, top malware families, emerging threats, and attack vector distribution. Updated from live platform data."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-6"
        aria-label="Landscape sections"
      >
        {[
          { id: 'overview' as Tab, label: 'Overview', icon: BarChart3 },
          { id: 'actors' as Tab, label: 'Trending Actors', icon: Target },
          { id: 'malware' as Tab, label: 'Top Malware', icon: Bug },
          { id: 'vectors' as Tab, label: 'Attack Vectors', icon: Shield },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 font-mono text-sm font-semibold transition-colors ${
              tab === t.id
                ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'actors' && <ActorsTab />}
      {tab === 'malware' && <MalwareTab />}
      {tab === 'vectors' && <VectorsTab />}
    </DataPageLayout>
  );
}

function OverviewTab(): JSX.Element {
  return (
    <div className="space-y-8">
      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {LANDSCAPE_STATS.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
          >
            <div className="text-2xl mb-2">{s.icon}</div>
            <div className="text-2xl font-mono font-bold text-slate-900 dark:text-slate-100 mb-1">{s.value}</div>
            <div className="text-xs font-mono text-slate-500 mb-2">{s.label}</div>
            <div
              className={`flex items-center gap-1 text-[11px] font-mono ${
                s.changeDir === 'up'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : s.changeDir === 'down'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-500'
              }`}
            >
              {s.changeDir === 'up' && <ArrowUpRight size={12} />}
              {s.changeDir === 'down' && <ArrowDownRight size={12} />}
              {s.changeDir === 'flat' && <Minus size={12} />}
              {s.change}
            </div>
          </div>
        ))}
      </div>

      {/* Emerging threats */}
      <div>
        <h3 className="text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-500" />
          Emerging Threats
        </h3>
        <div className="space-y-3">
          {EMERGING_THREATS.map((t) => (
            <div
              key={t.title}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
            >
              <div className="flex items-start gap-3">
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded border uppercase tracking-wider flex-shrink-0 ${
                    t.severity === 'critical'
                      ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50'
                      : t.severity === 'high'
                        ? 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/50'
                        : 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800/50'
                  }`}
                >
                  {t.severity === 'critical' && <AlertTriangle size={9} />}
                  {t.severity}
                </span>
                <div className="flex-1 min-w-0">
                  <h4 className="font-mono font-semibold text-sm text-slate-900 dark:text-slate-100 mb-1">{t.title}</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-2">{t.description}</p>
                  <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500">
                    <span className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                      {t.category}
                    </span>
                    <span>First seen: {t.firstSeen}</span>
                    <span>·</span>
                    <span>{t.iocs.toLocaleString()} IOCs</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActorsTab(): JSX.Element {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <table className="w-full text-left font-mono text-xs">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
            <th className="px-4 py-3 text-slate-500 font-semibold uppercase tracking-wider">#</th>
            <th className="px-4 py-3 text-slate-500 font-semibold uppercase tracking-wider">Actor</th>
            <th className="px-4 py-3 text-slate-500 font-semibold uppercase tracking-wider">Country</th>
            <th className="px-4 py-3 text-slate-500 font-semibold uppercase tracking-wider">Activity</th>
            <th className="px-4 py-3 text-slate-500 font-semibold uppercase tracking-wider text-right">Campaigns</th>
            <th className="px-4 py-3 text-slate-500 font-semibold uppercase tracking-wider text-right">Last Seen</th>
          </tr>
        </thead>
        <tbody>
          {TRENDING_ACTORS.map((a, i) => (
            <tr
              key={a.name}
              className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-colors"
            >
              <td className="px-4 py-3 text-slate-400">{i + 1}</td>
              <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{a.name}</td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{a.country}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${
                    a.activity === 'surge'
                      ? 'text-red-600 dark:text-red-400'
                      : a.activity === 'steady'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-500'
                  }`}
                >
                  {a.activity === 'surge' && <TrendingUp size={10} />}
                  {a.activity === 'declining' && <ArrowDownRight size={10} />}
                  {a.activity}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{a.campaigns}</td>
              <td className="px-4 py-3 text-right text-slate-500">{a.lastSeen}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MalwareTab(): JSX.Element {
  const maxDetections = Math.max(...TOP_MALWARE.map((m) => m.detections7d));
  return (
    <div className="space-y-2">
      {TOP_MALWARE.map((m) => (
        <div
          key={m.name}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center gap-4"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono font-semibold text-sm text-slate-900 dark:text-slate-100">{m.name}</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500">
                {m.type}
              </span>
            </div>
            <div className="text-[11px] font-mono text-slate-500 mb-2">{m.family}</div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all duration-500"
                style={{ width: `${(m.detections7d / maxDetections) * 100}%` }}
              />
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="font-mono font-semibold text-sm text-slate-900 dark:text-slate-100">
              {m.detections7d.toLocaleString()}
            </div>
            <div
              className={`text-[11px] font-mono ${m.changePercent > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}
            >
              {m.changePercent > 0 ? '+' : ''}
              {m.changePercent}% 7d
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function VectorsTab(): JSX.Element {
  return (
    <div className="space-y-3">
      {ATTACK_VECTORS.map((v) => (
        <div
          key={v.vector}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono font-semibold text-sm text-slate-900 dark:text-slate-100">{v.vector}</span>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-lg text-slate-900 dark:text-slate-100">{v.percentage}%</span>
              <span
                className={`text-[10px] font-mono uppercase tracking-wider ${
                  v.trend === 'rising'
                    ? 'text-red-600 dark:text-red-400'
                    : v.trend === 'falling'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-500'
                }`}
              >
                {v.trend === 'rising' && <ArrowUpRight size={10} className="inline" />}
                {v.trend === 'falling' && <ArrowDownRight size={10} className="inline" />}
                {v.trend}
              </span>
            </div>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                v.trend === 'rising'
                  ? 'bg-gradient-to-r from-rose-600 to-rose-400'
                  : v.trend === 'falling'
                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-400'
                    : 'bg-gradient-to-r from-slate-500 to-slate-400'
              }`}
              style={{ width: `${v.percentage}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
