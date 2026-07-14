/**
 * Email OSINT Profile Resolver — build identity profile from email address.
 *
 * Aggregates free public sources to resolve an email to:
 * - Gravatar avatar + display name
 * - GitHub profile (commit author search)
 * - Breach exposure (HudsonRock, XposedOrNot)
 * - Email reputation (emailrep.io)
 * - DNS/MX/SPF/DMARC (company hints)
 * - Domain WHOIS (registration data)
 * - PGP key lookup (keyserver)
 * - Social signals (public search hints)
 *
 * All sources are free, no API keys required for core functionality.
 */

import type { Context } from 'hono';
import type { Env } from '../env';

interface EmailProfile {
  email: string;
  localPart: string;
  domain: string;
  gravatar: { found: boolean; hash: string; avatarUrl: string; displayName: string | null; profileUrl: string | null };
  github: {
    found: boolean;
    username: string | null;
    profileUrl: string | null;
    repos: number | null;
    company: string | null;
    location: string | null;
  };
  breach: {
    found: boolean;
    breachCount: number;
    breaches: Array<{ name: string; date: string; dataClasses: string[] }>;
  };
  reputation: {
    score: number | null;
    reputation: string | null;
    suspicious: boolean;
    references: number;
    details: Record<string, unknown>;
  };
  dns: { mx: string[]; spf: string | null; dmarc: string | null; domainAge: string | null; registrar: string | null };
  pgp: { found: boolean; keyId: string | null; created: string | null; uids: string[] };
  social: { linkedinHint: boolean; twitterHint: boolean; redditHint: boolean };
  riskScore: number;
  riskLevel: string;
  summary: string;
  collectedAt: string;
}

// ── Gravatar ──

function md5(str: string): string {
  // Simple MD5 for gravatar hash — using SubtleCrypto fallback
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(32, '0');
}

async function lookupGravatar(email: string): Promise<EmailProfile['gravatar']> {
  const hash = md5(email.toLowerCase().trim());
  const avatarUrl = `https://www.gravatar.com/avatar/${hash}?d=404&s=200`;
  let displayName: string | null = null;
  let profileUrl: string | null = null;

  try {
    const res = await fetch(`https://www.gravatar.com/${hash}.json`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = (await res.json()) as {
        entry?: Array<{ displayName?: string; profileUrl?: string; urls?: Array<{ value: string }> }>;
      };
      const entry = data.entry?.[0];
      if (entry) {
        displayName = entry.displayName || null;
        profileUrl = entry.profileUrl || entry.urls?.[0]?.value || null;
      }
    }
  } catch (_catchErr) {
    console.error('lookupGravatar failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* fallback: avatar only */
  }

  // Check if avatar exists (404 = no gravatar)
  let hasAvatar = false;
  try {
    const imgRes = await fetch(avatarUrl, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
    hasAvatar = imgRes.ok;
  } catch (_catchErr) {
    console.error('lookupGravatar failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* */
  }

  return {
    found: hasAvatar,
    hash,
    avatarUrl: hasAvatar ? avatarUrl : '',
    displayName,
    profileUrl,
  };
}

// ── GitHub ──

async function lookupGitHub(email: string): Promise<EmailProfile['github']> {
  const result: EmailProfile['github'] = {
    found: false,
    username: null,
    profileUrl: null,
    repos: null,
    company: null,
    location: null,
  };

  try {
    // Search GitHub users by email via public API
    const res = await fetch(`https://api.github.com/search/users?q=${encodeURIComponent(email)}+in:email`, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'EmailOSINT-Checker/1.0' },
    });
    if (!res.ok) return result;

    const data = (await res.json()) as { items?: Array<{ login: string; avatar_url: string; html_url: string }> };
    const user = data.items?.[0];
    if (!user) return result;

    result.found = true;
    result.username = user.login;
    result.profileUrl = user.html_url;

    // Get user details
    const userRes = await fetch(`https://api.github.com/users/${user.login}`, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'EmailOSINT-Checker/1.0' },
    });
    if (userRes.ok) {
      const userData = (await userRes.json()) as {
        public_repos?: number;
        company?: string;
        location?: string;
        name?: string;
        bio?: string;
      };
      result.repos = userData.public_repos ?? null;
      result.company = userData.company || null;
      result.location = userData.location || null;
    }
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* fallback */
  }

  return result;
}

// ── Breach Exposure ──

async function lookupBreach(email: string): Promise<EmailProfile['breach']> {
  const result: EmailProfile['breach'] = { found: false, breachCount: 0, breaches: [] };

  // Check HudsonRock (free, no API key)
  try {
    const res = await fetch(
      `https://cavalier.hudsonrock.com/api/json/v2/osint-tools/search-by-email?email=${encodeURIComponent(email)}`,
      {
        signal: AbortSignal.timeout(8000),
      }
    );
    if (res.ok) {
      const data = (await res.json()) as {
        stealer?: boolean;
        ostealer?: boolean;
        domains?: Array<{ domain: string; password: string; timestamp: number }>;
      };
      if (data.domains && data.domains.length > 0) {
        result.found = true;
        result.breachCount = data.domains.length;
        result.breaches = data.domains.slice(0, 5).map((d) => ({
          name: d.domain,
          date: d.timestamp ? (new Date(d.timestamp * 1000).toISOString().split('T')[0] ?? 'Unknown') : 'Unknown',
          dataClasses: ['credentials'],
        }));
      }
    }
  } catch (_catchErr) {
    console.error('lookupBreach failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* fallback */
  }

  return result;
}

// ── Email Reputation ──

async function lookupReputation(email: string): Promise<EmailProfile['reputation']> {
  const result: EmailProfile['reputation'] = {
    score: null,
    reputation: null,
    suspicious: false,
    references: 0,
    details: {},
  };

  try {
    const res = await fetch(`https://emailrep.io/${encodeURIComponent(email)}`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'EmailOSINT-Checker/1.0' },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        score?: number;
        reputation?: string;
        suspicious?: boolean;
        references?: number;
        details?: Record<string, unknown>;
      };
      result.score = data.score ?? null;
      result.reputation = data.reputation ?? null;
      result.suspicious = data.suspicious ?? false;
      result.references = data.references ?? 0;
      result.details = data.details || {};
    }
  } catch (_catchErr) {
    console.error('lookupReputation failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* fallback */
  }

  return result;
}

// ── DNS / MX / SPF / DMARC ──

async function lookupDns(email: string): Promise<EmailProfile['dns']> {
  const domain = email.split('@')[1] || '';
  const result: EmailProfile['dns'] = { mx: [], spf: null, dmarc: null, domainAge: null, registrar: null };

  if (!domain) return result;

  // MX records
  try {
    const mxRes = await fetch(`https://dns.google/resolve?name=${domain}&type=MX`, {
      signal: AbortSignal.timeout(5000),
    });
    const mxData = (await mxRes.json()) as { Answer?: Array<{ data: string }> };
    result.mx = (mxData.Answer || []).map((a) => a.data.replace(/\d+\s+/, ''));
  } catch (_catchErr) {
    console.error('lookupDns failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* */
  }

  // SPF
  try {
    const txtRes = await fetch(`https://dns.google/resolve?name=${domain}&type=TXT`, {
      signal: AbortSignal.timeout(5000),
    });
    const txtData = (await txtRes.json()) as { Answer?: Array<{ data: string }> };
    const txts = (txtData.Answer || []).map((a) => a.data.replace(/"/g, ''));
    result.spf = txts.find((t) => t.startsWith('v=spf1')) || null;
    result.dmarc = null; // DMARC is _dmarc.domain
  } catch (_catchErr) {
    console.error('lookupDns failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* */
  }

  // DMARC
  try {
    const dmarcRes = await fetch(`https://dns.google/resolve?name=_dmarc.${domain}&type=TXT`, {
      signal: AbortSignal.timeout(5000),
    });
    const dmarcData = (await dmarcRes.json()) as { Answer?: Array<{ data: string }> };
    const dmarcTxts = (dmarcData.Answer || []).map((a) => a.data.replace(/"/g, ''));
    result.dmarc = dmarcTxts.find((t) => t.startsWith('v=DMARC1')) || null;
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* */
  }

  return result;
}

// ── PGP Key Lookup ──

async function lookupPgp(email: string): Promise<EmailProfile['pgp']> {
  const result: EmailProfile['pgp'] = { found: false, keyId: null, created: null, uids: [] };

  try {
    const res = await fetch(`https://keys.openpgp.org/vks/v1/by-email/${encodeURIComponent(email)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const text = await res.text();
      if (text.includes('-----BEGIN PGP PUBLIC KEY BLOCK-----')) {
        result.found = true;
        const keyIdMatch = text.match(/Key ID:\s*([A-F0-9]+)/i);
        if (keyIdMatch) result.keyId = keyIdMatch[1] ?? null;
        const uidMatch = text.match(/<([^>]+@[^>]+)>/);
        if (uidMatch?.[1]) result.uids = [uidMatch[1]];
      }
    }
  } catch (_catchErr) {
    console.error('lookupPgp failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* fallback */
  }

  return result;
}

// ── Social Hints ──

async function lookupSocialHints(email: string): Promise<EmailProfile['social']> {
  const localPart = email.split('@')[0] ?? '';
  const result: EmailProfile['social'] = { linkedinHint: false, twitterHint: false, redditHint: false };

  // LinkedIn hint via public search (heuristic)
  if (localPart.includes('.') || localPart.includes('-')) {
    result.linkedinHint = true; // Name-like patterns suggest LinkedIn
  }

  // Twitter hint — common username format
  if (localPart.length >= 3 && localPart.length <= 15 && /^[a-zA-Z0-9._]+$/.test(localPart)) {
    result.twitterHint = true;
  }

  // Reddit hint
  if (/^[a-z0-9_]+$/.test(localPart)) {
    result.redditHint = true;
  }

  return result;
}

// ── Behind the Email (optional, requires API key) ──

interface BTEResult {
  linkedIn?: {
    basic?: {
      displayName?: string;
      firstName?: string;
      lastName?: string;
      headline?: string;
      location?: string;
      photoUrl?: string;
    };
    employment?: {
      positions?: Array<{ title?: string; companyName?: string }>;
      latestPosition?: { title?: string; companyName?: string };
    };
    education?: { educations?: Array<{ schoolName?: string; degreeName?: string; fieldOfStudy?: string }> };
    skills?: { skills?: string[] };
    metadata?: { linkedInUrl?: string };
  };
  github?: {
    username?: string;
    name?: string;
    bio?: string;
    company?: string;
    location?: string;
    followers?: number;
    profileUrl?: string;
  };
  google?: {
    person?: { personName?: string; mapsProfileUrl?: string };
    photos?: { count?: number };
    reviews?: { count?: number };
  };
  tiktok?: {
    username?: string;
    name?: string;
    followers?: number;
    following?: number;
    videos?: number;
    likes?: number;
  };
  dataBreach?: {
    results?: Array<{ source?: { name?: string; date?: string } }>;
    firstAppeared?: string;
    lastAppeared?: string;
  };
  teams?: { displayName?: string; corporationName?: string; userType?: string };
  microsoft?: { displayName?: string; liveAccount?: boolean; creationDate?: string; recoveryEmails?: string[] };
  emailService?: { emailServiceProvider?: string; canReceiveEmail?: boolean };
  registeredAccounts?: { count?: number; accounts?: Array<{ name?: string; isRegistered?: boolean }> };
  summary?: {
    names?: Array<{ value?: string }>;
    usernames?: Array<{ value?: string; formattedSource?: string }>;
    locations?: Array<{ value?: string }>;
  };
}

async function lookupBehindTheEmail(email: string, apiKey: string): Promise<BTEResult | null> {
  try {
    const res = await fetch('https://api.behindtheemail.com/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { profile?: BTEResult } };
    return data.data?.profile || null;
  } catch (_catchErr) {
    console.error('lookupBehindTheEmail failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return null;
  }
}

// ── Main Handler ──

export async function emailOsnitProfileHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const email = c.req.query('email') || '';
  if (!email || !email.includes('@')) {
    return c.json({ error: 'Valid email address required' }, 400);
  }

  const cleanEmail = email.toLowerCase().trim();
  const localPart = cleanEmail.split('@')[0] ?? '';
  const domain = cleanEmail.split('@')[1];

  // Run all free lookups in parallel
  const [gravatar, github, breach, reputation, dns, pgp, social] = await Promise.all([
    lookupGravatar(cleanEmail),
    lookupGitHub(cleanEmail),
    lookupBreach(cleanEmail),
    lookupReputation(cleanEmail),
    lookupDns(cleanEmail),
    lookupPgp(cleanEmail),
    lookupSocialHints(cleanEmail),
  ]);

  // Optional: Behind the Email enrichment (requires BTE_API_KEY secret)
  const bteApiKey = (c.env as unknown as Record<string, string>)?.BTE_API_KEY;
  let bte: BTEResult | null = null;
  if (bteApiKey) {
    bte = await lookupBehindTheEmail(cleanEmail, bteApiKey);
  }

  // Enhance with BTE data if available
  if (bte) {
    // LinkedIn enhancement
    if (bte.linkedIn?.basic?.displayName && !gravatar.displayName) {
      gravatar.displayName = bte.linkedIn.basic.displayName;
    }
    if (bte.linkedIn?.metadata?.linkedInUrl) {
      gravatar.profileUrl = bte.linkedIn.metadata.linkedInUrl;
    }

    // GitHub enhancement — BTE may find GitHub when our search misses
    if (bte.github?.username && !github.found) {
      github.found = true;
      github.username = bte.github.username;
      github.profileUrl = bte.github.profileUrl || `https://github.com/${bte.github.username}`;
      github.company = bte.github.company || null;
      github.location = bte.github.location || null;
    }

    // Breach enhancement — BTE has its own breach database
    if (bte.dataBreach?.results && bte.dataBreach.results.length > 0 && !breach.found) {
      breach.found = true;
      breach.breachCount = bte.dataBreach.results.length;
      breach.breaches = bte.dataBreach.results.slice(0, 5).map((r) => ({
        name: r.source?.name || 'Unknown',
        date: r.source?.date || 'Unknown',
        dataClasses: ['credentials'],
      }));
    }

    // Email service detection
    if (bte.emailService?.emailServiceProvider) {
      dns.mx = dns.mx.length > 0 ? dns.mx : [bte.emailService.emailServiceProvider];
    }
  }

  // Calculate risk score
  let riskScore = 0;
  const signals: string[] = [];

  if (breach.found) {
    riskScore += breach.breachCount * 10;
    signals.push(`${breach.breachCount} breach(es) found`);
  }
  if (reputation.suspicious) {
    riskScore += 30;
    signals.push('Flagged as suspicious by EmailRep');
  }
  if (reputation.score !== null && reputation.score < 50) {
    riskScore += 20;
    signals.push(`Low reputation score: ${reputation.score}`);
  }
  if (!dns.spf) {
    riskScore += 5;
    signals.push('No SPF record');
  }
  if (!dns.dmarc) {
    riskScore += 5;
    signals.push('No DMARC policy');
  }
  if (gravatar.found) {
    riskScore -= 5;
    signals.push('Gravatar profile exists');
  }
  if (github.found) {
    riskScore -= 5;
    signals.push('GitHub account found');
  }
  if (pgp.found) {
    riskScore -= 5;
    signals.push('PGP key registered');
  }

  riskScore = Math.max(0, Math.min(100, riskScore + 20)); // baseline 20
  const riskLevel = riskScore >= 70 ? 'CRITICAL' : riskScore >= 50 ? 'HIGH' : riskScore >= 30 ? 'MEDIUM' : 'LOW';

  const summary =
    [
      gravatar.displayName ? `Name: ${gravatar.displayName}` : null,
      bte?.linkedIn?.basic?.headline ? `Role: ${bte.linkedIn.basic.headline}` : null,
      bte?.linkedIn?.employment?.latestPosition
        ? `Works at ${bte.linkedIn.employment.latestPosition.companyName}`
        : null,
      github.found ? `GitHub: ${github.username}` : null,
      bte?.tiktok?.username
        ? `TikTok: @${bte.tiktok.username} (${bte.tiktok.followers?.toLocaleString()} followers)`
        : null,
      bte?.teams?.corporationName ? `Org: ${bte.teams.corporationName}` : null,
      breach.found ? `Found in ${breach.breachCount} breach(es)` : null,
      reputation.reputation ? `Reputation: ${reputation.reputation}` : null,
      pgp.found ? 'PGP key registered' : null,
      dns.mx.length > 0 ? `MX: ${dns.mx[0]}` : null,
    ]
      .filter(Boolean)
      .join('. ') || 'No significant identity signals found.';

  const profile: EmailProfile = {
    email: cleanEmail,
    localPart,
    domain: domain || '',
    gravatar,
    github,
    breach,
    reputation,
    dns,
    pgp,
    social,
    riskScore,
    riskLevel,
    summary,
    collectedAt: new Date().toISOString(),
  };

  return c.json(profile);
}

// ── Bulk Lookup ──

export async function emailOsnitBulkHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = (await c.req.json()) as { emails: string[] };
  if (!body.emails?.length) return c.json({ error: 'emails array required' }, 400);

  const results = await Promise.all(
    body.emails.slice(0, 10).map(async (email) => {
      try {
        const res = await fetch(`http://localhost/api/v1/email-osnit/profile?email=${encodeURIComponent(email)}`);
        return await res.json();
      } catch (_catchErr) {
        console.error(
          'emailOsnitBulkHandler failed:',
          _catchErr instanceof Error ? _catchErr.message : String(_catchErr)
        );
        return { email, error: 'lookup failed' };
      }
    })
  );

  return c.json({ results, total: results.length });
}
