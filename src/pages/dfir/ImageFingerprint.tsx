import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Image as ImageIcon } from 'lucide-react';

/** 8x8 average-hash + difference-hash. Pure canvas, fully client-side. */
async function hashes(file: File): Promise<{ a: string; d: string }> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = 9;
  c.height = 8;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, 9, 8);
  const px = ctx.getImageData(0, 0, 9, 8).data;
  const gray: number[] = [];
  for (let i = 0; i < 9 * 8; i++) {
    const o = i * 4;
    gray.push(0.299 * px[o]! + 0.587 * px[o + 1]! + 0.114 * px[o + 2]!);
  }
  // aHash on the left 8x8 block.
  const block: number[] = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) block.push(gray[y * 9 + x]!);
  const avg = block.reduce((s, n) => s + n, 0) / 64;
  let aBits = '';
  for (const g of block) aBits += g >= avg ? '1' : '0';
  // dHash — compare each pixel to its right neighbour (9 wide → 8 diffs/row).
  let dBits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) dBits += gray[y * 9 + x]! < gray[y * 9 + x + 1]! ? '1' : '0';
  const toHex = (b: string) => (b.match(/.{4}/g) ?? []).map((n) => parseInt(n, 2).toString(16)).join('');
  return { a: toHex(aBits), d: toHex(dBits) };
}

function hamming(h1: string, h2: string): number {
  let d = 0;
  for (let i = 0; i < Math.min(h1.length, h2.length); i++) {
    let x = parseInt(h1[i]!, 16) ^ parseInt(h2[i]!, 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

export default function ImageFingerprint(): JSX.Element {
  const [r1, setR1] = useState<{ a: string; d: string } | null>(null);
  const [r2, setR2] = useState<{ a: string; d: string } | null>(null);

  const cmp =
    r1 && r2
      ? (() => {
          const dd = hamming(r1.d, r2.d);
          return { dist: dd, sim: Math.round((1 - dd / 64) * 100) };
        })()
      : null;

  const Slot = ({ n, set, r }: { n: number; set: (v: { a: string; d: string }) => void; r: typeof r1 }) => (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-3">
      <label className="block text-meta font-mono mb-2 cursor-pointer text-brand-600 dark:text-brand-400">
        Image {n} — choose…
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) set(await hashes(f));
          }}
        />
      </label>
      {r && (
        <div className="font-mono text-mini text-slate-600 dark:text-slate-400 space-y-0.5 break-all">
          <div>aHash: {r.a}</div>
          <div>dHash: {r.d}</div>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir/tools/osint"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> OSINT tools
      </Link>
      <h1 className="font-display font-bold text-2xl flex items-center gap-2">
        <ImageIcon size={22} className="text-brand-600 dark:text-brand-400" />
        Image Fingerprint & Similarity
      </h1>
      <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mt-1 mb-6">
        Perceptual aHash + dHash computed in-browser. Compare two images for near-duplicate / re-upload detection.
        Nothing is uploaded.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Slot n={1} set={setR1} r={r1} />
        <Slot n={2} set={setR2} r={r2} />
      </div>

      {cmp && (
        <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4">
          <div className="font-mono text-sm">
            dHash Hamming distance: <span className="font-bold">{cmp.dist}</span> / 64 ·{' '}
            <span
              className={
                cmp.sim >= 90 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
              }
            >
              ~{cmp.sim}% similar
            </span>
          </div>
          <p className="font-mono text-mini text-slate-500 mt-1">
            ≤ 10 distance ⇒ likely the same image (resized/recompressed). High distance ⇒ unrelated.
          </p>
        </div>
      )}
    </div>
  );
}
