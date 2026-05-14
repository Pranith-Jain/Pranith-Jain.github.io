import { useEffect, useState } from 'react';
import AdminLogin from './AdminLogin';
import PendingTab from './PendingTab';
import ApprovedTab from './ApprovedTab';
import ScheduleTab from './ScheduleTab';
import PublishedTab from './PublishedTab';
import FailedTab from './FailedTab';
import HealthTab from './HealthTab';

type TabKey = 'pending' | 'approved' | 'schedule' | 'published' | 'failed' | 'health';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Queue' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'published', label: 'Published' },
  { key: 'failed', label: 'Failed' },
  { key: 'health', label: 'Health' },
];

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
        {active === 'published' && <PublishedTab />}
        {active === 'failed' && <FailedTab />}
        {active === 'health' && <HealthTab />}
      </section>
    </main>
  );
}
