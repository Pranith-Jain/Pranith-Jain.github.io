/**
 * Sensitive path classifier — classifies a list of URLs/paths for exposed
 * sensitive files (.git, .env, backups, configs, admin panels). Used to
 * triage Wayback/URL lists for security-relevant endpoints.
 *
 * Ported from cti-expert's /sensitive-paths concept (7onez/cti-expert).
 */

export type PathSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface ClassifiedPath {
  path: string;
  severity: PathSeverity;
  category: string;
  description: string;
}

export interface SensitivePathResult {
  total: number;
  classified: ClassifiedPath[];
  summary: Record<PathSeverity, number>;
}

interface PathRule {
  pattern: RegExp;
  severity: PathSeverity;
  category: string;
  description: string;
}

const RULES: PathRule[] = [
  {
    pattern: /\.git(?:\/|\/config|\/HEAD|\/index)?$/i,
    severity: 'critical',
    category: 'vcs',
    description: 'Exposed Git repository — source code, secrets, history',
  },
  {
    pattern: /\.svn(?:\/|\/entries|\/wc\.db)?$/i,
    severity: 'critical',
    category: 'vcs',
    description: 'Exposed SVN repository',
  },
  {
    pattern: /\.env(\.|$)/i,
    severity: 'critical',
    category: 'config',
    description: 'Environment file — API keys, DB credentials',
  },
  {
    pattern: /wp-config\.php/i,
    severity: 'critical',
    category: 'config',
    description: 'WordPress config — DB credentials',
  },
  { pattern: /config\.php$/i, severity: 'critical', category: 'config', description: 'PHP config file' },
  {
    pattern: /(?:database|db)\.ya?ml$/i,
    severity: 'critical',
    category: 'config',
    description: 'Database config — connection strings',
  },
  { pattern: /id_rsa(?:\.pub)?$/i, severity: 'critical', category: 'keys', description: 'SSH private key' },
  {
    pattern: /\.pem$|\.key$|\.p12$|\.pfx$/i,
    severity: 'critical',
    category: 'keys',
    description: 'TLS/SSL private key or certificate',
  },
  { pattern: /\.sql(?:\.gz|\.zip)?$/i, severity: 'critical', category: 'backup', description: 'Database dump' },
  {
    pattern: /backup|\.bak$|\.old$|\.orig$|\.swp$/i,
    severity: 'high',
    category: 'backup',
    description: 'Backup/temporary file — may contain source or secrets',
  },
  {
    pattern: /\.zip$|\.tar\.gz$|\.tgz$|\.rar$|\.7z$/i,
    severity: 'high',
    category: 'backup',
    description: 'Archive — may contain source code or data',
  },
  {
    pattern: /(?:admin|administrator|adm|panel|dashboard|console|manager)(?:\/|$)/i,
    severity: 'high',
    category: 'admin',
    description: 'Admin panel endpoint',
  },
  {
    pattern: /(?:phpmyadmin|phpinfo|adminer)(?:\.php|\/|$)/i,
    severity: 'high',
    category: 'admin',
    description: 'Database admin tool',
  },
  {
    pattern: /(?:wp-admin|wp-login)(?:\.php|\/|$)/i,
    severity: 'medium',
    category: 'admin',
    description: 'WordPress admin',
  },
  {
    pattern: /(?:api|graphql|swagger|openapi)(?:\.json|\.yaml|\/docs|\/v\d|\/|$)/i,
    severity: 'medium',
    category: 'api',
    description: 'API endpoint or documentation',
  },
  {
    pattern: /(?:server-status|server-info|status|health|metrics|debug|trace)(?:\/|$)/i,
    severity: 'medium',
    category: 'debug',
    description: 'Debug/diagnostics endpoint',
  },
  {
    pattern: /(?:\.htaccess|\.htpasswd|web\.config|nginx\.conf|httpd\.conf)$/i,
    severity: 'high',
    category: 'config',
    description: 'Web server config',
  },
  {
    pattern: /(?:composer\.json|package\.json|Gemfile|requirements\.txt|go\.mod)$/i,
    severity: 'low',
    category: 'config',
    description: 'Dependency manifest — reveals tech stack',
  },
  {
    pattern: /(?:robots\.txt|sitemap\.xml|crossdomain\.xml|clientaccesspolicy\.xml)$/i,
    severity: 'low',
    category: 'info',
    description: 'Crawler policy — may reveal hidden paths',
  },
  {
    pattern: /(?:\.DS_Store|Thumbs\.db|desktop\.ini)$/i,
    severity: 'low',
    category: 'info',
    description: 'OS metadata — directory listing artifact',
  },
  {
    pattern: /(?:test|staging|dev|internal|qa)[.-]/i,
    severity: 'medium',
    category: 'env',
    description: 'Non-production environment',
  },
  {
    pattern: /(?:login|signin|auth|oauth|sso|saml)(?:\.php|\/|$)/i,
    severity: 'medium',
    category: 'auth',
    description: 'Authentication endpoint',
  },
  {
    pattern: /(?:upload|uploads|files|media|assets)(?:\/|$)/i,
    severity: 'low',
    category: 'storage',
    description: 'File upload/storage directory',
  },
  {
    pattern: /(?:\.log|error_log|access_log|debug\.log)$/i,
    severity: 'medium',
    category: 'logs',
    description: 'Log file — may contain sensitive data',
  },
];

export function classifySensitivePaths(paths: string[]): SensitivePathResult {
  const classified: ClassifiedPath[] = [];

  for (const raw of paths) {
    const path = raw.trim();
    if (!path) continue;

    const urlPath = (() => {
      try {
        return new URL(path).pathname;
      } catch {
        return path;
      }
    })();

    for (const rule of RULES) {
      if (rule.pattern.test(urlPath)) {
        classified.push({
          path,
          severity: rule.severity,
          category: rule.category,
          description: rule.description,
        });
        break;
      }
    }
  }

  const summary: Record<PathSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const c of classified) summary[c.severity]++;

  classified.sort((a, b) => {
    const order: Record<PathSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.severity] - order[b.severity];
  });

  return { total: paths.length, classified, summary };
}
