export interface SpfResult {
  present: boolean;
  policy?: 'fail' | 'softfail' | 'neutral' | 'pass' | 'unknown';
  record?: string;
}
export interface DmarcResult {
  present: boolean;
  policy?: 'reject' | 'quarantine' | 'none';
  pct?: number;
  record?: string;
}
export interface BimiResult {
  present: boolean;
  logo?: string;
}
export interface MtaStsResult {
  present: boolean;
  mode?: 'enforce' | 'testing' | 'none';
  maxAge?: number;
}
export interface TlsRptResult {
  present: boolean;
  rua?: string;
}

export interface EmailAuthInputs {
  spf: SpfResult;
  dmarc: DmarcResult;
  dkimSelectorsFound: string[];
  bimi: BimiResult;
  mtaSts: MtaStsResult;
  tlsRpt: TlsRptResult;
}

export interface EmailAuthEvaluation {
  score: number;
  verdict: 'strong' | 'partial' | 'weak';
  weaknesses: string[];
}

export function parseSpf(txts: string[]): SpfResult {
  const rec = txts.find((t) => t.toLowerCase().startsWith('v=spf1'));
  if (!rec) return { present: false };
  const lower = rec.toLowerCase();
  let policy: SpfResult['policy'] = 'unknown';
  if (lower.includes('-all')) policy = 'fail';
  else if (lower.includes('~all')) policy = 'softfail';
  else if (lower.includes('?all')) policy = 'neutral';
  else if (lower.includes('+all') || lower.endsWith(' all')) policy = 'pass';
  return { present: true, policy, record: rec };
}

export function parseDmarc(txts: string[]): DmarcResult {
  const rec = txts.find((t) => t.toLowerCase().startsWith('v=dmarc1'));
  if (!rec) return { present: false };
  const tags: Record<string, string> = {};
  rec.split(';').forEach((part) => {
    const [k, v] = part.trim().split('=');
    if (k && v) tags[k.toLowerCase()] = v.trim();
  });
  const policy = (tags.p as DmarcResult['policy']) ?? 'none';
  const pct = tags.pct ? Number(tags.pct) : 100;
  return { present: true, policy, pct, record: rec };
}

export function parseBimi(txts: string[]): BimiResult {
  const rec = txts.find((t) => t.toLowerCase().startsWith('v=bimi1'));
  if (!rec) return { present: false };
  const m = rec.match(/l=([^\s;]+)/i);
  return { present: true, logo: m?.[1] };
}

export function parseMtaSts(body: string): MtaStsResult {
  if (!body.includes('STSv1')) return { present: false };
  const lines = body.split(/\r?\n/);
  const get = (key: string) =>
    lines
      .find((l) => l.toLowerCase().startsWith(`${key.toLowerCase()}:`))
      ?.split(':')[1]
      ?.trim();
  const mode = (get('mode') as MtaStsResult['mode']) ?? 'none';
  const maxAge = Number(get('max_age') ?? 0);
  return { present: true, mode, maxAge };
}

export function parseTlsRpt(txts: string[]): TlsRptResult {
  const rec = txts.find((t) => t.toLowerCase().startsWith('v=tlsrptv1'));
  if (!rec) return { present: false };
  const m = rec.match(/rua=([^\s;]+)/i);
  return { present: true, rua: m?.[1] };
}

export function evaluateEmailAuth(i: EmailAuthInputs): EmailAuthEvaluation {
  let score = 0;
  const weaknesses: string[] = [];

  if (i.spf.present) {
    score += i.spf.policy === 'fail' ? 25 : i.spf.policy === 'softfail' ? 15 : 5;
    if (i.spf.policy !== 'fail') weaknesses.push('SPF policy is weaker than -all');
  } else weaknesses.push('SPF missing');

  if (i.dmarc.present) {
    score += i.dmarc.policy === 'reject' ? 30 : i.dmarc.policy === 'quarantine' ? 18 : 6;
    if ((i.dmarc.pct ?? 100) < 100) weaknesses.push(`DMARC pct < 100 (${i.dmarc.pct})`);
    if (i.dmarc.policy === 'none') weaknesses.push('DMARC policy is none (monitoring only)');
  } else weaknesses.push('DMARC missing');

  if (i.dkimSelectorsFound.length > 0) score += 10;
  else weaknesses.push('No common DKIM selector found');

  if (i.mtaSts.present) {
    score += i.mtaSts.mode === 'enforce' ? 15 : 5;
    if (i.mtaSts.mode !== 'enforce') weaknesses.push('MTA-STS not in enforce mode');
  } else weaknesses.push('MTA-STS missing');

  if (i.tlsRpt.present) score += 5;
  if (i.bimi.present) score += 5;

  score = Math.max(0, Math.min(100, score));
  const verdict: EmailAuthEvaluation['verdict'] = score >= 80 ? 'strong' : score >= 50 ? 'partial' : 'weak';
  return { score, verdict, weaknesses };
}
