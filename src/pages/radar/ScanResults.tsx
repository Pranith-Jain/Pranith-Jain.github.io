import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Globe,
  Shield,
  Code,
  FileText,
  Link2,
  Image,
  FormInput,
  Server,
  Loader2,
  ExternalLink,
  ChevronRight,
  Check,
  AlertTriangle,
  X,
  LockKeyhole,
  Mail,
  Hash,
  MapPin,
  Share2,
  FileCode,
  Layers,
  Search,
  Database,
  Cloud,
  Terminal,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { api } from '../../lib/api-client';

interface ScanData {
  id: string;
  target: string;
  scannedAt: string;
  duration_ms: number;
  http: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    redirectChain: string[];
    finalUrl: string;
    contentType: string;
    server: string;
    contentLength: number;
  };
  dns: {
    a: string[];
    aaaa: string[];
    ns: string[];
    mx: { host: string; priority: number }[];
    txt: string[];
    cname: string[];
  };
  tls: {
    subject: string;
    issuer: string;
    validFrom: string;
    validTo: string;
    daysRemaining: number;
    serialNumber: string;
    sans: string[];
  } | null;
  technologies: { name: string; category: string; confidence: number }[];
  js_files: { url: string; size: number; type: string }[];
  endpoints: { url: string; method: string; type: string }[];
  meta: Record<string, string>;
  forms: { action: string; method: string; inputs: { name: string; type: string }[] }[];
  images: { src: string; alt: string; width?: number; height?: number }[];
  links: { href: string; text: string; rel?: string }[];
  security: { headers: Record<string, string | null>; score: number; issues: string[] };
  emails: string[];
  guids: string[];
  localhost_refs: string[];
  social_media_urls: string[];
  file_extension_urls: string[];
  parameters: string[];
  query_parameters: string[];
  scanned_urls: string[];
  api_paths: string[];
  domains: string[];
  ip_addresses: string[];
  aws_assets: { type: string; url: string; status?: number }[];
  s3_takeovers: string[];
  node_modules: string[];
  npm_confusion: string[];
  vulnerabilities: { type: string; detail: string; severity: string }[];
  graphql: { queries: string[]; mutations: string[]; fragments: string[] };
  filtered_port_urls: string[];
  robots_disallow?: string[];
  sitemap_urls?: string[];
  directory_listings?: string[];
  backup_files?: string[];
  debug_endpoints?: string[];
  open_redirects?: string[];
  sensitive_files?: string[];
  source_maps?: string[];
  cors_issues?: string[];
  cookie_issues?: string[];
  waf_detected?: string[];
  jwt_tokens?: string[];
  html_comments?: string[];
  hidden_forms?: string[];
  tech_hints?: string[];
  backup_patterns?: string[];
}

type TabId = 'recon' | 'secrets';

const CATEGORIES = [
  { id: 'overview', label: 'Overview', icon: Globe },
  { id: 'scanned_urls', label: 'Scanned URLs', icon: Eye },
  { id: 'http', label: 'HTTP Headers', icon: Server },
  { id: 'dns', label: 'DNS Records', icon: Globe },
  { id: 'domains', label: 'Domains', icon: Layers },
  { id: 'ip_addresses', label: 'IP Addresses', icon: MapPin },
  { id: 'tech', label: 'Technologies', icon: Code },
  { id: 'js', label: 'JavaScript', icon: FileCode },
  { id: 'api_paths', label: 'API Paths', icon: Terminal },
  { id: 'endpoints', label: 'Endpoints', icon: Link2 },
  { id: 'parameters', label: 'Parameters', icon: Hash },
  { id: 'query_parameters', label: 'Query Parameters', icon: Search },
  { id: 'emails', label: 'Emails', icon: Mail },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'vulnerabilities', label: 'Vulnerabilities', icon: AlertCircle },
  { id: 'attack_surface', label: 'Attack Surface', icon: AlertTriangle },
  { id: 'meta', label: 'Meta Tags', icon: FileText },
  { id: 'forms', label: 'Forms', icon: FormInput },
  { id: 'images', label: 'Images', icon: Image },
  { id: 'links', label: 'Links', icon: Link2 },
  { id: 'aws_assets', label: 'AWS Assets', icon: Cloud },
  { id: 'social_media', label: 'Social Media', icon: Share2 },
  { id: 'guids', label: 'GUIDs', icon: Hash },
  { id: 'file_extensions', label: 'File Extensions', icon: FileText },
  { id: 'node_modules', label: 'Node Modules', icon: Database },
  { id: 'localhost', label: 'Localhost', icon: MapPin },
  { id: 'graphql', label: 'GraphQL', icon: Code },
  { id: 'port_urls', label: 'Filtered Ports', icon: Globe },
] as const;

function StatusBadge({ status }: { status: number }) {
  const color =
    status >= 200 && status < 300
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
      : status >= 300 && status < 400
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
        : status >= 400
          ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
          : 'bg-slate-100 text-slate-700 dark:bg-[rgb(var(--surface-300))] dark:text-slate-400';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>
      {status}
    </span>
  );
}

function SecurityScore({ score }: { score: number }) {
  const color = score >= 80 ? 'text-emerald-600' : score >= 50 ? 'text-amber-600' : 'text-rose-600';
  const bg = score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-3 w-32 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className={`absolute inset-y-0 left-0 ${bg} rounded-full transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-sm font-bold ${color}`}>{score}/100</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      {children}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-300)/0.5)]">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="min-w-[140px] text-slate-500 dark:text-slate-400">{label}</span>
      <span className="break-all text-slate-900 dark:text-slate-200">{value}</span>
    </div>
  );
}

function StringList({ items, empty }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <p className="text-sm text-slate-500">{empty || 'None found'}</p>;
  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))]">
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 px-4 py-2 text-sm">
            <span className="truncate font-mono text-slate-700 dark:text-slate-300">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OverviewPanel({ data }: { data: ScanData }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatBox label="Status" value={`${data.http.status} ${data.http.statusText}`} />
        <StatBox label="Server" value={data.http.server || 'Unknown'} />
        <StatBox label="Technologies" value={String(data.technologies.length)} />
        <StatBox label="Security Score" value={`${data.security.score}/100`} />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatBox label="Scanned URLs" value={String(data.scanned_urls?.length ?? 0)} />
        <StatBox label="API Paths" value={String(data.api_paths?.length ?? 0)} />
        <StatBox label="Domains" value={String(data.domains?.length ?? 0)} />
        <StatBox label="IPs" value={String(data.ip_addresses?.length ?? 0)} />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatBox label="Emails" value={String(data.emails?.length ?? 0)} />
        <StatBox label="Parameters" value={String(data.parameters?.length ?? 0)} />
        <StatBox label="JS Files" value={String(data.js_files?.length ?? 0)} />
        <StatBox label="Vulnerabilities" value={String(data.vulnerabilities?.length ?? 0)} />
      </div>
      <Section title="Target Information">
        <div className="space-y-2 text-sm">
          <Row label="URL" value={data.target} />
          <Row label="Final URL" value={data.http.finalUrl} />
          <Row label="Content-Type" value={data.http.contentType} />
          <Row label="Content-Length" value={`${(data.http.contentLength / 1024).toFixed(1)} KB`} />
          <Row label="Scan Duration" value={`${data.duration_ms}ms`} />
        </div>
      </Section>
      {data.dns.a.length > 0 && (
        <Section title="DNS Resolution">
          <div className="space-y-2 text-sm">
            <Row label="A Records" value={data.dns.a.join(', ')} />
            {data.dns.aaaa.length > 0 && <Row label="AAAA" value={data.dns.aaaa.join(', ')} />}
            {data.dns.ns.length > 0 && <Row label="NS" value={data.dns.ns.join(', ')} />}
          </div>
        </Section>
      )}
      {data.technologies.length > 0 && (
        <Section title="Detected Technologies">
          <div className="flex flex-wrap gap-2">
            {data.technologies.map((t) => (
              <span
                key={t.name}
                className="inline-flex items-center gap-1 rounded bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
              >
                {t.name} <span className="text-brand-400">({t.confidence}%)</span>
              </span>
            ))}
          </div>
        </Section>
      )}
      {data.tls && (
        <Section title="TLS Certificate">
          <div className="space-y-2 text-sm">
            <Row label="Subject" value={data.tls.subject} />
            <Row label="Issuer" value={data.tls.issuer} />
            <Row label="Days Remaining" value={String(data.tls.daysRemaining)} />
          </div>
        </Section>
      )}
    </div>
  );
}

function ScannedUrlsPanel({ data }: { data: ScanData }) {
  return <StringList items={data.scanned_urls ?? []} empty="No URLs scanned" />;
}

function HttpHeadersPanel({ data }: { data: ScanData }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))]">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-300)/0.5)]">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Response Headers</h3>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {Object.entries(data.http.headers).map(([key, value]) => (
          <div key={key} className="flex gap-4 px-4 py-2 text-sm">
            <span className="min-w-[200px] font-mono font-medium text-slate-600 dark:text-slate-400">{key}</span>
            <span className="break-all text-slate-900 dark:text-slate-200">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DnsPanel({ data }: { data: ScanData }) {
  return (
    <div className="space-y-4">
      <Section title="A Records">
        <StringList items={data.dns.a} />
      </Section>
      {data.dns.aaaa.length > 0 && (
        <Section title="AAAA">
          <StringList items={data.dns.aaaa} />
        </Section>
      )}
      {data.dns.ns.length > 0 && (
        <Section title="NS">
          <StringList items={data.dns.ns} />
        </Section>
      )}
      {data.dns.mx.length > 0 && (
        <Section title="MX">
          <StringList items={data.dns.mx.map((m) => `${m.priority} ${m.host}`)} />
        </Section>
      )}
      {data.dns.txt.length > 0 && (
        <Section title="TXT">
          <StringList items={data.dns.txt} />
        </Section>
      )}
      {data.dns.cname.length > 0 && (
        <Section title="CNAME">
          <StringList items={data.dns.cname} />
        </Section>
      )}
    </div>
  );
}

function DomainsPanel({ data }: { data: ScanData }) {
  return <StringList items={data.domains ?? []} empty="No external domains found" />;
}

function IpsPanel({ data }: { data: ScanData }) {
  return <StringList items={data.ip_addresses ?? []} empty="No IP addresses found" />;
}

function TechPanel({ data }: { data: ScanData }) {
  const grouped = data.technologies.reduce(
    (acc, t) => {
      (acc[t.category] ??= []).push(t);
      return acc;
    },
    {} as Record<string, typeof data.technologies>
  );
  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([cat, techs]) => (
        <Section key={cat} title={cat}>
          <div className="space-y-2">
            {techs.map((t) => (
              <div
                key={t.name}
                className="flex items-center justify-between rounded bg-slate-50 px-3 py-2 dark:bg-[rgb(var(--surface-300)/0.5)]"
              >
                <span className="text-sm font-medium text-slate-900 dark:text-white">{t.name}</span>
                <span className="text-xs text-slate-500">{t.confidence}% confidence</span>
              </div>
            ))}
          </div>
        </Section>
      ))}
      {data.technologies.length === 0 && <p className="text-sm text-slate-500">No technologies detected</p>}
    </div>
  );
}

function JsPanel({ data }: { data: ScanData }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))]">
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {data.js_files.map((f) => (
          <div key={f.url} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <Code className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate font-mono text-slate-700 dark:text-slate-300">{f.url}</span>
            <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-400" />
          </div>
        ))}
        {data.js_files.length === 0 && <div className="px-4 py-3 text-sm text-slate-500">No JS files found</div>}
      </div>
    </div>
  );
}

function ApiPathsPanel({ data }: { data: ScanData }) {
  return <StringList items={data.api_paths ?? []} empty="No API paths found" />;
}

function EndpointsPanel({ data }: { data: ScanData }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))]">
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {data.endpoints.map((ep, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ${
                ep.method === 'GET'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : ep.method === 'POST'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-slate-100 text-slate-700 dark:bg-[rgb(var(--surface-300))] dark:text-slate-400'
              }`}
            >
              {ep.method}
            </span>
            <span className="truncate font-mono text-slate-700 dark:text-slate-300">{ep.url}</span>
            <span className="ml-auto shrink-0 text-xs text-slate-400">{ep.type}</span>
          </div>
        ))}
        {data.endpoints.length === 0 && <div className="px-4 py-3 text-sm text-slate-500">No endpoints found</div>}
      </div>
    </div>
  );
}

function ParametersPanel({ data }: { data: ScanData }) {
  return <StringList items={data.parameters ?? []} empty="No parameters found" />;
}

function QueryParametersPanel({ data }: { data: ScanData }) {
  return <StringList items={data.query_parameters ?? []} empty="No query parameters found" />;
}

function EmailsPanel({ data }: { data: ScanData }) {
  return <StringList items={data.emails ?? []} empty="No emails found" />;
}

function SecurityPanel({ data }: { data: ScanData }) {
  const sec = data.security;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-300)/0.5)]">
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Security Score</h3>
        <SecurityScore score={sec.score} />
      </div>
      {sec.issues.length > 0 && (
        <Section title="Issues">
          <div className="space-y-2">
            {sec.issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <span className="text-slate-700 dark:text-slate-300">{issue}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
      <Section title="Security Headers">
        <div className="space-y-1">
          {Object.entries(sec.headers).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm">
              {value ? (
                <Check className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <X className="h-4 w-4 shrink-0 text-rose-500" />
              )}
              <span className="font-mono text-slate-700 dark:text-slate-300">{key}</span>
              {value && <span className="ml-auto truncate text-xs text-slate-500">{value}</span>}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function VulnerabilitiesPanel({ data }: { data: ScanData }) {
  const vulns = data.vulnerabilities ?? [];
  if (vulns.length === 0) return <p className="text-sm text-slate-500">No vulnerabilities detected</p>;
  const sevColor = (s: string) =>
    s === 'critical'
      ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
      : s === 'high'
        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
        : s === 'medium'
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  return (
    <div className="space-y-2">
      {vulns.map((v, i) => (
        <div key={i} className="rounded-xl border border-slate-200 p-3 dark:border-[rgb(var(--border-400))]">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ${sevColor(v.severity)}`}
            >
              {v.severity.toUpperCase()}
            </span>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">{v.type}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{v.detail}</p>
        </div>
      ))}
    </div>
  );
}

function AttackSurfacePanel({ data }: { data: ScanData }) {
  const sections = [
    { label: 'Directory Listings', items: data.directory_listings },
    { label: 'Backup Files', items: [...(data.backup_files ?? []), ...(data.backup_patterns ?? [])] },
    { label: 'Debug Endpoints', items: data.debug_endpoints },
    { label: 'Open Redirects', items: data.open_redirects },
    { label: 'Sensitive Files', items: data.sensitive_files },
    { label: 'Source Maps', items: data.source_maps },
    { label: 'CORS Issues', items: data.cors_issues },
    { label: 'Cookie Issues', items: data.cookie_issues },
    { label: 'WAF Detected', items: data.waf_detected },
    {
      label: 'JWT Tokens',
      items: data.jwt_tokens?.map((t) => (t.length > 60 ? t.slice(0, 60) + '...' : t)),
    },
    { label: 'HTML Comments', items: data.html_comments },
    { label: 'Hidden Forms', items: data.hidden_forms },
    { label: 'Tech Hints', items: data.tech_hints },
    { label: 'Robots.txt Disallow', items: data.robots_disallow },
    { label: 'Sitemap URLs', items: data.sitemap_urls },
  ];
  const hasAny = sections.some((s) => (s.items?.length ?? 0) > 0);
  if (!hasAny) return <p className="text-sm text-slate-500">No attack surface findings from deep crawl</p>;
  return (
    <div className="space-y-4">
      {sections.map((section) => {
        const items = section.items ?? [];
        if (items.length === 0) return null;
        return (
          <div key={section.label} className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))]">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 dark:border-slate-800">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">{section.label}</span>
              <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-600 dark:bg-[rgb(var(--surface-300))] dark:text-slate-400">
                {items.length}
              </span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.slice(0, 20).map((item, i) => (
                <div key={i} className="px-4 py-2 text-sm font-mono text-slate-700 dark:text-slate-300">
                  {item}
                </div>
              ))}
              {items.length > 20 && <div className="px-4 py-2 text-xs text-slate-500">+{items.length - 20} more</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MetaPanel({ data }: { data: ScanData }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))]">
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {Object.entries(data.meta).map(([key, value]) => (
          <div key={key} className="flex gap-4 px-4 py-2 text-sm">
            <span className="min-w-[180px] font-mono font-medium text-slate-600 dark:text-slate-400">{key}</span>
            <span className="break-all text-slate-900 dark:text-slate-200">{value}</span>
          </div>
        ))}
        {Object.keys(data.meta).length === 0 && <div className="px-4 py-3 text-sm text-slate-500">No meta tags</div>}
      </div>
    </div>
  );
}

function FormsPanel({ data }: { data: ScanData }) {
  return (
    <div className="space-y-4">
      {data.forms.length > 0 ? (
        data.forms.map((form, i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-4 dark:border-[rgb(var(--border-400))]">
            <div className="mb-2 flex items-center gap-2 text-sm">
              <span className="font-semibold text-slate-900 dark:text-white">Form {i + 1}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-600 dark:bg-[rgb(var(--surface-300))] dark:text-slate-400">
                {form.method}
              </span>
              {form.action && <span className="text-xs text-slate-500">→ {form.action}</span>}
            </div>
            {form.inputs.length > 0 && (
              <div className="mt-2 space-y-1">
                {form.inputs.map((inp) => (
                  <div key={inp.name} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-mono">{inp.name}</span>
                    <span className="text-slate-400">({inp.type})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      ) : (
        <p className="text-sm text-slate-500">No forms found</p>
      )}
    </div>
  );
}

function ImagesPanel({ data }: { data: ScanData }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {data.images.map((img, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))]"
        >
          <div className="flex h-24 items-center justify-center bg-slate-100 dark:bg-[rgb(var(--surface-300))]">
            <Image className="h-8 w-8 text-slate-300 dark:text-slate-400" />
          </div>
          <div className="p-2">
            <p className="truncate text-xs text-slate-600 dark:text-slate-400" title={img.src}>
              {img.src}
            </p>
            {img.alt && <p className="truncate text-xs text-slate-500">{img.alt}</p>}
          </div>
        </div>
      ))}
      {data.images.length === 0 && <p className="col-span-full text-sm text-slate-500">No images found</p>}
    </div>
  );
}

function LinksPanel({ data }: { data: ScanData }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))]">
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {data.links.slice(0, 200).map((link, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
            <Link2 className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate text-slate-700 dark:text-slate-300">{link.text || link.href}</span>
            {link.rel && (
              <span className="ml-auto shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-[rgb(var(--surface-300))]">
                {link.rel}
              </span>
            )}
          </div>
        ))}
        {data.links.length === 0 && <div className="px-4 py-3 text-sm text-slate-500">No links</div>}
      </div>
    </div>
  );
}

function AwsAssetsPanel({ data }: { data: ScanData }) {
  const assets = data.aws_assets ?? [];
  if (assets.length === 0) return <p className="text-sm text-slate-500">No AWS assets found</p>;
  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))]">
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {assets.map((a, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <Cloud className="h-4 w-4 shrink-0 text-amber-500" />
            <span className="truncate font-mono text-slate-700 dark:text-slate-300">{a.url}</span>
            {a.status && (
              <span
                className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-bold ${a.status === 200 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}
              >
                {a.status === 200 ? 'OPEN' : '403'}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SocialMediaPanel({ data }: { data: ScanData }) {
  return <StringList items={data.social_media_urls ?? []} empty="No social media URLs found" />;
}

function GuidsPanel({ data }: { data: ScanData }) {
  return <StringList items={data.guids ?? []} empty="No GUIDs found" />;
}

function FileExtensionsPanel({ data }: { data: ScanData }) {
  return <StringList items={data.file_extension_urls ?? []} empty="No file extension URLs found" />;
}

function NodeModulesPanel({ data }: { data: ScanData }) {
  return <StringList items={data.node_modules ?? []} empty="No node_modules exposure detected" />;
}

function LocalhostPanel({ data }: { data: ScanData }) {
  return <StringList items={data.localhost_refs ?? []} empty="No localhost references found" />;
}

function GraphqlPanel({ data }: { data: ScanData }) {
  const gql = data.graphql ?? { queries: [], mutations: [], fragments: [] };
  return (
    <div className="space-y-4">
      <Section title="Queries">
        <StringList items={gql.queries} empty="No queries found" />
      </Section>
      <Section title="Mutations">
        <StringList items={gql.mutations} empty="No mutations found" />
      </Section>
      <Section title="Fragments">
        <StringList items={gql.fragments} empty="No fragments found" />
      </Section>
    </div>
  );
}

function PortUrlsPanel({ data }: { data: ScanData }) {
  return <StringList items={data.filtered_port_urls ?? []} empty="No port URLs found" />;
}

export default function ScanResults() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('recon');
  const [activeCategory, setActiveCategory] = useState('overview');
  const [crawlStatus, setCrawlStatus] = useState<string>('');

  const startCrawl = useCallback(async (crawlId: string, target: string) => {
    try {
      const hostname = new URL(target).hostname;
      await fetch(`/api/v1/radar/crawl/${crawlId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: crawlId, target, hostname }),
      });
      pollCrawl(crawlId);
    } catch {
      /* crawl start failed, non-critical */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pollCrawl = useCallback(async (crawlId: string) => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/radar/crawl/${crawlId}/state`);
        if (!res.ok) return;
        const state = (await res.json()) as { status: string; crawledCount: number; maxPages: number };
        setCrawlStatus(`${state.status} (${state.crawledCount}/${state.maxPages})`);
        if (state.status === 'done') {
          const resultRes = await fetch(`/api/v1/radar/crawl/${crawlId}/result`);
          if (resultRes.ok) {
            const raw = await resultRes.json();
            const crawlData: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(raw)) {
              crawlData[k.replace(/([A-Z])/g, '_$1').toLowerCase()] = v;
            }
            setData((prev) => (prev ? { ...prev, ...crawlData } : prev));
          }
          setCrawlStatus('');
          return;
        }
        if (state.status !== 'error') {
          setTimeout(poll, 2000);
        }
      } catch {
        setTimeout(poll, 3000);
      }
    };
    poll();
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get<ScanData & { crawlId?: string }>(`/api/v1/radar/scan/${id}`)
      .then((result) => {
        setData(result);
        if (result.crawlId) {
          startCrawl(result.crawlId, result.target);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, startCrawl]);

  if (loading)
    return (
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  if (error || !data)
    return (
      <div className="flex min-h-[calc(100vh-64px)] flex-col items-center gap-4">
        <p className="text-rose-500">{error || 'Scan not found'}</p>
        <Link to="/radar" className="text-sm text-brand-600 hover:underline">
          Back to Radar
        </Link>
      </div>
    );

  const catCount = (catId: string) => {
    const d = data as unknown as Record<string, unknown>;
    const v = d[catId];
    if (Array.isArray(v)) return v.length;
    if (typeof v === 'object' && v !== null) {
      if ('headers' in v) return Object.keys((v as { headers: Record<string, unknown> }).headers).length;
      if ('issues' in v) return (v as { issues: unknown[] }).issues.length;
      if ('a' in v) return (v as { a: unknown[] }).a.length;
    }
    return 0;
  };

  const renderPanel = () => {
    const panelMap: Record<string, React.ReactNode> = {
      overview: <OverviewPanel data={data} />,
      scanned_urls: <ScannedUrlsPanel data={data} />,
      http: <HttpHeadersPanel data={data} />,
      dns: <DnsPanel data={data} />,
      domains: <DomainsPanel data={data} />,
      ip_addresses: <IpsPanel data={data} />,
      tech: <TechPanel data={data} />,
      js: <JsPanel data={data} />,
      api_paths: <ApiPathsPanel data={data} />,
      endpoints: <EndpointsPanel data={data} />,
      parameters: <ParametersPanel data={data} />,
      query_parameters: <QueryParametersPanel data={data} />,
      emails: <EmailsPanel data={data} />,
      security: <SecurityPanel data={data} />,
      vulnerabilities: <VulnerabilitiesPanel data={data} />,
      attack_surface: <AttackSurfacePanel data={data} />,
      meta: <MetaPanel data={data} />,
      forms: <FormsPanel data={data} />,
      images: <ImagesPanel data={data} />,
      links: <LinksPanel data={data} />,
      aws_assets: <AwsAssetsPanel data={data} />,
      social_media: <SocialMediaPanel data={data} />,
      guids: <GuidsPanel data={data} />,
      file_extensions: <FileExtensionsPanel data={data} />,
      node_modules: <NodeModulesPanel data={data} />,
      localhost: <LocalhostPanel data={data} />,
      graphql: <GraphqlPanel data={data} />,
      port_urls: <PortUrlsPanel data={data} />,
    };
    return panelMap[activeCategory] ?? null;
  };

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6">
      <nav className="flex items-center gap-2 text-sm text-slate-500">
        <Link
          to="/radar"
          className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-300))] dark:text-slate-400 dark:hover:bg-slate-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </Link>
        <Link to="/radar" className="hover:text-brand-600">
          Recent Radar Runs
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-400" />
        <span className="truncate text-slate-900 dark:text-white">{data.target}</span>
      </nav>

      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">{data.target}</h1>
              <StatusBadge status={data.http.status} />
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Scanned {new Date(data.scannedAt).toLocaleString()} · {data.duration_ms}ms
              {crawlStatus && (
                <span className="ml-2 inline-flex items-center gap-1 text-brand-500">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Deep crawl: {crawlStatus}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-6">
          <MiniStat label="Status" value={`${data.http.status}`} />
          <MiniStat label="Server" value={data.http.server || '—'} />
          <MiniStat label="URLs" value={`${data.scanned_urls?.length ?? 0}`} />
          <MiniStat label="APIs" value={`${data.api_paths?.length ?? 0}`} />
          <MiniStat label="Domains" value={`${data.domains?.length ?? 0}`} />
          <MiniStat label="Security" value={`${data.security.score}/100`} />
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-[260px]">
          <div className="sticky top-20 max-h-[calc(100vh-120px)] overflow-y-auto rounded-xl border border-slate-200 bg-white dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]">
            <div className="flex border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
              <button
                onClick={() => setActiveTab('recon')}
                className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-3 text-xs font-semibold transition-colors ${activeTab === 'recon' ? 'border-brand-500 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                <Globe className="h-3.5 w-3.5" /> Reconnaissance
                <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
                  {CATEGORIES.reduce((s, c) => s + catCount(c.id), 0)}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('secrets')}
                className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-3 text-xs font-semibold transition-colors ${activeTab === 'secrets' ? 'border-brand-500 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                <Shield className="h-3.5 w-3.5" /> Keys & Secrets <LockKeyhole className="h-3 w-3 text-slate-400" />
              </button>
            </div>
            <nav className="flex flex-col p-1">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const count = catCount(cat.id);
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`flex items-center justify-between rounded px-3 py-2 text-left text-sm transition-colors ${activeCategory === cat.id ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/20 dark:text-brand-300' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-[rgb(var(--surface-300)/0.5)]'}`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {cat.label}
                    </span>
                    {count > 0 && (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-[rgb(var(--surface-300))] dark:text-slate-400">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>
        <main className="min-w-0 flex-1">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]">
            {renderPanel()}
          </div>
        </main>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}
