import { useEffect, useState } from 'react';
import { postJson } from './adminApi';
import AdminLogin from './AdminLogin';
import PendingTab from './PendingTab';
import ApprovedTab from './ApprovedTab';
import ScheduleTab from './ScheduleTab';
import DraftsTab from './DraftsTab';
import PublishedTab from './PublishedTab';
import FailedTab from './FailedTab';
import HealthTab from './HealthTab';
import ManualTab from './ManualTab';

type TabKey = 'pending' | 'approved' | 'schedule' | 'drafts' | 'published' | 'failed' | 'health' | 'manual';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Queue' },
  { key: 'schedule', label: 'Schedule' },
  // Drafts sits between Schedule and Published — that's the order the
  // pipeline transitions through when the approval gate is on.
  { key: 'drafts', label: 'Drafts' },
  { key: 'published', label: 'Published' },
  { key: 'manual', label: 'Manual' },
  { key: 'failed', label: 'Failed' },
  { key: 'health', label: 'Health' },
];

const STAGES: Array<{ stage: 'discover' | 'plan' | 'publish'; label: string; hint: string }> = [
  { stage: 'discover', label: 'Run discovery', hint: 'Populate the pending queue now (normally daily cron)' },
  { stage: 'plan', label: 'Run planner', hint: 'Schedule approved candidates now (normally weekly cron)' },
  { stage: 'publish', label: 'Publish now', hint: 'Generate + publish the next due slot (normally hourly cron)' },
];

function PipelineBar() {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(stage: string) {
    setBusy(stage);
    setMsg(null);
    try {
      const r = await postJson<{ ok?: boolean; stage?: string; result?: unknown; error?: string }>(`/run/${stage}`);
      setMsg(r.error ? `${stage}: ${r.error}` : `${stage}: done — ${JSON.stringify(r.result ?? 'ok')}`);
    } catch (e) {
      setMsg(`${stage}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-6 rounded border border-zinc-800 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-zinc-500 mr-1">Pipeline</span>
        {STAGES.map((s) => (
          <button
            key={s.stage}
            onClick={() => run(s.stage)}
            disabled={busy !== null}
            title={s.hint}
            className="px-3 py-1 border border-zinc-700 rounded text-sm hover:bg-zinc-800 disabled:opacity-50"
          >
            {busy === s.stage ? `${s.label}…` : s.label}
          </button>
        ))}
      </div>
      {msg && <p className="mt-2 text-xs font-mono text-zinc-400 break-all">{msg}</p>}
    </div>
  );
}

export default function AdminApp() {
  const [authed, setAuthed] = useState(false);
  const [active, setActive] = useState<TabKey>('pending');

  useEffect(() => {
    // Read on mount only; subsequent changes go through onLogin / logout.
    if (localStorage.getItem('adminToken')) setAuthed(true);
  }, []);

  function logout() {
    localStorage.removeItem('adminToken');
    // Full reload guarantees every tab's in-flight fetch is dropped and that
    // any cached state is cleared — simpler than trying to reset per-tab.
    window.location.reload();
  }

  if (!authed) {
    return <AdminLogin onLogin={() => setAuthed(true)} />;
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Case Study Admin</h1>
        <button onClick={logout} className="px-3 py-1 border border-zinc-700 rounded text-sm hover:bg-zinc-800">
          Logout
        </button>
      </div>
      <PipelineBar />
      <nav className="flex flex-wrap gap-1 border-b border-zinc-800 mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={
              active === t.key
                ? 'px-4 py-2 text-sm font-medium border-b-2 border-zinc-100 -mb-px text-zinc-100'
                : 'px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200'
            }
          >
            {t.label}
          </button>
        ))}
      </nav>
      <section>
        {active === 'pending' && <PendingTab />}
        {active === 'approved' && <ApprovedTab />}
        {active === 'schedule' && <ScheduleTab />}
        {active === 'drafts' && <DraftsTab />}
        {active === 'published' && <PublishedTab />}
        {active === 'failed' && <FailedTab />}
        {active === 'health' && <HealthTab />}
        {active === 'manual' && <ManualTab />}
      </section>
    </main>
  );
}
