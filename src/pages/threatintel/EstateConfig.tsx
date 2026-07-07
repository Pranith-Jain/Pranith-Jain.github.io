import { useEffect, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Shield, Save, Plus, Trash2, Globe, Server, Cloud } from 'lucide-react';

interface EstateConfig {
  sector: string;
  sub_sector: string;
  region: string;
  tech_stack: string[];
  priorities: string[];
  data_types: string[];
}

interface EstateAsset {
  id: string;
  asset_type: string;
  value: string;
  label: string;
  tags: string[];
  criticality: string;
  created_at: string;
}

const SECTORS = [
  { id: '', label: 'Select sector...' },
  { id: 'financial-services', label: 'Financial Services' },
  { id: 'healthcare', label: 'Healthcare' },
  { id: 'government', label: 'Government' },
  { id: 'technology', label: 'Technology' },
  { id: 'defense', label: 'Defense' },
  { id: 'retail', label: 'Retail' },
  { id: 'manufacturing', label: 'Manufacturing' },
  { id: 'telecommunications', label: 'Telecommunications' },
  { id: 'energy', label: 'Energy' },
  { id: 'education', label: 'Education' },
  { id: 'media', label: 'Media' },
  { id: 'legal', label: 'Legal' },
  { id: 'nonprofit', label: 'Nonprofit' },
  { id: 'other', label: 'Other' },
];

const REGIONS = [
  { id: '', label: 'Select region...' },
  { id: 'north-america', label: 'North America' },
  { id: 'south-america', label: 'South America' },
  { id: 'europe', label: 'Europe' },
  { id: 'asia-pacific', label: 'Asia Pacific' },
  { id: 'middle-east', label: 'Middle East' },
  { id: 'africa', label: 'Africa' },
  { id: 'global', label: 'Global' },
];

const DATA_TYPES = [
  { id: 'pii', label: 'PII' },
  { id: 'phi', label: 'PHI' },
  { id: 'financial', label: 'Financial Data' },
  { id: 'intellectual-property', label: 'Intellectual Property' },
  { id: 'credentials', label: 'Credentials' },
  { id: 'cardholder-data', label: 'Cardholder Data' },
  { id: 'classified', label: 'Classified' },
  { id: 'source-code', label: 'Source Code' },
  { id: 'customer-records', label: 'Customer Records' },
  { id: 'internal-comms', label: 'Internal Comms' },
];

const ASSET_TYPE_ICONS: Record<string, typeof Shield> = {
  domain: Globe,
  ip: Globe,
  cidr: Globe,
  app: Server,
  service: Server,
  cloud: Cloud,
  endpoint: Server,
  identity: Shield,
  other: Shield,
};

export default function EstateConfig() {
  const [config, setConfig] = useState<EstateConfig>({
    sector: '',
    sub_sector: '',
    region: '',
    tech_stack: [],
    priorities: [],
    data_types: [],
  });
  const [assets, setAssets] = useState<EstateAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newAsset, setNewAsset] = useState({ asset_type: 'domain', value: '', label: '', criticality: 'medium' });
  const [techInput, setTechInput] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [configRes, assetsRes] = await Promise.all([
        fetch('/api/v1/estate/config'),
        fetch('/api/v1/estate/assets'),
      ]);
      if (!configRes.ok || !assetsRes.ok) throw new Error('Failed to load estate data');
      const configData = await configRes.json();
      const assetsData = await assetsRes.json();
      setConfig(configData);
      setAssets(assetsData.assets ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load estate data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/v1/estate/config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error('Failed to save');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const addAsset = async () => {
    if (!newAsset.value.trim()) return;
    try {
      const res = await fetch('/api/v1/estate/assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(newAsset),
      });
      if (!res.ok) throw new Error('Failed to add asset');
      setNewAsset({ asset_type: 'domain', value: '', label: '', criticality: 'medium' });
      const d = await fetch('/api/v1/estate/assets').then((r) => r.json());
      setAssets(d.assets ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add asset');
    }
  };

  const deleteAsset = async (id: string) => {
    try {
      await fetch(`/api/v1/estate/assets/${id}`, { method: 'DELETE' });
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete asset');
    }
  };

  const addTech = (t: string) => {
    const v = t.trim();
    if (v && !config.tech_stack.includes(v)) {
      setConfig((prev) => ({ ...prev, tech_stack: [...prev.tech_stack, v] }));
    }
    setTechInput('');
  };

  const toggleDataType = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      data_types: prev.data_types.includes(id) ? prev.data_types.filter((d) => d !== id) : [...prev.data_types, id],
    }));
  };

  return (
    <DataPageLayout
      backTo="/threatintel"
      title="Estate Configuration"
      description="Define your organisation's sector, region, tech stack, and assets for personalised threat intelligence correlation."
      icon={<Shield />}
      loading={loading}
      error={error}
      onRetry={loadData}
    >
      {/* Profile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="rounded-xl border border-slate-200/60 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
          <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-500 mb-4">Organisation Profile</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Sector</label>
              <select
                value={config.sector}
                onChange={(e) => setConfig((prev) => ({ ...prev, sector: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              >
                {SECTORS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Sub-Sector</label>
              <input
                value={config.sub_sector}
                onChange={(e) => setConfig((prev) => ({ ...prev, sub_sector: e.target.value }))}
                placeholder="e.g. Payment Processing, Cloud Security"
                className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Region</label>
              <select
                value={config.region}
                onChange={(e) => setConfig((prev) => ({ ...prev, region: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              >
                {REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/60 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
          <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-500 mb-4">Tech Stack</h3>
          <div className="flex gap-2 mb-3">
            <input
              value={techInput}
              onChange={(e) => setTechInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTech(techInput))}
              placeholder="Add technology (e.g. AWS, Azure, Kubernetes)"
              className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
            <button
              onClick={() => addTech(techInput)}
              className="px-3 py-2 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {config.tech_stack.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-xs font-medium"
              >
                {t}
                <button
                  onClick={() => setConfig((prev) => ({ ...prev, tech_stack: prev.tech_stack.filter((x) => x !== t) }))}
                  className="hover:text-red-500"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>

          <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-500 mt-6 mb-3">Data Types</h3>
          <div className="flex flex-wrap gap-2">
            {DATA_TYPES.map((dt) => (
              <button
                key={dt.id}
                onClick={() => toggleDataType(dt.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  config.data_types.includes(dt.id)
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-amber-300'
                }`}
              >
                {dt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={saveConfig}
        disabled={saving}
        className="mb-8 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
      >
        <Save size={16} /> {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Configuration'}
      </button>

      {/* Assets */}
      <div className="rounded-xl border border-slate-200/60 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 mb-8">
        <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-500 mb-4">Monitored Assets</h3>
        <div className="flex flex-wrap gap-3 mb-6 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50">
          <select
            value={newAsset.asset_type}
            onChange={(e) => setNewAsset((prev) => ({ ...prev, asset_type: e.target.value }))}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          >
            <option value="domain">Domain</option>
            <option value="ip">IP</option>
            <option value="cidr">CIDR Range</option>
            <option value="app">Application</option>
            <option value="service">Service</option>
            <option value="cloud">Cloud Account</option>
            <option value="endpoint">Endpoint</option>
            <option value="identity">Identity</option>
          </select>
          <input
            value={newAsset.value}
            onChange={(e) => setNewAsset((prev) => ({ ...prev, value: e.target.value }))}
            placeholder="Value (domain, IP, account ID...)"
            className="flex-1 min-w-[200px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
          <input
            value={newAsset.label}
            onChange={(e) => setNewAsset((prev) => ({ ...prev, label: e.target.value }))}
            placeholder="Label (optional)"
            className="w-40 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
          <select
            value={newAsset.criticality}
            onChange={(e) => setNewAsset((prev) => ({ ...prev, criticality: e.target.value }))}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          >
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <button
            onClick={addAsset}
            className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
          >
            <Plus size={16} /> Add
          </button>
        </div>

        {assets.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">
            No assets added yet. Add your first domain, IP, or cloud account above.
          </p>
        ) : (
          <div className="space-y-2">
            {assets.map((a) => {
              const Icon = ASSET_TYPE_ICONS[a.asset_type] ?? Globe;
              return (
                <div
                  key={a.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30"
                >
                  <Icon size={18} className="text-slate-400" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{a.label || a.value}</span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                          a.criticality === 'critical'
                            ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                            : a.criticality === 'high'
                              ? 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400'
                              : a.criticality === 'medium'
                                ? 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400'
                                : 'bg-slate-50 text-slate-500 dark:bg-white/5'
                        }`}
                      >
                        {a.criticality}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 font-mono">{a.value}</div>
                  </div>
                  <button
                    onClick={() => deleteAsset(a.id)}
                    className="p-1.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DataPageLayout>
  );
}
