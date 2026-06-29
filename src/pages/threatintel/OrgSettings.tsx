import { useState, useEffect } from 'react';
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
  const [showCreate, setShowCreate] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgDesc, setNewOrgDesc] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchOrgs();
  }, []);

  const fetchOrgs = async () => {
    try {
      const res = await fetch('/api/v1/orgs');
      const data = await res.json();
      setOrgs(data.organizations || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async (slug: string) => {
    try {
      const res = await fetch(`/api/v1/orgs/${slug}/members`);
      const data = await res.json();
      setMembers(data.members || []);
    } catch {
      // ignore
    }
  };

  const createOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/v1/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newOrgName, description: newOrgDesc }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setOrgs([...orgs, data.organization]);
      setShowCreate(false);
      setNewOrgName('');
      setNewOrgDesc('');
    } catch {
      setError('Failed to create organization');
    }
  };

  const inviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;
    setError('');
    try {
      const res = await fetch(`/api/v1/orgs/${selectedOrg.slug}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      fetchMembers(selectedOrg.slug);
      setInviteEmail('');
    } catch {
      setError('Failed to invite member');
    }
  };

  const removeMember = async (userId: string) => {
    if (!selectedOrg) return;
    try {
      await fetch(`/api/v1/orgs/${selectedOrg.slug}/members/${userId}`, {
        method: 'DELETE',
      });
      fetchMembers(selectedOrg.slug);
    } catch {
      // ignore
    }
  };

  if (!user) {
    return <div className="p-8 text-center text-slate-500">Please sign in to manage organizations.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Organization Settings</h1>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Org List */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Organizations</h2>
              <button
                onClick={() => setShowCreate(true)}
                className="text-xs font-mono px-2 py-1 rounded bg-brand-500/10 text-brand-600 dark:text-brand-400 hover:bg-brand-500/20"
              >
                + New
              </button>
            </div>

            {showCreate && (
              <form
                onSubmit={createOrg}
                className="mb-4 p-3 rounded-lg bg-slate-50 dark:bg-[rgb(var(--surface-300))] space-y-2"
              >
                <input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="Organization name"
                  required
                  className="w-full px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  value={newOrgDesc}
                  onChange={(e) => setNewOrgDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-slate-900 dark:text-white"
                />
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 px-3 py-1.5 text-xs rounded bg-brand-500 text-white">
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="px-3 py-1.5 text-xs rounded bg-slate-200 dark:bg-[rgb(var(--surface-300))] text-slate-600 dark:text-slate-400"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {loading ? (
              <div className="text-xs text-slate-400">Loading...</div>
            ) : orgs.length === 0 ? (
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
                        : 'hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] text-slate-600 dark:text-slate-400'
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
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 p-4">
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
                  className="flex-1 px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-slate-900 dark:text-white"
                />
                <button type="submit" className="px-3 py-1.5 text-xs rounded bg-brand-500 text-white">
                  Invite
                </button>
              </form>

              <div className="space-y-1">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))]"
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
                        className="text-xs text-rose-500 hover:text-rose-600"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 p-8 text-center text-slate-400 text-sm">
              Select an organization to manage members
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
