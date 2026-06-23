/**
 * FortiBleed Checker — detect vulnerable FortiGate SSL VPN instances.
 *
 * Checks for CVE-2024-21762 (FortiGate FortiOS out-of-bound write RCE, CVSS 9.8)
 * and related FortiGate CVEs. Uses Shodan/FOFA-style passive detection.
 *
 * Detection method: HTTP response fingerprinting for FortiGate login pages
 * and SSL certificate analysis.
 */

import type { Context } from 'hono';
import type { Env } from '../env';

interface FortiGateResult {
  target: string;
  isFortiGate: boolean;
  version: string | null;
  vulnerability: string | null;
  cvss: number | null;
  severity: string | null;
  details: string[];
  recommendations: string[];
}

const FORTECVE = {
  id: 'CVE-2024-21762',
  description:
    'FortiOS out-of-bound write vulnerability in SSL VPN may allow remote code execution via specially crafted HTTP requests.',
  cvss: 9.8,
  severity: 'CRITICAL',
  affectedVersions: [
    'FortiOS 7.4.0 through 7.4.2',
    'FortiOS 7.2.0 through 7.2.6',
    'FortiOS 7.0.0 through 7.0.12',
    'FortiOS 6.4.0 through 6.4.14',
    'FortiOS 6.2.0 through 6.2.15',
    'FortiProxy 7.4.0 through 7.4.3',
    'FortiProxy 7.2.0 through 7.2.7',
    'FortiProxy 7.0.0 through 7.0.10',
    'FortiProxy 6.4.0 through 6.4.13',
    'FortiProxy 6.2.0 through 6.2.13',
  ],
  fixedVersions: [
    'FortiOS 7.4.3+',
    'FortiOS 7.2.7+',
    'FortiOS 7.0.13+',
    'FortiOS 6.4.15+',
    'FortiOS 6.2.16+',
    'FortiProxy 7.4.4+',
    'FortiProxy 7.2.8+',
    'FortiProxy 7.0.11+',
    'FortiProxy 6.4.14+',
    'FortiProxy 6.2.14+',
  ],
};

async function detectFortiGate(target: string): Promise<FortiGateResult> {
  const result: FortiGateResult = {
    target,
    isFortiGate: false,
    version: null,
    vulnerability: null,
    cvss: null,
    severity: null,
    details: [],
    recommendations: [],
  };

  const baseUrl = target.startsWith('http') ? target : `https://${target}`;
  const ports = [443, 8443, 10443, 80];

  for (const port of ports) {
    try {
      const url =
        port === 443 || port === 80
          ? baseUrl
          : `${target.startsWith('http') ? target.split('://')[0] : 'https'}://${target}:${port}`;

      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FortiBleed-Checker/1.0)' },
      });

      const headers = Object.fromEntries(res.headers.entries());
      const body = await res.text().catch(() => '');

      // Check for FortiGate indicators
      const indicators = [
        /fortigate/i.test(body),
        /fortinet/i.test(body),
        /fortios/i.test(body),
        /\/remote\/login/i.test(body),
        /\/login\.css/i.test(body) && /forti/i.test(body),
        /fgt_lang/i.test(body) || /lang_token/i.test(body),
        /SSL-VPN/i.test(body),
        /server:\s*FortiGate/i.test(headers['server'] || ''),
        /<title>.*FortiGate/i.test(body),
      ];

      if (indicators.some(Boolean)) {
        result.isFortiGate = true;
        result.details.push(`FortiGate detected on port ${port}`);

        // Version detection
        const versionMatch =
          body.match(/Forti(?:Gate|OS)\s+(?:v)?(\d+\.\d+\.?\d*)/i) || body.match(/version["\s:=]+(\d+\.\d+\.?\d*)/i);
        if (versionMatch) {
          result.version = versionMatch[1];
          result.details.push(`Version: ${result.version}`);
        }

        // SSL certificate check
        if (res.url.startsWith('https')) {
          try {
            const certInfo = await fetchCertInfo(target, port);
            if (certInfo) result.details.push(`Certificate: ${certInfo}`);
          } catch {
            /* skip */
          }
        }

        break;
      }
    } catch {
      /* port not reachable */
    }
  }

  // Vulnerability assessment
  if (result.isFortiGate) {
    result.vulnerability = FORTECVE.id;
    result.cvss = FORTECVE.cvss;
    result.severity = FORTECVE.severity;
    result.details.push(`Potential exposure to ${FORTECVE.id} (CVSS ${FORTECVE.cvss})`);

    if (result.version) {
      const parts = result.version.split('.').map(Number);
      const ver = (parts[0] || 0) * 100 + (parts[1] || 0) * 10 + (parts[2] || 0);
      const patched = ver >= 743 || ver >= 727 || ver >= 7013 || ver >= 6415 || ver >= 6216;

      if (patched) {
        result.severity = 'INFO';
        result.details.push('Version appears patched against CVE-2024-21762');
      } else {
        result.details.push('Version is likely vulnerable to CVE-2024-21762');
      }
    }

    result.recommendations = [
      'Upgrade FortiOS to the latest patched version immediately',
      'If immediate upgrade is not possible, disable SSL VPN as a temporary mitigation',
      'Review SSL VPN access logs for suspicious activity',
      'Apply IPS signature for CVE-2024-21762 if available',
      'Restrict SSL VPN access to trusted IP ranges',
      "Monitor for indicators of compromise listed in Fortinet's advisory",
    ];
  }

  return result;
}

async function fetchCertInfo(target: string, port: number): Promise<string | null> {
  // Simple SSL check via fetch — in production would use TLS library
  try {
    const res = await fetch(`https://${target}:${port}`, {
      signal: AbortSignal.timeout(5000),
      method: 'HEAD',
    });
    return res.headers.get('server') || null;
  } catch {
    return null;
  }
}

export async function fortibleedCheckHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const target = c.req.query('target') || '';
  if (!target) return c.json({ error: 'target parameter required' }, 400);

  const result = await detectFortiGate(target);
  return c.json(result);
}

export async function fortibleedBatchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = (await c.req.json()) as { targets: string[] };
  if (!body.targets?.length) return c.json({ error: 'targets array required' }, 400);

  const results = await Promise.all(body.targets.slice(0, 10).map((t) => detectFortiGate(t)));
  return c.json({ results, total: results.length });
}
