import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Copy, Check, ExternalLink, Rss } from 'lucide-react';

/**
 * CTI Feeds / Export — surfaces the machine-readable threat-intel this
 * site *produces* (built in the CTI program): a STIX 2.1 bundle, a
 * read-only TAXII 2.1 server, and a MISP feed of the aggregated abuse.ch
 * + community IOCs. This page makes those endpoints discoverable and
 * documents how to wire them into OpenCTI / MISP / TheHive.
 */

const ORIGIN = 'https://pranithjain.qzz.io';
const STIX_URL = `${ORIGIN}/api/v1/ioc-correlation/stix.json`;
const TAXII_DISCOVERY = `${ORIGIN}/api/v1/taxii2/`;
const TAXII_COLLECTION = `${ORIGIN}/api/v1/taxii2/api/collections/a1f5c2e0-1d3b-4c7a-9e21-pranithjainioc/objects/`;
const MISP_MANIFEST = `${ORIGIN}/api/v1/cti/misp/manifest.json`;

function Copyable({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2">
      <code className="flex-1 text-[12px] font-mono break-all text-slate-700 dark:text-slate-300">{value}</code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        }}
        aria-label="Copy"
        className="shrink-0 inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
      >
        {done ? <Check size={12} /> : <Copy size={12} />} {done ? 'copied' : 'copy'}
      </button>
    </div>
  );
}

export default function CtiFeeds(): JSX.Element {
  const [count, setCount] = useState<number | null>(null);
  const [countErr, setCountErr] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(STIX_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((b: { objects?: { type?: string }[] }) => {
        if (!alive) return;
        setCount((b.objects ?? []).filter((o) => o.type === 'indicator').length);
      })
      .catch(() => alive && setCountErr(true));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2">CTI Feeds / Export</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-4 max-w-2xl leading-relaxed">
          This site doesn’t just read threat intel — it <strong>publishes</strong> it. The aggregated abuse.ch +
          community indicators are available as a standards-compliant STIX&nbsp;2.1 bundle, a read-only TAXII&nbsp;2.1
          server, and a MISP feed — drop the URLs straight into OpenCTI, MISP, or TheHive.
        </p>
        <p className="text-[13px] font-mono text-slate-500 mb-8 inline-flex items-center gap-2">
          <Rss size={13} className="text-brand-600 dark:text-brand-400" />
          {countErr
            ? 'currently published: (count unavailable — endpoint still live)'
            : count === null
              ? 'loading current indicator count…'
              : `currently publishing ${count} indicators · TLP:CLEAR · refreshed hourly`}
        </p>
      </div>

      <div className="space-y-8">
        <section>
          <h2 className="font-display font-semibold text-lg mb-1">STIX 2.1 bundle</h2>
          <p className="text-[13px] text-slate-600 dark:text-slate-400 mb-2">
            A single GET returns a STIX 2.1 <code className="font-mono">bundle</code> (identity + indicator SDOs with
            proper patterns &amp; external references). Ideal for a one-shot import or a scheduled pull.
          </p>
          <Copyable value={STIX_URL} />
          <pre className="mt-2 text-[12px] font-mono text-slate-500 whitespace-pre-wrap break-all">
            {`curl -s ${STIX_URL} | jq '.objects | length'`}
          </pre>
        </section>

        <section>
          <h2 className="font-display font-semibold text-lg mb-1">TAXII 2.1 (read-only)</h2>
          <p className="text-[13px] text-slate-600 dark:text-slate-400 mb-2">
            Point any TAXII 2.1 client at the <strong>discovery URL</strong> — it advertises one API root and a single
            collection of current malicious indicators. No auth.
          </p>
          <div className="space-y-2">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500">discovery</span>
              <Copyable value={TAXII_DISCOVERY} />
            </div>
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500">collection objects</span>
              <Copyable value={TAXII_COLLECTION} />
            </div>
          </div>
          <p className="text-[13px] text-slate-600 dark:text-slate-400 mt-3">
            <strong>OpenCTI:</strong> add a <em>TAXII 2.1</em> connector with the discovery URL above, no credentials.
            <br />
            <strong>TheHive/Cortex &amp; STIX clients:</strong> same discovery URL; media type{' '}
            <code className="font-mono break-all">application/taxii+json;version=2.1</code>.
          </p>
        </section>

        <section>
          <h2 className="font-display font-semibold text-lg mb-1">MISP feed</h2>
          <p className="text-[13px] text-slate-600 dark:text-slate-400 mb-2">
            MISP-feed format (manifest + event JSON). In MISP: <em>Sync Actions → Feeds → Add Feed</em>, source format{' '}
            <code className="font-mono">MISP</code>, URL =
          </p>
          <Copyable value={MISP_MANIFEST.replace(/manifest\.json$/, '')} />
          <p className="text-[12px] text-slate-500 mt-2">
            (MISP appends <code className="font-mono">manifest.json</code> and the event UUID automatically.) Attributes
            are tagged <code className="font-mono">tlp:clear</code> + <code className="font-mono">type:OSINT</code> with{' '}
            <code className="font-mono">to_ids</code> set.
          </p>
        </section>

        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-2">Source &amp; caveats</h3>
          <ul className="text-[13px] text-slate-600 dark:text-slate-400 space-y-1 list-disc pl-5">
            <li>Indicators are correlated from abuse.ch (URLhaus / ThreatFox / MalwareBazaar) + community feeds.</li>
            <li>Edge-cached ~1h; treat freshness accordingly. Confidence is per-source weighted.</li>
            <li>TLP:CLEAR — usable, but verify before blocking in production; OSINT can carry false positives.</li>
            <li>
              Browse the same data interactively at{' '}
              <Link to="/threatintel/ioc-correlation" className="text-brand-600 dark:text-brand-400 hover:underline">
                IOC Correlation
              </Link>
              .
            </li>
          </ul>
          <a
            href={STIX_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-3 text-[12px] font-mono text-brand-600 dark:text-brand-400 hover:underline"
          >
            open the live STIX bundle <ExternalLink size={11} />
          </a>
        </section>
      </div>
    </div>
  );
}
