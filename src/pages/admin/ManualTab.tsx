import { useState } from 'react';
import { postJsonWithBody } from './adminApi';

const CASE_TYPES = [
  { value: 'cve', label: 'CVE' },
  { value: 'actor', label: 'Threat Actor' },
  { value: 'malware', label: 'Malware' },
  { value: 'ransom', label: 'Ransomware' },
  { value: 'breach', label: 'Breach' },
  { value: 'scam', label: 'Scam' },
  { value: 'aisec', label: 'AI Security' },
  { value: 'intel', label: 'Threat Intel' },
  { value: 'osint', label: 'OSINT' },
  { value: 'methodology', label: 'Methodology' },
  { value: 'trend', label: 'Trend' },
];

export default function ManualTab() {
  const [type, setType] = useState('osint');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; slug?: string; error?: string } | null>(null);

  async function handlePublish() {
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const tagsArr = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const r = await postJsonWithBody<{ ok?: boolean; slug?: string; error?: string }>('/posts/manual', {
        type,
        title: title.trim(),
        body: body.trim(),
        tags: tagsArr.length > 0 ? tagsArr : undefined,
      });
      setResult(r);
    } catch (e) {
      console.error('handlePublish failed:', e instanceof Error ? e.message : String(e));
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Write and publish a case study directly, bypassing the automated pipeline.
      </p>

      <div className="space-y-4 max-w-3xl">
        <div>
          <label
            htmlFor="manual-type"
            className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 mb-1"
          >
            Type
          </label>
          <select
            id="manual-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-sm text-slate-900 dark:text-slate-100"
          >
            {CASE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="manual-title"
            className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 mb-1"
          >
            Title
          </label>
          <input
            id="manual-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Case study title"
            className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-sm text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-600"
          />
        </div>

        <div>
          <label
            htmlFor="manual-body"
            className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 mb-1"
          >
            Body <span className="text-slate-500 dark:text-slate-400 normal-case">(Markdown)</span>
          </label>
          <textarea
            id="manual-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your case study in Markdown..."
            rows={20}
            className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-sm text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-600 font-mono"
          />
        </div>

        <div>
          <label
            htmlFor="manual-tags"
            className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 mb-1"
          >
            Tags <span className="text-slate-500 dark:text-slate-400 normal-case">(comma-separated)</span>
          </label>
          <input
            id="manual-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="osint, threat-intel, tools"
            className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-sm text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-600"
          />
        </div>

        <button
          onClick={() => void handlePublish()}
          disabled={sending || !title.trim() || !body.trim()}
          className="px-4 py-2 bg-brand-600 text-white rounded text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
        >
          {sending ? 'Publishing…' : 'Publish'}
        </button>

        {result && (
          <div
            className={`mt-4 p-3 rounded text-sm font-mono ${result.ok ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'}`}
          >
            {result.ok ? (
              <>
                Published!{' '}
                <a href={`/blog/${result.slug}`} className="underline" target="_blank" rel="noopener noreferrer">
                  /blog/{result.slug}
                </a>
              </>
            ) : (
              <>Error: {result.error}</>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
