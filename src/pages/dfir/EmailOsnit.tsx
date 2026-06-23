/**
 * /dfir/email-osnit -- Email OSINT Profile Resolver
 *
 * Build digital identity from email address: GitHub, Gravatar, breach exposure,
 * email reputation, DNS/SPF/DMARC, PGP keys, social hints.
 */

import { useState, type FormEvent } from 'react';
import { BackLink } from '../../components/BackLink';
import {
  ArrowLeft,
  Loader2,
  Shield,
  AlertTriangle,
  Mail,
  Globe,
  ExternalLink,
  User,
  Key,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface EmailProfile {
  email: string;
  localPart: string;
  domain: string;
  gravatar: { hash: string; avatarUrl: string; displayName: string | null; profileUrl: string | null };
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

const RISK_CLR: Record<string, string> = {
  CRITICAL: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  HIGH: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  MEDIUM: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  LOW: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
};

export default function EmailOsnit() {
  const [email, setEmail] = useState('');
  const [profile, setProfile] = useState<EmailProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) return;
    setLoading(true);
    setError(null);
    setProfile(null);
    try {
      const res = await fetch(`/api/v1/email-osnit/profile?email=${encodeURIComponent(email)}`);
      if (!res.ok) throw new Error('Lookup failed');
      setProfile(await res.json());
    } catch {
      setError('Email lookup failed');
    }
    setLoading(false);
  };

  const toggle = (section: string) => setExpanded(expanded === section ? null : section);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2">Email OSINT Profile</h1>
          <p className="text-sm font-mono text-muted max-w-2xl">
            Build digital identity from email — GitHub, Gravatar, breach exposure, reputation, DNS, PGP keys, social
            hints.
          </p>
        </div>
      </div>

      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg font-mono text-tool focus:outline-none focus:border-brand-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 bg-brand-600 dark:bg-brand-500 text-white font-mono text-sm font-semibold rounded-lg hover:bg-brand-700 dark:hover:bg-brand-400 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : 'Resolve'}
          </button>
        </div>
      </form>

      {error && (
        <div className="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 flex items-center gap-2 font-mono text-sm mb-4">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {profile && (
        <div className="space-y-4">
          {/* Header + Risk */}
          <div className="flex items-center gap-4 p-4 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1">
            {profile.gravatar.avatarUrl ? (
              <img src={profile.gravatar.avatarUrl} alt="" className="w-12 h-12 rounded-full" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <User size={20} className="text-slate-400" />
              </div>
            )}
            <div className="flex-1">
              <h2 className="font-display font-bold text-lg">{profile.gravatar.displayName || profile.localPart}</h2>
              <p className="text-meta font-mono text-muted">{profile.email}</p>
            </div>
            <div className="text-right">
              <span
                className={`text-micro font-mono font-semibold px-2 py-0.5 rounded border ${RISK_CLR[profile.riskLevel]}`}
              >
                {profile.riskLevel}
              </span>
              <p className="text-micro font-mono text-muted mt-1">{profile.riskScore}/100</p>
            </div>
          </div>

          <p className="text-meta font-mono text-slate-700 dark:text-slate-300">{profile.summary}</p>

          {/* GitHub */}
          {profile.github.found && (
            <Section
              icon={User}
              title="GitHub Profile"
              color="text-slate-700"
              expanded={expanded === 'github'}
              onToggle={() => toggle('github')}
            >
              <div className="space-y-1.5 text-meta font-mono">
                <p>
                  Username:{' '}
                  <span className="text-slate-900 dark:text-slate-100 font-semibold">{profile.github.username}</span>
                </p>
                {profile.github.company && (
                  <p>
                    Company: <span className="text-slate-900 dark:text-slate-100">{profile.github.company}</span>
                  </p>
                )}
                {profile.github.location && (
                  <p>
                    Location: <span className="text-slate-900 dark:text-slate-100">{profile.github.location}</span>
                  </p>
                )}
                {profile.github.repos !== null && (
                  <p>
                    Public repos: <span className="text-slate-900 dark:text-slate-100">{profile.github.repos}</span>
                  </p>
                )}
                {profile.github.profileUrl && (
                  <a
                    href={profile.github.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 dark:text-brand-400 hover:underline text-mini flex items-center gap-1"
                  >
                    View profile <ExternalLink size={8} />
                  </a>
                )}
              </div>
            </Section>
          )}

          {/* Breach */}
          <Section
            icon={AlertTriangle}
            title={`Breach Exposure (${profile.breach.breachCount})`}
            color={profile.breach.found ? 'text-red-500' : 'text-emerald-500'}
            expanded={expanded === 'breach'}
            onToggle={() => toggle('breach')}
          >
            {profile.breach.found ? (
              <div className="space-y-1.5">
                {profile.breach.breaches.map((b, i) => (
                  <div key={i} className="flex items-center gap-2 text-meta font-mono">
                    <span className="text-slate-900 dark:text-slate-100 font-semibold">{b.name}</span>
                    <span className="text-muted">{b.date}</span>
                    <span className="text-micro px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                      {b.dataClasses.join(', ')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-meta font-mono text-emerald-600 dark:text-emerald-400">No breach exposure detected</p>
            )}
          </Section>

          {/* Reputation */}
          <Section
            icon={Shield}
            title="Email Reputation"
            color="text-violet-500"
            expanded={expanded === 'reputation'}
            onToggle={() => toggle('reputation')}
          >
            <div className="grid grid-cols-2 gap-3 text-meta font-mono">
              <div>
                <span className="text-muted">Score:</span>
                <span className="text-slate-900 dark:text-slate-100 ml-1 font-semibold">
                  {profile.reputation.score ?? 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-muted">Reputation:</span>
                <span className="text-slate-900 dark:text-slate-100 ml-1">
                  {profile.reputation.reputation ?? 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-muted">Suspicious:</span>
                <span
                  className={
                    profile.reputation.suspicious
                      ? 'text-red-600 dark:text-red-400 ml-1'
                      : 'text-emerald-600 dark:text-emerald-400 ml-1'
                  }
                >
                  {profile.reputation.suspicious ? 'Yes' : 'No'}
                </span>
              </div>
              <div>
                <span className="text-muted">References:</span>
                <span className="text-slate-900 dark:text-slate-100 ml-1">{profile.reputation.references}</span>
              </div>
            </div>
          </Section>

          {/* DNS */}
          <Section
            icon={Globe}
            title="DNS & Email Security"
            color="text-sky-500"
            expanded={expanded === 'dns'}
            onToggle={() => toggle('dns')}
          >
            <div className="space-y-2 text-meta font-mono">
              <div className="flex items-center gap-2">
                <span className="text-muted w-16">MX:</span>
                <div className="flex flex-wrap gap-1">
                  {profile.dns.mx.length > 0 ? (
                    profile.dns.mx.map((mx) => (
                      <span
                        key={mx}
                        className="px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300"
                      >
                        {mx}
                      </span>
                    ))
                  ) : (
                    <span className="text-muted">None found</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted w-16">SPF:</span>
                <span
                  className={
                    profile.dns.spf ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  }
                >
                  {profile.dns.spf ? 'Implemented' : 'Missing'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted w-16">DMARC:</span>
                <span
                  className={
                    profile.dns.dmarc ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  }
                >
                  {profile.dns.dmarc ? 'Implemented' : 'Missing'}
                </span>
              </div>
            </div>
          </Section>

          {/* PGP */}
          {profile.pgp.found && (
            <Section
              icon={Key}
              title="PGP Key"
              color="text-amber-500"
              expanded={expanded === 'pgp'}
              onToggle={() => toggle('pgp')}
            >
              <div className="space-y-1 text-meta font-mono">
                {profile.pgp.keyId && (
                  <p>
                    Key ID:{' '}
                    <span className="text-slate-900 dark:text-slate-100 font-semibold">{profile.pgp.keyId}</span>
                  </p>
                )}
                {profile.pgp.uids.length > 0 && (
                  <p>
                    UIDs: <span className="text-slate-900 dark:text-slate-100">{profile.pgp.uids.join(', ')}</span>
                  </p>
                )}
              </div>
            </Section>
          )}

          {/* Social Hints */}
          <Section
            icon={User}
            title="Social Signals"
            color="text-pink-500"
            expanded={expanded === 'social'}
            onToggle={() => toggle('social')}
          >
            <div className="flex flex-wrap gap-2">
              {profile.social.linkedinHint && (
                <span className="text-micro font-mono px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                  LinkedIn likely
                </span>
              )}
              {profile.social.twitterHint && (
                <span className="text-micro font-mono px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300">
                  Twitter/X likely
                </span>
              )}
              {profile.social.redditHint && (
                <span className="text-micro font-mono px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                  Reddit likely
                </span>
              )}
              {!profile.social.linkedinHint && !profile.social.twitterHint && !profile.social.redditHint && (
                <span className="text-meta font-mono text-muted">No strong social signals detected</span>
              )}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  color,
  expanded,
  onToggle,
  children,
}: {
  icon: typeof Mail;
  title: string;
  color: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-100))] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon size={14} className={color} />
          <span className="font-display font-semibold text-sm">{title}</span>
        </div>
        {expanded ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-slate-100 dark:border-[rgb(var(--border-300))] pt-2">{children}</div>
      )}
    </div>
  );
}
