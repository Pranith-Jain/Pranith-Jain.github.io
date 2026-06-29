import { useState, useEffect } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Building2, Plus, UserMinus, Mail } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
}

interface OrgMember {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  display_name: string | null;
  email: string;
}

export default function OrgSettings() {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgDesc, setNewOrgDesc] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    fetchOrgs();
  }, []);

  const fetchOrgs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/orgs');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setOrgs(data.organizations || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async (slug: string) => {
    try {
      const res = await fetch(`/api/v1/orgs/${slug}/members`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMembers(data.members || []);
    } catch {
      // non-fatal
    }
  };

  const createOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError('');
    try {
      const res = await fetch('/api/v1/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newOrgName, description: newOrgDesc }),
      });
      const data = await res.json();
      if (data.error) {
        setActionError(data.error);
        return;
      }
      setOrgs([...orgs, data.organization]);
      setShowCreate(false);
      setNewOrgName('');
      setNewOrgDesc('');
    } catch {
      setActionError('Failed to create organization');
    }
  };

  const inviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;
    setActionError('');
    try {
      const res = await fetch(`/api/v1/orgs/${selectedOrg.slug}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail }),
      });
      const data = await res.json();
      if (data.error) {
        setActionError(data.error);
        return;
      }
      fetchMembers(selectedOrg.slug);
      setInviteEmail('');
    } catch {
      setActionError('Failed to invite member');
    }
  };

  const removeMember = async (userId: string) => {
    if (!selectedOrg) return;
    try {
      await fetch(`/api/v1/orgs/${selectedOrg.slug}/members/${userId}`, { method: 'DELETE' });
      fetchMembers(selectedOrg.slug);
    } catch {
      // ignore
    }
  };

  if (!user) {
    return (
      <DataPageLayout backTo="/threatintel" title="Organization Settings" icon={<Building2 />}>
        <div className="text-center text-slate-500 py-16">Please sign in to manage organizations.</div>
      </DataPageLayout>
    );
  }

  return (
    <DataPageLayout
      backTo="/threatintel"
      title="Organization Settings"
      description="Manage your organizations and invite team members."
      icon={<Building2 />}
      loading={loading}
      error={error}
      onRetry={fetchOrgs}
    >
      {actionError && (
        <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-sm">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Org List */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Organizations</h2>
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1 text-xs font-mono px-2 py-1 rounded bg-brand-500/10 text-brand-600 dark:text-brand-400 hover:bg-brand-500/20"
              >
                <Plus size={12} /> New
              </button>
            </div>

            {showCreate && (
              <form onSubmit={createOrg} className="mb-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 space-y-2">
                <input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="Organization name"
                  required
                  className="w-full px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
                <input
                  type="text"
                  value={newOrgDesc}
                  onChange={(e) => setNewOrgDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 px-3 py-1.5 text-xs rounded bg-brand-600 text-white hover:bg-brand-700"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="px-3 py-1.5 text-xs rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {orgs.length === 0 ? (
              <div className="text-xs text-slate-400 text-center py-4">No organizations yet</div>
            ) : (
              <div className="space-y-1">
                {orgs.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => {
                      setSelectedOrg(org);
                      fetchMembers(org.slug);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                      selectedOrg?.id === org.id
                        ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <div className="font-medium">{org.name}</div>
                    {org.description && (
                      <div className="text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-1">{org.description}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Members Panel */}
        <div className="lg:col-span-2">
          {selectedOrg ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
                {selectedOrg.name} — Members
              </h2>

              <form onSubmit={inviteMember} className="flex gap-2 mb-4">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Invite by email"
                  required
                  className="flex-1 px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded bg-brand-600 text-white hover:bg-brand-700"
                >
                  <Mail size={12} /> Invite
                </button>
              </form>

              <div className="space-y-1">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  >
                    <div>
                      <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        {m.display_name || m.email}
                      </div>
                      <div className="text-micro text-slate-400">
                        {m.email} · {m.role}
                      </div>
                    </div>
                    {m.user_id !== user.id && (
                      <button
                        onClick={() => removeMember(m.user_id)}
                        className="inline-flex items-center gap-1 text-xs text-rose-500 hover:text-rose-600"
                      >
                        <UserMinus size={12} /> Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 text-center text-slate-400 text-sm">
              Select an organization to manage members
            </div>
          )}
        </div>
      </div>
    </DataPageLayout>
  );
}
