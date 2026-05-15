import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ScanLine } from 'lucide-react';

const ENTITY: Array<[string, RegExp]> = [
  ['URLs', /\bhttps?:\/\/[^\s"'<>]+/gi],
  ['Domains', /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi],
  ['IPv4', /\b(?:\d{1,3}\.){3}\d{1,3}\b/g],
  ['Emails', /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi],
  ['BTC', /\b(?:bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}\b/g],
  ['ETH', /\b0x[a-fA-F0-9]{40}\b/g],
  ['Hashes', /\b[a-fA-F0-9]{32,64}\b/g],
];

function entities(text: string): Array<[string, string[]]> {
  const out: Array<[string, string[]]> = [];
  for (const [name, re] of ENTITY) {
    const m = [...new Set(text.match(re) ?? [])];
    if (m.length) out.push([name, m.slice(0, 50)]);
  }
  return out;
}

export default function ScreenshotIntel(): JSX.Element {
  const [qr, setQr] = useState<string | null>(null);
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null);
  const [ents, setEnts] = useState<Array<[string, string[]]>>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  async function analyze(file: File) {
    setBusy(true);
    setQr(null);
    setMeta(null);
    setEnts([]);
    setNote('');
    try {
      // EXIF / metadata (exifr — already a dependency)
      try {
        const exifr = (await import('exifr')).default;
        const m = await exifr.parse(file, { gps: true });
        if (m) setMeta(m as Record<string, unknown>);
      } catch {
        /* no exif */
      }
      // QR decode (jsQR — lazy chunk, tiny pure-JS, no wasm)
      const bmp = await createImageBitmap(file);
      const cv = document.createElement('canvas');
      cv.width = bmp.width;
      cv.height = bmp.height;
      const ctx = cv.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const img = ctx.getImageData(0, 0, cv.width, cv.height);
      const jsQR = (await import('jsqr')).default;
      const code = jsQR(img.data, img.width, img.height);
      if (code?.data) {
        setQr(code.data);
        setEnts(entities(`${code.data} ${file.name}`));
      } else {
        setQr('');
        setEnts(entities(file.name));
        setNote('No QR/barcode detected. OCR text extraction is a planned follow-up (needs a self-hosted OCR engine).');
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir/tools/osint"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> OSINT tools
      </Link>
      <h1 className="font-display font-bold text-2xl flex items-center gap-2">
        <ScanLine size={22} className="text-brand-600 dark:text-brand-400" />
        Screenshot Intelligence
      </h1>
      <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mt-1 mb-6">
        Drop a screenshot/photo — decodes embedded QR codes, reads EXIF/GPS metadata, and pulls OSINT entities (URLs,
        domains, IPs, emails, crypto addresses, hashes) from the decoded content. 100% client-side.
      </p>

      <label className="inline-block px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 cursor-pointer font-mono text-[12px]">
        {busy ? 'analyzing…' : 'Choose image…'}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void analyze(f);
          }}
        />
      </label>
      {note && <p className="mt-3 font-mono text-[12px] text-amber-600 dark:text-amber-400">{note}</p>}

      {qr ? (
        <div className="mt-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">QR / barcode payload</div>
          <code className="font-mono text-[12px] break-all text-slate-900 dark:text-slate-100">{qr}</code>
        </div>
      ) : null}

      {ents.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {ents.map(([k, vs]) => (
            <div
              key={k}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
            >
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">
                {k} · {vs.length}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {vs.map((v) => (
                  <span
                    key={v}
                    className="font-mono text-[11px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 break-all"
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {meta && (
        <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-2">EXIF / metadata</div>
          <pre className="font-mono text-[11px] overflow-auto max-h-[40vh] text-slate-700 dark:text-slate-300">
            {JSON.stringify(meta, (_k, v) => (v instanceof Date ? v.toISOString() : v), 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
