import type { Context } from 'hono';
import type { Env } from '../env';
import { pinnedFetch } from '../lib/ssrf-guard';

interface FormField {
  type: string;
  name: string;
  placeholder: string;
}

interface PhishingAnalysisReport {
  url: string;
  fetched: boolean;
  status?: number;
  content_type?: string;
  title?: string;
  forms: FormField[];
  external_links: number;
  scripts: number;
  iframes: number;
  has_password_field: boolean;
  has_submit_button: boolean;
  suspicious_keywords: string[];
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  ip?: string;
  asn?: string;
  org?: string;
  error?: string;
}

const SUSPICIOUS_KEYWORDS = [
  'password',
  'login',
  'sign in',
  'signin',
  'verify',
  'verification',
  'account',
  'update',
  'confirm',
  'secure',
  'unlock',
  'suspend',
  'restricted',
  'limited',
  'banking',
  'credential',
  'authenticate',
  '2fa',
  'two-factor',
  'mfa',
  'otp',
  'one-time',
  'recovery',
  'billing',
  'invoice',
  'payment',
  'refund',
  'wallet',
  'paypal',
  'apple id',
  'icloud',
  'office 365',
  'microsoft',
  'outlook',
  'gmail',
  'google',
  'facebook',
  'instagram',
  'whatsapp',
];

export async function phishingAnalyzeAutoHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const url = (c.req.query('url') ?? '').trim();
  if (!url) return c.json({ error: 'url query param required' }, 400);

  try {
    // pinnedFetch: SSRF guard on the attacker-controlled URL. Browser UA so
    // real phishing kits / CDN-fronted targets don't 403/429 a bot UA (the old
    // PhishingAnalyzer/1.0 UA was why most real pages failed to analyze).
    const pageRes = await pinnedFetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    const html = await pageRes.text();
    const lower = html.toLowerCase();
    const contentType = pageRes.headers.get('content-type') ?? '';

    // Parse title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1]!.trim() : undefined;

    // Extract forms
    const forms: FormField[] = [];
    const inputRe = /<input[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = inputRe.exec(html)) !== null) {
      const raw = m[0];
      const type = (raw.match(/type\s*=\s*["']([^"']*)["']/i)?.[1] ?? 'text').toLowerCase();
      const name = (raw.match(/name\s*=\s*["']([^"']*)["']/i)?.[1] ?? '').toLowerCase();
      const placeholder = (raw.match(/placeholder\s*=\s*["']([^"']*)["']/i)?.[1] ?? '').toLowerCase();
      forms.push({ type, name, placeholder });
    }

    // Check for password fields
    const hasPasswordField = forms.some((f) => f.type === 'password');
    const hasSubmitButton = /<button[^>]*type\s*=\s*["']submit["']|<input[^>]*type\s*=\s*["']submit["']/i.test(html);

    // Suspicious keywords
    const suspiciousKeywords = SUSPICIOUS_KEYWORDS.filter((kw) => lower.includes(kw));

    // Scripts and iframes
    const scripts = (html.match(/<script/gi) ?? []).length;
    const iframes = (html.match(/<iframe/gi) ?? []).length;
    const externalLinks = (html.match(/<a\s+[^>]*href=["']https?:\/\//gi) ?? []).length;

    // Risk scoring
    let riskScore = 0;
    if (hasPasswordField) riskScore += 25;
    if (hasSubmitButton) riskScore += 10;
    if (suspiciousKeywords.length > 3) riskScore += 20;
    if (suspiciousKeywords.length > 6) riskScore += 10;
    if (iframes > 0) riskScore += 10;
    if (externalLinks > 10) riskScore += 5;
    if (scripts > 10) riskScore += 5;
    if (forms.length > 3) riskScore += 5;
    if (pageRes.redirected) riskScore += 10;

    const riskLevel: PhishingAnalysisReport['risk_level'] =
      riskScore >= 70 ? 'critical' : riskScore >= 50 ? 'high' : riskScore >= 30 ? 'medium' : 'low';

    // Try to extract IP from resolved URL
    let ip: string | undefined;
    try {
      const hostname = new URL(pageRes.url || url).hostname;
      const dnsRes = await fetch(`https://cloudflare-dns.com/dns-query?name=${hostname}&type=A`, {
        headers: { accept: 'application/dns-json' },
        signal: AbortSignal.timeout(3000),
      });
      if (dnsRes.ok) {
        const dnsData = (await dnsRes.json()) as { Answer?: Array<{ data: string }> };
        ip = dnsData.Answer?.[0]?.data;
      }
    } catch {
      /* best-effort */
    }

    return c.json(
      {
        url: pageRes.url || url,
        fetched: true,
        status: pageRes.status,
        content_type: contentType,
        title,
        forms,
        external_links: externalLinks,
        scripts,
        iframes,
        has_password_field: hasPasswordField,
        has_submit_button: hasSubmitButton,
        suspicious_keywords: suspiciousKeywords,
        risk_score: riskScore,
        risk_level: riskLevel,
        ip,
      } satisfies PhishingAnalysisReport,
      200,
      { 'Cache-Control': 'public, max-age=60' }
    );
  } catch (e) {
    return c.json(
      {
        url,
        fetched: false,
        forms: [],
        external_links: 0,
        scripts: 0,
        iframes: 0,
        has_password_field: false,
        has_submit_button: false,
        suspicious_keywords: [],
        risk_score: 0,
        risk_level: 'low',
        error: e instanceof Error ? e.message : 'fetch failed',
      } satisfies PhishingAnalysisReport,
      200
    );
  }
}
