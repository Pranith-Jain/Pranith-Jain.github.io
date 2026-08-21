import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import {
  Shield,
  RefreshCw,
  Loader2,
  ExternalLink,
  Eye,
  Target,
  Globe,
  Radio,
  BarChart3,
  Trash2,
  Settings,
  Bell,
  BellOff,
  Mail,
  Webhook,
  Download,
  TrendingUp,
  Database,
  FlaskConical,
} from 'lucide-react';
import {
  type AlertSettings,
  loadAlertSettings,
  saveAlertSettings,
  requestNotificationPermission,
  processAlerts,
} from '../../lib/threat-monitor-alerts';
import { exportCsv, exportJson } from '../../lib/threat-monitor-export';
import { APT_GROUPS, ALIAS_MAP } from '../../data/threat-monitor/apt-groups';
import { TECHNIQUES, KILL_CHAIN_STAGES, TACTIC_TO_KILLCHAIN } from '../../data/threat-monitor/mitre-attack';
import { OSINT_SOURCES } from '../../data/threat-monitor/osint-sources';

/* ── Types ── */
interface Detection {
  id: string;
  source: string;
  title: string;
  url: string;
  published: string;
  apt_groups: string[];
  techniques: { id: string; name: string; tactic: string; kill_chain: string }[];
  kill_chain_stages: string[];
  confidence: number;
  created_at: string;
}
interface ScanResult {
  newItems: number;
  relevant: number;
  alerted: number;
  errors: number;
  ts: string;
}

/* ── LocalStorage helpers ── */
const LS_KEY = 'tam_detections';
const LS_SCAN_KEY = 'tam_last_scan';
function loadDetections(): Detection[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function saveDetections(d: Detection[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(d.slice(0, 500)));
}
function loadLastScan(): ScanResult | null {
  try {
    return JSON.parse(localStorage.getItem(LS_SCAN_KEY) ?? 'null');
  } catch {
    return null;
  }
}
function saveLastScan(s: ScanResult) {
  localStorage.setItem(LS_SCAN_KEY, JSON.stringify(s));
}

/* ── XML Parser (browser-native) ── */
function parseFeedXML(xml: string): { title: string; link: string; published: string }[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const items: { title: string; link: string; published: string }[] = [];
  // RSS 2.0
  doc.querySelectorAll('item').forEach((el) => {
    const title = el.querySelector('title')?.textContent?.trim() ?? '';
    const link = el.querySelector('link')?.textContent?.trim() ?? '';
    const pub =
      el.querySelector('pubDate')?.textContent?.trim() ?? el.querySelector('published')?.textContent?.trim() ?? '';
    if (title) items.push({ title, link, published: pub });
  });
  // Atom
  doc.querySelectorAll('entry').forEach((el) => {
    const title = el.querySelector('title')?.textContent?.trim() ?? '';
    const linkEl = el.querySelector('link[rel="alternate"]') ?? el.querySelector('link');
    const link = linkEl?.getAttribute('href') ?? '';
    const pub =
      el.querySelector('published')?.textContent?.trim() ?? el.querySelector('updated')?.textContent?.trim() ?? '';
    if (title) items.push({ title, link, published: pub });
  });
  return items;
}

/* ── Detection Engine ── */
function matchAPT(text: string): string[] {
  const lower = text.toLowerCase();
  const matched = new Set<string>();
  // Check aliases (sorted longest-first to avoid partial matches)
  const sortedAliases = Object.entries(ALIAS_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, group] of sortedAliases) {
    if (lower.includes(alias)) {
      matched.add(group);
    }
  }
  // Also check canonical group names directly
  for (const key of Object.keys(APT_GROUPS)) {
    if (lower.includes(key.toLowerCase())) matched.add(key);
  }
  return [...matched];
}

function matchTechniques(text: string): { id: string; name: string; tactic: string; kill_chain: string }[] {
  const lower = text.toLowerCase();
  const matched: { id: string; name: string; tactic: string; kill_chain: string }[] = [];
  for (const [id, tech] of Object.entries(TECHNIQUES)) {
    for (const kw of tech.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        const kc = TACTIC_TO_KILLCHAIN[tech.tactic] ?? 'Actions on Objectives';
        matched.push({ id, name: tech.name, tactic: tech.tactic, kill_chain: kc });
        break;
      }
    }
  }
  return matched;
}

function scoreConfidence(
  aptMatches: number,
  techMatches: number,
  sourceIsVendor: boolean,
  killChainStages: string[],
  title: string
): number {
  let c = 0.05; // base
  // APT matches (strongest signal)
  if (aptMatches >= 3) c += 0.5;
  else if (aptMatches >= 2) c += 0.35;
  else if (aptMatches === 1) c += 0.25;
  // Technique matches
  if (techMatches >= 5) c += 0.25;
  else if (techMatches >= 3) c += 0.18;
  else if (techMatches >= 1) c += 0.1;
  // Kill chain breadth (covering more stages = higher confidence)
  if (killChainStages.length >= 4) c += 0.1;
  else if (killChainStages.length >= 2) c += 0.05;
  // Vendor source bonus (they write detailed analysis)
  if (sourceIsVendor) c += 0.08;
  // High-signal keywords in title
  const lower = title.toLowerCase();
  if (lower.includes('campaign') || lower.includes('operation') || lower.includes('apt')) c += 0.05;
  if (lower.includes('zero-day') || lower.includes('0-day') || lower.includes('exploit')) c += 0.05;
  if (lower.includes('ransomware') || lower.includes('breach') || lower.includes('attack')) c += 0.03;
  return Math.min(c, 1);
}

/* ── Constants ── */
const KC_COLORS: Record<string, string> = {
  Reconnaissance: 'bg-blue-500',
  Weaponization: 'bg-purple-500',
  Delivery: 'bg-orange-500',
  Exploitation: 'bg-red-500',
  Installation: 'bg-pink-500',
  'Command & Control': 'bg-amber-500',
  'Actions on Objectives': 'bg-rose-600',
};
const CONF_COLORS: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};

/* ── Sub-components ── */
function ConfidenceBadge({ c }: { c: number }) {
  const level = c >= 0.7 ? 'high' : c >= 0.35 ? 'medium' : 'low';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${CONF_COLORS[level]}`}>
      {(c * 100).toFixed(0)}%
    </span>
  );
}

function KillChainBar({ stages }: { stages: string[] }) {
  return (
    <div className="flex gap-0.5 h-5 rounded overflow-hidden">
      {KILL_CHAIN_STAGES.map((s) => (
        <div
          key={s}
          className={`flex-1 ${stages.includes(s) ? KC_COLORS[s] : 'bg-slate-200 dark:bg-[rgb(var(--surface-300))]'}`}
          title={s}
        />
      ))}
    </div>
  );
}

/* ── Timeline Chart ── */
function TimelineChart({ detections }: { detections: Detection[] }) {
  // Group by day
  const dayMap: Record<string, number> = {};
  for (const d of detections) {
    const day = d.created_at.slice(0, 10);
    dayMap[day] = (dayMap[day] ?? 0) + 1;
  }
  const days = Object.entries(dayMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14);
  if (days.length === 0) return null;
  const maxVal = Math.max(...days.map(([, c]) => c), 1);

  return (
    <Card padding="md" className="mb-6">
      <h3 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-3">
        <TrendingUp size={14} className="inline mr-1" />
        Detection Timeline (Last 14 Days)
      </h3>
      <div className="flex items-end gap-1 h-24">
        {days.map(([day, count]) => (
          <div key={day} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500">{count}</span>
            <div
              className="w-full rounded-t bg-brand-400 dark:bg-brand-500 transition-all min-h-[2px]"
              style={{ height: `${(count / maxVal) * 80}%` }}
              title={`${day}: ${count} detections`}
            />
            <span className="text-[8px] font-mono text-slate-400 dark:text-slate-500 -rotate-45 origin-top-left whitespace-nowrap">
              {day.slice(5)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ── Detection Rule Coverage (detection.wiki) ── */
interface DwTechnique {
  id: string;
  name: string;
  tactic: string;
  ruleCount: number;
  isSubtechnique: boolean;
  parentTechnique?: string;
}

function DetectionRuleCoverage({ detections }: { detections: Detection[] }): JSX.Element | null {
  const [techData, setTechData] = useState<DwTechnique[] | null>(null);

  useEffect(() => {
    fetch('/data/detection-wiki/techniques.json')
      .then((r) => r.json())
      .then((d: { all: DwTechnique[] }) => setTechData(d.all))
      .catch(() => {});
  }, []);

  const coverage = useMemo(() => {
    if (!techData) return null;
    // Collect all unique technique IDs from detections
    const detTechIds = new Set(detections.flatMap((d) => d.techniques.map((t) => t.id)));
    if (detTechIds.size === 0) return null;

    // Cross-reference with detection.wiki data
    const matched = techData.filter((t) => detTechIds.has(t.id)).sort((a, b) => b.ruleCount - a.ruleCount);

    const totalRules = matched.reduce((s, t) => s + t.ruleCount, 0);
    const coveredCount = matched.length;
    const uncoveredCount = detTechIds.size - coveredCount;

    return {
      matched,
      totalRules,
      coveredCount,
      uncoveredCount,
      totalTechIds: detTechIds.size,
    };
  }, [techData, detections]);

  if (!coverage || coverage.matched.length === 0) return null;

  const maxRules = Math.max(...coverage.matched.map((t) => t.ruleCount), 1);

  return (
    <Card padding="md" className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
          <Database size={14} className="inline mr-1" />
          Detection Rule Coverage (detection.wiki)
        </h3>
        <a
          href="/threatintel/detection-wiki"
          className="text-[10px] font-mono text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
        >
          open full matrix <ExternalLink size={9} />
        </a>
      </div>
      <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-3">
        {coverage.totalRules.toLocaleString()} detection rules across {coverage.coveredCount} matched techniques from
        15,957 total (Sigma, Elastic, Splunk, Kusto, YARA-L, Panther, Sublime)
      </p>
      {/* Coverage bar */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-[rgb(var(--surface-300))] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-500 transition-all"
            style={{ width: `${Math.min((coverage.coveredCount / Math.max(coverage.totalTechIds, 1)) * 100, 100)}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-slate-500">
          {coverage.coveredCount}/{coverage.totalTechIds} techniques
        </span>
      </div>
      {/* Top techniques by rule count */}
      <div className="space-y-1.5">
        {coverage.matched.slice(0, 12).map((t) => (
          <a
            key={t.id}
            href={`https://detection.wiki/rules/?q=${t.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 group"
          >
            <span
              className="w-14 h-5 rounded flex items-center justify-center text-[9px] font-mono font-bold border transition-colors"
              style={{
                background:
                  t.ruleCount > maxRules * 0.5
                    ? 'rgba(244,63,94,0.25)'
                    : t.ruleCount > maxRules * 0.2
                      ? 'rgba(249,115,22,0.2)'
                      : t.ruleCount > maxRules * 0.05
                        ? 'rgba(245,158,11,0.15)'
                        : 'rgba(148,163,184,0.1)',
                borderColor:
                  t.ruleCount > maxRules * 0.5
                    ? 'rgba(244,63,94,0.3)'
                    : t.ruleCount > maxRules * 0.2
                      ? 'rgba(249,115,22,0.25)'
                      : t.ruleCount > maxRules * 0.05
                        ? 'rgba(245,158,11,0.2)'
                        : 'rgba(148,163,184,0.15)',
              }}
            >
              {t.ruleCount}
            </span>
            <span className="text-[10px] font-mono text-slate-700 dark:text-slate-300 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
              {t.id}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate flex-1">{t.name}</span>
            <ExternalLink
              size={8}
              className="text-slate-400 group-hover:text-brand-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </a>
        ))}
        {coverage.matched.length > 12 && (
          <p className="text-[10px] font-mono text-slate-500">
            +{coverage.matched.length - 12} more techniques with detection rules
          </p>
        )}
      </div>
    </Card>
  );
}

/* ── Detection Labs (detection.wiki) ── */
interface DwLab {
  slug: string;
  title: string;
  author: string;
  date: string;
  description: string;
  techniques: string[];
}

function DetectionLabs({ detections }: { detections: Detection[] }): JSX.Element | null {
  const [labs, setLabs] = useState<DwLab[] | null>(null);

  useEffect(() => {
    fetch('/data/detection-wiki/labs.json')
      .then((r) => r.json())
      .then((d: DwLab[]) => setLabs(d))
      .catch(() => {});
  }, []);

  const relevantLabs = useMemo(() => {
    if (!labs) return [];
    const detTechIds = new Set(detections.flatMap((d) => d.techniques.map((t) => t.id)));
    if (detTechIds.size === 0) return [];

    // Score labs by how many of their techniques overlap with detections
    return labs
      .map((lab) => ({
        ...lab,
        overlap: lab.techniques.filter((t) => detTechIds.has(t)).length,
      }))
      .filter((lab) => lab.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap);
  }, [labs, detections]);

  if (!relevantLabs || relevantLabs.length === 0) return null;

  return (
    <Card padding="md" className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
          <FlaskConical size={14} className="inline mr-1" />
          Detection Labs (detection.wiki)
        </h3>
        <a
          href="/threatintel/detection-wiki"
          className="text-[10px] font-mono text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
        >
          all labs <ExternalLink size={9} />
        </a>
      </div>
      <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-3">
        Hands-on KQL analysis labs matching techniques from your detections
      </p>
      <div className="space-y-2">
        {relevantLabs.slice(0, 4).map((lab) => (
          <a
            key={lab.slug}
            href={`https://detection.wiki/labs/${lab.slug}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-2 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 transition-colors group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono font-semibold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    {lab.title}
                  </span>
                  <span className="text-[9px] font-mono text-slate-400">{lab.overlap} overlap</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{lab.description}</p>
              </div>
              <ExternalLink size={9} className="text-slate-400 group-hover:text-brand-500 shrink-0 mt-0.5" />
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {lab.techniques.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="text-[8px] font-mono px-1 py-0.5 rounded bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-500/20"
                >
                  {t}
                </span>
              ))}
            </div>
          </a>
        ))}
      </div>
    </Card>
  );
}

/* ── Main Component ── */
export default function ThreatActorMonitor() {
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [filter, setFilter] = useState('');
  const [confFilter, setConfFilter] = useState('all');
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [sourcesEnabled, setSourcesEnabled] = useState<Record<string, boolean>>(() => {
    const all: Record<string, boolean> = {};
    OSINT_SOURCES.forEach((s) => {
      all[s.name] = true;
    });
    return all;
  });
  const scanAbort = useRef<AbortController | null>(null);
  const [alertSettings, setAlertSettings] = useState<AlertSettings>(loadAlertSettings);
  const [showAlertSettings, setShowAlertSettings] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setDetections(loadDetections());
    setLastScan(loadLastScan());
  }, []);

  // Auto-scan timer
  useEffect(() => {
    if (!alertSettings.autoScanMinutes || alertSettings.autoScanMinutes < 1) return;
    const ms = alertSettings.autoScanMinutes * 60 * 1000;
    const id = setInterval(() => {
      if (!scanning) runScan();
    }, ms);
    return () => clearInterval(id);
  }, [alertSettings.autoScanMinutes, scanning]);

  // Save alert settings when changed
  useEffect(() => {
    saveAlertSettings(alertSettings);
  }, [alertSettings]);

  const enabledSources = OSINT_SOURCES.filter((s) => sourcesEnabled[s.name]);
  const disabledCount = OSINT_SOURCES.length - enabledSources.length;

  /* ── Scan: poll RSS feeds, parse, match, store ── */
  const runScan = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    const abort = new AbortController();
    scanAbort.current = abort;
    toast(`Scanning ${enabledSources.length} OSINT feeds...`, 'info');

    let newCount = 0,
      relevantCount = 0,
      alertedCount = 0,
      errorCount = 0;
    const existing = loadDetections();
    const existingUrls = new Set(existing.map((d) => d.url));
    const newDetections: Detection[] = [];

    // Batch fetch (5 at a time to avoid hammering)
    const batchSize = 5;
    for (let i = 0; i < enabledSources.length; i += batchSize) {
      if (abort.signal.aborted) break;
      const batch = enabledSources.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (src) => {
          try {
            const proxyUrl = `/api/v1/threat-monitor/proxy?url=${encodeURIComponent(src.url)}`;
            const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(20000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const xml = await res.text();
            return { source: src, items: parseFeedXML(xml) };
          } catch (e) {
            errorCount++;
            return { source: src, items: [] as { title: string; link: string; published: string }[] };
          }
        })
      );

      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        const { source, items } = r.value;
        const isVendor = source.category === 'vendor';
        for (const item of items) {
          newCount++;
          const combined = `${item.title}`;
          const aptMatches = matchAPT(combined);
          const techMatches = matchTechniques(combined);
          if (aptMatches.length > 0 || techMatches.length >= 2) {
            if (existingUrls.has(item.link)) continue;
            relevantCount++;
            const kcStages = [...new Set(techMatches.map((t) => t.kill_chain))];
            const confidence = scoreConfidence(aptMatches.length, techMatches.length, isVendor, kcStages, item.title);
            const det: Detection = {
              id: `det-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              source: source.name,
              title: item.title,
              url: item.link,
              published: item.published,
              apt_groups: aptMatches,
              techniques: techMatches,
              kill_chain_stages: kcStages,
              confidence,
              created_at: new Date().toISOString(),
            };
            newDetections.push(det);
            if (confidence >= 0.5) alertedCount++;
          }
        }
      }
    }

    // Merge + save
    const merged = [...newDetections, ...existing]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 500);
    saveDetections(merged);
    setDetections(merged);

    const scanResult: ScanResult = {
      newItems: newCount,
      relevant: relevantCount,
      alerted: alertedCount,
      errors: errorCount,
      ts: new Date().toISOString(),
    };
    saveLastScan(scanResult);
    setLastScan(scanResult);
    setScanning(false);

    toast(`Scan complete: ${newCount} items scanned, ${relevantCount} matched, ${alertedCount} alerted`, 'success');

    // Fire alerts for new high-confidence detections
    processAlerts(alertSettings, newDetections, (msg: string) => toast(msg, 'warning'));
  }, [scanning, enabledSources, toast, alertSettings]);

  const clearDetections = useCallback(() => {
    if (!confirm('Clear all detections?')) return;
    saveDetections([]);
    setDetections([]);
    toast('Detections cleared', 'info');
  }, [toast]);

  /* ── Computed stats ── */
  const filtered = detections.filter((d) => {
    if (filter) {
      const q = filter.toLowerCase();
      if (!d.title.toLowerCase().includes(q) && !d.apt_groups.some((g) => g.toLowerCase().includes(q))) return false;
    }
    if (confFilter !== 'all') {
      if (confFilter === 'high' && d.confidence < 0.7) return false;
      if (confFilter === 'medium' && (d.confidence < 0.35 || d.confidence >= 0.7)) return false;
      if (confFilter === 'low' && d.confidence >= 0.35) return false;
    }
    return true;
  });

  const originMap: Record<string, number> = {};
  const sourceMap: Record<string, number> = {};
  const kcMap: Record<string, number> = {};
  for (const d of detections) {
    sourceMap[d.source] = (sourceMap[d.source] ?? 0) + 1;
    for (const g of d.apt_groups) {
      const o = APT_GROUPS[g]?.suspected_origin ?? 'Unknown';
      originMap[o] = (originMap[o] ?? 0) + 1;
    }
    for (const s of d.kill_chain_stages) kcMap[s] = (kcMap[s] ?? 0) + 1;
  }
  const sourceList = Object.entries(sourceMap)
    .map(([source, c]) => ({ source, c }))
    .sort((a, b) => b.c - a.c);
  const totalAptGroupsDetected = new Set(detections.flatMap((d) => d.apt_groups)).size;

  return (
    <DataPageLayout
      backTo="/threatintel"
      backLabel="Threat Intel"
      icon={<Shield size={20} />}
      title="Global Threat Actor Monitor"
      description={
        <span>
          Real-time APT monitoring across <strong>{enabledSources.length}</strong> OSINT feeds — MITRE ATT&CK + Cyber
          Kill Chain mapping · Replication of{' '}
          <a
            href="https://github.com/hero-itsme/Global-Threat-Actor-Monitor"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
          >
            hero-itsme/Global-Threat-Actor-Monitor <ExternalLink size={10} />
          </a>{' '}
          · Upstream 40 groups → {Object.keys(APT_GROUPS).length} locally · Polling via{' '}
          <span className="font-mono bg-slate-100 dark:bg-[rgb(var(--surface-200))] px-1 py-0.5 rounded">
            /api/v1/threat-monitor/proxy
          </span>
        </span>
      }
      maxWidthClass="max-w-7xl"
    >
      {/* Upstream replication provenance */}
      <div className="surface-card p-3 mb-4 flex flex-wrap items-center gap-2 text-xs font-mono">
        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-200))] text-slate-600 dark:text-slate-400 border">
          Replication
        </span>
        <a
          href="https://github.com/hero-itsme/Global-Threat-Actor-Monitor"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
        >
          hero-itsme/Global-Threat-Actor-Monitor <ExternalLink size={10} />
        </a>
        <span className="text-slate-400">·</span>
        <span className="text-slate-600 dark:text-slate-400">
          Upstream: <strong>40</strong> groups · <strong>148</strong> aliases · <strong>29</strong> techniques ·{' '}
          <strong>30</strong> feeds · 7 Kill Chain stages
        </span>
        <span className="text-slate-400">·</span>
        <span className="text-emerald-600 dark:text-emerald-400">
          Expanded: <strong>{Object.keys(APT_GROUPS).length}</strong> groups ·{' '}
          <strong>{Object.keys(TECHNIQUES).length}</strong> techniques · <strong>{OSINT_SOURCES.length}</strong> feeds
        </span>
        <a
          href="/api/v1/threat-monitor/"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1"
        >
          API <ExternalLink size={10} />
        </a>
        <span className="text-slate-400">·</span>
        <span className="text-slate-500">
          MCP: tam_list_groups · tam_get_group · tam_list_techniques · tam_list_sources
        </span>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Button variant="primary-brand" size="sm" onClick={runScan} loading={scanning} icon={<Radio size={14} />}>
          {scanning ? 'Scanning...' : `Scan ${enabledSources.length} Feeds`}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setDetections(loadDetections())}
          icon={<RefreshCw size={14} />}
        >
          Refresh
        </Button>
        <Button variant="secondary" size="sm" onClick={clearDetections} icon={<Trash2 size={14} />}>
          Clear
        </Button>
        {lastScan && (
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
            Last: {lastScan.relevant} matched · {lastScan.alerted} alerted · {lastScan.errors} errors (
            {new Date(lastScan.ts).toLocaleString()})
          </span>
        )}
        {disabledCount > 0 && (
          <span className="text-xs text-amber-600 dark:text-amber-400">{disabledCount} feeds disabled</span>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card padding="md">
          <div className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400">Detections</div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">{detections.length}</div>
        </Card>
        <Card padding="md">
          <div className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400">APT Groups</div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {totalAptGroupsDetected}
            <span className="text-sm text-slate-400">/{Object.keys(APT_GROUPS).length}</span>
            <span className="block text-[10px] font-mono text-slate-400">
              upstream 40 → {Object.keys(APT_GROUPS).length} expanded
            </span>
          </div>
        </Card>
        <Card padding="md">
          <div className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400">Techniques</div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {Object.keys(TECHNIQUES).length}
          </div>
          <div className="text-xs text-slate-500">ATT&CK mapped</div>
        </Card>
        <Card padding="md">
          <div className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400">Alerts</div>
          <div className="text-2xl font-bold font-mono text-red-600 dark:text-red-400">
            {detections.filter((d) => d.confidence >= 0.5).length}
          </div>
          <div className="text-xs text-slate-500">high confidence</div>
        </Card>
      </div>

      {/* Kill Chain + Origin + Top Sources */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card padding="md">
          <h3 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-3">
            <Target size={14} className="inline mr-1" />
            Kill Chain Coverage
          </h3>
          <div className="space-y-2">
            {KILL_CHAIN_STAGES.map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded ${KC_COLORS[s]}`} />
                <span className="text-xs text-slate-600 dark:text-slate-400 flex-1 truncate">{s}</span>
                <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">{kcMap[s] ?? 0}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card padding="md">
          <h3 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-3">
            <Globe size={14} className="inline mr-1" />
            By Origin
          </h3>
          <div className="space-y-1.5">
            {Object.entries(originMap)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
              .map(([o, c]) => (
                <div key={o} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-400 truncate">{o}</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{c}</span>
                </div>
              ))}
          </div>
        </Card>
        <Card padding="md">
          <h3 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-3">
            <BarChart3 size={14} className="inline mr-1" />
            Top Sources
          </h3>
          <div className="space-y-1.5">
            {sourceList.slice(0, 10).map((s) => (
              <div key={s.source} className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-400 truncate max-w-[180px]">{s.source}</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{s.c}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Timeline Chart */}
      {detections.length > 0 && <TimelineChart detections={detections} />}

      {/* Detection Rule Coverage from detection.wiki */}
      <DetectionRuleCoverage detections={detections} />

      {/* Detection Labs from detection.wiki */}
      <DetectionLabs detections={detections} />

      {/* Source Selector */}
      <Card padding="md" className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Settings size={14} className="text-slate-500" />
          <h3 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
            OSINT Sources ({enabledSources.length}/{OSINT_SOURCES.length})
          </h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {OSINT_SOURCES.map((s) => (
            <button
              key={s.name}
              onClick={() => setSourcesEnabled((prev) => ({ ...prev, [s.name]: !prev[s.name] }))}
              className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                sourcesEnabled[s.name]
                  ? 'bg-brand-100 border-brand-300 text-brand-700 dark:bg-brand-900/30 dark:border-brand-600 dark:text-brand-300'
                  : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-600'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </Card>

      {/* Alert Settings */}
      <Card padding="md" className="mb-6">
        <button
          onClick={() => setShowAlertSettings(!showAlertSettings)}
          className="flex items-center gap-2 w-full text-left"
        >
          {alertSettings.enabled ? (
            <Bell size={14} className="text-emerald-500" />
          ) : (
            <BellOff size={14} className="text-slate-400" />
          )}
          <h3 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
            Email Alerts {alertSettings.enabled ? '(ON)' : '(OFF)'}
          </h3>
          <span className="ml-auto text-xs text-slate-400">{showAlertSettings ? '▾' : '▸'}</span>
        </button>
        {showAlertSettings && (
          <div className="mt-4 space-y-4 border-t border-slate-200 dark:border-[rgb(var(--border-400))] pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={alertSettings.enabled}
                  onChange={(e) => setAlertSettings((s) => ({ ...s, enabled: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">Enable Alerts</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={alertSettings.browserNotifications}
                  onChange={(e) => {
                    if (e.target.checked) requestNotificationPermission();
                    setAlertSettings((s) => ({ ...s, browserNotifications: e.target.checked }));
                  }}
                  className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">Desktop Notifications</span>
              </label>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
                Confidence Threshold ({(alertSettings.threshold * 100).toFixed(0)}%)
              </label>
              <input
                type="range"
                min={0.3}
                max={1}
                step={0.05}
                value={alertSettings.threshold}
                onChange={(e) => setAlertSettings((s) => ({ ...s, threshold: +e.target.value }))}
                className="w-full"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
                  <Mail size={12} className="inline mr-1" />
                  Email (mailto: draft)
                </label>
                <Input
                  value={alertSettings.email}
                  onChange={(e) => setAlertSettings((s) => ({ ...s, email: e.target.value }))}
                  placeholder="your@email.com"
                  mono={false}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
                  <Webhook size={12} className="inline mr-1" />
                  Webhook URL
                </label>
                <Input
                  value={alertSettings.webhookUrl}
                  onChange={(e) => setAlertSettings((s) => ({ ...s, webhookUrl: e.target.value }))}
                  placeholder="https://hooks.slack.com/..."
                  mono={false}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
                Auto-Scan Interval
              </label>
              <Select
                value={String(alertSettings.autoScanMinutes)}
                onChange={(e) => setAlertSettings((s) => ({ ...s, autoScanMinutes: +e.target.value }))}
                className="w-48"
                mono={false}
              >
                <option value="0">Manual only</option>
                <option value="15">Every 15 minutes</option>
                <option value="30">Every 30 minutes</option>
                <option value="60">Every hour</option>
                <option value="360">Every 6 hours</option>
              </Select>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Alerts fire when new detections exceed the confidence threshold. Email opens a mailto: draft. Webhook
              posts to Slack/Discord/generic.
            </p>
          </div>
        )}
      </Card>

      {/* Detections Feed */}
      <Card padding="none">
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
          <div className="flex-1 min-w-[200px]">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by title or actor..."
              mono={false}
            />
          </div>
          <Select value={confFilter} onChange={(e) => setConfFilter(e.target.value)} className="w-auto" mono={false}>
            <option value="all">All Confidence</option>
            <option value="high">High (≥70%)</option>
            <option value="medium">Medium (35-70%)</option>
            <option value="low">Low (&lt;35%)</option>
          </Select>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{filtered.length} detections</span>
          <div className="flex gap-1">
            <button
              onClick={() => exportCsv(filtered)}
              disabled={filtered.length === 0}
              className="px-2 py-1 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800 dark:hover:bg-emerald-900/40 transition-colors"
              title="Export as CSV"
            >
              <Download size={10} className="inline mr-0.5" />
              CSV
            </button>
            <button
              onClick={() => exportJson(filtered)}
              disabled={filtered.length === 0}
              className="px-2 py-1 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900/40 transition-colors"
              title="Export as JSON"
            >
              <Download size={10} className="inline mr-0.5" />
              JSON
            </button>
          </div>
        </div>
        {scanning ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin text-brand-500" />
            <span className="ml-3 text-slate-400">Scanning feeds...</span>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Eye size={32} />}
            title="No detections yet"
            description={`Click "Scan" to poll ${enabledSources.length} OSINT feeds and detect APT activity using MITRE ATT&CK matching`}
          />
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-[rgb(var(--border-400))]">
            {filtered.map((d) => (
              <div
                key={d.id}
                className="p-4 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-200))] transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-slate-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 truncate"
                      >
                        {d.title}
                      </a>
                      <ExternalLink size={12} className="text-slate-400 shrink-0" />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{d.source}</span>
                      {d.published && (
                        <span className="text-xs text-slate-400">· {new Date(d.published).toLocaleDateString()}</span>
                      )}
                      <ConfidenceBadge c={d.confidence} />
                    </div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {d.apt_groups.map((g) => (
                        <span
                          key={g}
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                        >
                          {g}{' '}
                          <span className="text-rose-400 dark:text-rose-500">
                            ({APT_GROUPS[g]?.suspected_origin ?? '?'})
                          </span>
                        </span>
                      ))}
                      {d.techniques.slice(0, 5).map((t) => (
                        <span
                          key={t.id}
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                          title={`${t.name} (${t.tactic})`}
                        >
                          {t.id}
                        </span>
                      ))}
                      {d.techniques.length > 5 && (
                        <span className="text-[10px] text-slate-400">+{d.techniques.length - 5}</span>
                      )}
                    </div>
                    <KillChainBar stages={d.kill_chain_stages} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </DataPageLayout>
  );
}
