/**
 * Email hygiene grading — scores an email domain 0-100 + A-F based on
 * disposable/MX/free/role checks. Helps assess whether an email address
 * is legitimate, disposable, or suspicious.
 *
 * Ported from cti-expert's /email-hygiene concept (7onez/cti-expert).
 */

export interface EmailHygieneResult {
  email: string;
  domain: string;
  localPart: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  isDisposable: boolean;
  isFreeProvider: boolean;
  isRoleAddress: boolean;
  hasMx: boolean | null;
  notes: string[];
}

const EMAIL_RE = /^([^@]+)@([^@]+\.[^@]+)$/;

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
  'throwaway.email',
  'yopmail.com',
  'getnada.com',
  'temp-mail.org',
  'dispostable.com',
  'sharklasers.com',
  'guerrillamailblock.com',
  'spam4.me',
  'maildrop.cc',
  'fakeinbox.com',
  'mailnesia.com',
  'tempinbox.com',
  'trashmail.com',
  'trashmail.net',
  'trashmail.me',
  'mytemp.email',
  'tempemail.net',
  'throwam.com',
  'mailcatch.com',
  'mohmal.com',
  'tempmailo.com',
  'emailondeck.com',
  'mintemail.com',
  'tempmailaddress.com',
]);

const FREE_PROVIDERS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'aol.com',
  'icloud.com',
  'protonmail.com',
  'proton.me',
  'zoho.com',
  'mail.com',
  'gmx.com',
  'yandex.com',
  'msn.com',
  'me.com',
  'mac.com',
]);

const ROLE_PREFIXES = new Set([
  'admin',
  'administrator',
  'info',
  'support',
  'sales',
  'contact',
  'help',
  'webmaster',
  'postmaster',
  'abuse',
  'security',
  'noreply',
  'no-reply',
  'donotreply',
  'root',
  'sysadmin',
  'operator',
  'team',
  'office',
  'marketing',
  'hr',
  'billing',
  'service',
  'hostmaster',
]);

export function gradeEmail(email: string): EmailHygieneResult {
  const trimmed = email.trim().toLowerCase();
  const match = trimmed.match(EMAIL_RE);
  const notes: string[] = [];

  if (!match) {
    return {
      email,
      domain: '',
      localPart: '',
      score: 0,
      grade: 'F',
      isDisposable: false,
      isFreeProvider: false,
      isRoleAddress: false,
      hasMx: null,
      notes: ['Invalid email format — must be local@domain.tld'],
    };
  }

  const localPart = match[1] ?? '';
  const domain = match[2] ?? '';
  let score = 100;

  const isDisposable = DISPOSABLE_DOMAINS.has(domain);
  const isFreeProvider = FREE_PROVIDERS.has(domain);
  const isRoleAddress = ROLE_PREFIXES.has(localPart);

  if (isDisposable) {
    score -= 60;
    notes.push('Disposable/temporary email domain — high risk, likely not a real identity');
  }

  if (isFreeProvider) {
    score -= 15;
    notes.push('Free email provider — lower trust than a corporate domain');
  }

  if (isRoleAddress) {
    score -= 20;
    notes.push(`Role-based address ("${localPart}@") — not tied to a specific person`);
  }

  if (!isDisposable && !isFreeProvider) {
    notes.push('Custom/corporate domain — higher trust than free providers');
  }

  const tld = domain.split('.').pop() ?? '';
  if (
    tld.length === 2 &&
    ![
      'us',
      'uk',
      'de',
      'fr',
      'jp',
      'ca',
      'au',
      'nl',
      'it',
      'es',
      'se',
      'no',
      'fi',
      'dk',
      'ch',
      'at',
      'be',
      'ie',
      'pt',
      'pl',
      'cz',
      'ro',
      'bg',
      'hr',
      'sk',
      'si',
      'lt',
      'lv',
      'ee',
      'lu',
      'mt',
      'cy',
      'is',
      'gr',
      'hu',
      'br',
      'mx',
      'ar',
      'cl',
      'co',
      'pe',
      've',
      'uy',
      'ec',
      'py',
      'bo',
      'cr',
      'pa',
      'gt',
      'do',
      'sv',
      'hn',
      'ni',
      'in',
      'id',
      'th',
      'vn',
      'ph',
      'my',
      'sg',
      'kr',
      'tw',
      'hk',
      'nz',
      'za',
      'ng',
      'ke',
      'eg',
      'ma',
      'sa',
      'ae',
      'il',
      'tr',
      'ru',
      'ua',
    ].includes(tld)
  ) {
    score -= 5;
    notes.push(`Unusual ccTLD ".${tld}" — verify legitimacy`);
  }

  score = Math.max(0, Math.min(100, score));

  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (score >= 90) grade = 'A';
  else if (score >= 75) grade = 'B';
  else if (score >= 60) grade = 'C';
  else if (score >= 40) grade = 'D';
  else grade = 'F';

  if (grade === 'A' || grade === 'B') {
    notes.push('Email domain appears legitimate');
  } else if (grade === 'F') {
    notes.push('Email domain is high-risk — disposable or invalid');
  }

  return {
    email,
    domain,
    localPart,
    score,
    grade,
    isDisposable,
    isFreeProvider,
    isRoleAddress,
    hasMx: null,
    notes,
  };
}
