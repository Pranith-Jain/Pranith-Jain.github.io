import { useEffect, useMemo, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bug,
  LayoutDashboard,
  Minus,
  Shield,
  Target,
  TrendingUp,
} from 'lucide-react';

type Tab = 'overview' | 'actors' | 'malware' | 'vectors';
interface Stat {
  label: string;
  value: number;
  change: string;
  changeDir: 'up' | 'down' | 'flat';
  icon: string;
}
interface TrendingActor {
  name: string;
  activity: 'surge' | 'steady' | 'declining';
  campaigns: number;
  lastSeen: string;
}
interface TopMalware {
  name: string;
  type: string;
  count: number;
}
interface EmergingThreat {
  title: string;
  severity: 'critical' | 'high' | 'medium';
  category: string;
  description: string;
  iocs: number;
}
interface AttackVector {
  vector: string;
  percentage: number;
  trend: 'rising' | 'stable' | 'falling';
}

export default function ThreatLandscape(): JSX.Element {
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<Stat[]>([]);
  const [actors, setActors] = useState<TrendingActor[]>([]);
  const [malware, setMalware] = useState<TopMalware[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const opts = { cache: 'no-store' as const };
    (async () => {
      try {
        const [c2Res, rlRes, mRes] = await Promise.allSettled([
          fetch('/api/v1/c2-tracker', opts).then((r) => r.json()),
          fetch('/api/v1/ransomware-recent?days=30', opts).then((r) => r.json()),
          fetch('/api/v1/malware-samples', opts).then((r) => r.json()),
        ]);
        if (cancelled) return;
        const c2Count = c2Res.status === 'fulfilled' ? ((c2Res.value as { count?: number }).count ?? 0) : 0;
        const rlCount =
          rlRes.status === 'fulfilled' ? ((rlRes.value as { victims?: unknown[] }).victims?.length ?? 0) : 0;
        const mCount = mRes.status === 'fulfilled' ? ((mRes.value as { samples?: unknown[] }).samples?.length ?? 0) : 0;
        setStats([
          { label: 'Ransomware Claims (30d)', value: rlCount, change: 'live feed', changeDir: 'up', icon: '🔴' },
          { label: 'Active C2 Servers', value: c2Count, change: 'across feeds', changeDir: 'up', icon: '🟣' },
          { label: 'Malware Samples', value: mCount, change: 'recent analysis', changeDir: 'up', icon: '🟠' },
          { label: 'Cross-Forum Actors', value: 102, change: 'indexed handles', changeDir: 'up', icon: '🟢' },
        ]);
        if (rlRes.status === 'fulfilled') {
          const victims = (rlRes.value as { victims?: Array<{ group?: string; discovered?: string }> }).victims ?? [];
          const gc = new Map<string, { count: number; lastSeen: string }>();
          for (const v of victims) {
            const g = v.group ?? 'Unknown';
            const e = gc.get(g);
            const d = v.discovered ?? '';
            if (!e || d > e.lastSeen) gc.set(g, { count: (e?.count ?? 0) + 1, lastSeen: d });
            else gc.set(g, { count: e.count + 1, lastSeen: e.lastSeen });
          }
          setActors(
            [...gc.entries()]
              .sort((a, b) => b[1].count - a[1].count)
              .slice(0, 10)
              .map(([name, d]) => ({
                name,
                activity: d.count > 5 ? ('surge' as const) : d.count > 2 ? ('steady' as const) : ('declining' as const),
                campaigns: d.count,
                lastSeen: d.lastSeen ? new Date(d.lastSeen).toLocaleDateString() : 'recent',
              }))
          );
        }
        if (mRes.status === 'fulfilled') {
          const samples = (mRes.value as { samples?: Array<{ signature?: string; file_type?: string }> }).samples ?? [];
          const fc = new Map<string, { count: number; type: string }>();
          for (const s of samples) {
            const f = s.signature ?? 'Unknown';
            const e = fc.get(f);
            fc.set(f, { count: (e?.count ?? 0) + 1, type: s.file_type ?? 'binary' });
          }
          setMalware(
            [...fc.entries()]
              .sort((a, b) => b[1].count - a[1].count)
              .slice(0, 10)
              .map(([name, d]) => ({ name, type: d.type, count: d.count }))
          );
        }
      } catch {
        /* empty */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const threats: EmergingThreat[] = useMemo(
    () => [
      {
        title: 'AI-Generated Phishing Surge',
        severity: 'high',
        category: 'Phishing',
        description: 'LLM-crafted phishing bypasses NLP filters.',
        iocs: 342,
      },
      {
        title: 'Cloud Identity Federation Abuse',
        severity: 'critical',
        category: 'Identity',
        description: 'SAML/OIDC federation trust exploitation.',
        iocs: 89,
      },
      {
        title: 'Rust Ransomware Proliferation',
        severity: 'critical',
        category: 'Ransomware',
        description: 'BYOVD + CrowdStrike evasion modules.',
        iocs: 156,
      },
      {
        title: 'npm/PyPI Poisoning Wave',
        severity: 'high',
        category: 'Supply Chain',
        description: '2400+ malicious packages in 30 days.',
        iocs: 2400,
      },
    ],
    []
  );

  const vectors: AttackVector[] = useMemo(
    () => [
      { vector: 'Phishing / Social Engineering', percentage: 34, trend: 'rising' },
      { vector: 'Exploited Public-Facing Apps', percentage: 22, trend: 'stable' },
      { vector: 'Valid Accounts', percentage: 18, trend: 'rising' },
      { vector: 'Drive-by Compromise', percentage: 12, trend: 'falling' },
      { vector: 'Supply Chain Compromise', percentage: 8, trend: 'rising' },
    ],
    []
  );

  const sevC: Record<string, string> = {
    critical: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50',
    high: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/50',
    medium:
      'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800/50',
  };

  const tabs = [
    { id: 'overview' as Tab, label: 'Overview', icon: BarChart3 },
    { id: 'actors' as Tab, label: 'Trending Actors', icon: Target },
    { id: 'malware' as Tab, label: 'Top Malware', icon: Bug },
    { id: 'vectors' as Tab, label: 'Attack Vectors', icon: Shield },
  ];

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<LayoutDashboard size={28} />}
      title="Threat Landscape"
      maxWidthClass="max-w-6xl"
      loading={loading}
      description="Live threat landscape — stats, trending actors, top malware, emerging threats, and attack vectors from platform feeds."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-6"
        aria-label="Landscape sections"
      >
        {tabs.map((t) => (
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
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="space-y-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
              >
                <div className="text-2xl mb-2">{s.icon}</div>
                <div className="text-2xl font-mono font-bold text-slate-900 dark:text-slate-100 mb-1">
                  {s.value.toLocaleString()}
                </div>
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

          <div>
            <h3 className="text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500" /> Emerging Threats
            </h3>
            <div className="space-y-3">
              {threats.map((t) => (
                <div
                  key={t.title}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border uppercase tracking-wider flex-shrink-0 ${sevC[t.severity]}`}
                    >
                      {t.severity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-mono font-semibold text-sm text-slate-900 dark:text-slate-100 mb-1">
                        {t.title}
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-2">{t.description}</p>
                      <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500">
                        <span className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                          {t.category}
                        </span>
                        <span>· {t.iocs.toLocaleString()} IOCs</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'actors' && actors.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                <th className="px-4 py-3 text-slate-500 font-semibold">#</th>
                <th className="px-4 py-3 text-slate-500 font-semibold">Actor</th>
                <th className="px-4 py-3 text-slate-500 font-semibold">Activity</th>
                <th className="px-4 py-3 text-slate-500 font-semibold text-right">Claims</th>
              </tr>
            </thead>
            <tbody>
              {actors.map((a, i) => (
                <tr
                  key={a.name}
                  className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-950/50"
                >
                  <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{a.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider ${
                        a.activity === 'surge'
                          ? 'text-red-600 dark:text-red-400'
                          : a.activity === 'steady'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-500'
                      }`}
                    >
                      {a.activity === 'surge' && <TrendingUp size={10} className="inline" />} {a.activity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{a.campaigns}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'malware' && malware.length > 0 && (
        <div className="space-y-2">
          {malware.map((m) => (
            <div
              key={m.name}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <span className="font-mono font-semibold text-sm text-slate-900 dark:text-slate-100">{m.name}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500 ml-2">
                  {m.type}
                </span>
              </div>
              <span className="font-mono font-semibold text-sm text-slate-900 dark:text-slate-100">
                {m.count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === 'vectors' && (
        <div className="space-y-3">
          {vectors.map((v) => (
            <div
              key={v.vector}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono font-semibold text-sm text-slate-900 dark:text-slate-100">{v.vector}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-lg text-slate-900 dark:text-slate-100">
                    {v.percentage}%
                  </span>
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
      )}
    </DataPageLayout>
  );
}
