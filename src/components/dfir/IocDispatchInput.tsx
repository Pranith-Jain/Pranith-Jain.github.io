import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crosshair, ExternalLink } from 'lucide-react';
import { detectIoc, getIocPivots, IOC_TYPE_LABEL } from '../../lib/dfir/ioc-detect';

/**
 * Paste-to-dispatch input shown at the top of the /dfir landing.
 *
 * The Cmd+K palette has the same IOC detection + routing, but it's a
 * modal — for the most common workflow ("I have an indicator, where do
 * I go?") an analyst doesn't want to open a palette, hunt for the right
 * pivot row, and press Enter. They want to paste, scan the result, and
 * click. This surfaces the pivot buttons inline.
 *
 * Detection runs synchronously on every keystroke — there's no fetch
 * and the regex set is small. When detection fails (e.g. partially
 * typed indicator), the dispatcher hides itself rather than throwing
 * a "format unsupported" error.
 */
export function IocDispatchInput(): JSX.Element {
  const [value, setValue] = useState('');

  const ioc = useMemo(() => detectIoc(value), [value]);
  const pivots = useMemo(() => (ioc ? getIocPivots(ioc) : []), [ioc]);

  return (
    <section className="mb-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
      <label
        htmlFor="dfir-ioc-dispatch"
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 mb-2"
      >
        <Crosshair size={14} aria-hidden="true" /> Paste an indicator
      </label>
      <input
        id="dfir-ioc-dispatch"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="IP, domain, URL, hash (MD5 / SHA-1 / SHA-256), CVE-2021-44228, T1059, AS15169, email, BTC address…"
        spellCheck={false}
        autoComplete="off"
        className="w-full px-4 py-3 min-h-[48px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
        aria-describedby="dfir-ioc-dispatch-help"
      />
      <p id="dfir-ioc-dispatch-help" className="mt-2 text-[11px] font-mono text-slate-500 dark:text-slate-500">
        Detection runs locally on every keystroke. Pivots appear below when the input matches a known indicator format.
      </p>

      {/* Live feedback row: detected type + pivot buttons. Renders nothing
          when value is empty so the panel doesn't look broken on load. */}
      {value.trim() && !ioc && (
        <p className="mt-3 text-xs font-mono text-amber-600 dark:text-amber-400">
          Unrecognised format. Accepts: IPv4 / IPv6 (e.g. <code className="font-semibold">8.8.8.8</code>), domain (e.g.{' '}
          <code className="font-semibold">example.com</code>), URL (with scheme), hash (MD5 / SHA-1 / SHA-256),
          <code className="font-semibold">CVE-YYYY-NNNNN</code>, <code className="font-semibold">T-NNNN</code>,
          <code className="font-semibold">G-NNNN</code>, ASN, email, or BTC address.
        </p>
      )}

      {ioc && pivots.length > 0 && (
        <>
          <p className="mt-3 text-[11px] font-mono text-slate-500 dark:text-slate-500">
            Detected:{' '}
            <span className="text-slate-800 dark:text-slate-200 font-semibold">{IOC_TYPE_LABEL[ioc.type]}</span> ·
            value: <span className="text-slate-800 dark:text-slate-200 font-mono break-all">{ioc.value}</span>
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pivots.map((p) => {
              const inner = (
                <>
                  <div className="flex items-baseline justify-between gap-2 mb-0.5">
                    <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 inline-flex items-center gap-1">
                      {p.label}
                      {p.external && <ExternalLink size={11} aria-hidden="true" className="opacity-60" />}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed">{p.desc}</p>
                </>
              );
              return (
                <li key={p.path}>
                  {p.external ? (
                    <a
                      href={p.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded border border-brand-500/30 bg-brand-500/5 dark:bg-brand-500/10 p-3 hover:border-brand-500 hover:bg-brand-500/10 transition-colors"
                    >
                      {inner}
                    </a>
                  ) : (
                    <Link
                      to={p.path}
                      className="block rounded border border-brand-500/30 bg-brand-500/5 dark:bg-brand-500/10 p-3 hover:border-brand-500 hover:bg-brand-500/10 transition-colors"
                    >
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
