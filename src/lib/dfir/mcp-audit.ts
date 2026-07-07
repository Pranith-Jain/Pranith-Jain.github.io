/**
 * MCP (Model Context Protocol) server security auditor.
 *
 * Accepts a parsed MCP server config (claude_desktop_config.json shape, or a
 * single server entry, or an array of tool descriptions) and returns a list
 * of findings.
 *
 * The checks are heuristic and assume the worst about the host environment
 * (the MCP runs with the user's full OS privileges). False positives are
 * preferable to false negatives.
 */

import { detectInjections } from './prompt-injection-patterns';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  scope: string; // e.g. "mcpServers.fetch.command" or "tools[3].description"
  detail: string;
  remediation: string;
}

export interface McpServerEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  type?: string;
  // Many MCP clients accept raw tool listings under various keys; stay loose.
  tools?: Array<{ name?: string; description?: string }>;
}

export interface McpConfig {
  mcpServers?: Record<string, McpServerEntry>;
  // Alternative keys some clients use:
  servers?: Record<string, McpServerEntry>;
}

const DANGEROUS_CMDS = [
  'rm',
  'del',
  'format',
  'shutdown',
  'mkfs',
  'dd',
  'sudo',
  'su',
  'chmod',
  'chown',
  'eval',
  'exec',
  'sh',
  'bash',
  'zsh',
  'cmd',
  'powershell',
  'pwsh',
];

const SECRET_KEY_HINTS = [
  /API[_-]?KEY/i,
  /SECRET/i,
  /PASSWORD/i,
  /PASS(WD)?\b/i,
  /TOKEN/i,
  /ACCESS[_-]?KEY/i,
  /PRIVATE[_-]?KEY/i,
  /AWS[_-]?(SECRET|ACCESS)/i,
  /OPENAI/i,
  /ANTHROPIC/i,
  /GITHUB[_-]?(PAT|TOKEN)/i,
];

const LITERAL_SECRET_RE =
  /^(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16}|xox[abprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

function pushIfNew(out: Finding[], f: Finding) {
  if (!out.some((x) => x.id === f.id && x.scope === f.scope)) out.push(f);
}

function auditServer(name: string, server: McpServerEntry, out: Finding[]): void {
  const root = `mcpServers.${name}`;

  // ── Transport: remote URL ─────────────────────────────────────────────
  if (server.url) {
    try {
      const u = new URL(server.url);
      if (u.protocol === 'http:') {
        pushIfNew(out, {
          id: 'remote-http',
          title: 'Remote MCP server over plain HTTP',
          severity: 'high',
          scope: `${root}.url`,
          detail: `Server "${name}" connects over http://, exposing the entire MCP session (including tool calls and arguments) to network observers.`,
          remediation: 'Switch to https://, or run the server locally over stdio.',
        });
      }
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1') {
        // fine
      } else {
        pushIfNew(out, {
          id: 'remote-untrusted',
          title: 'Remote third-party MCP server',
          severity: 'medium',
          scope: `${root}.url`,
          detail: `Server "${name}" calls out to ${u.hostname}. A remote MCP server can inject prompts into every tool call response, see tool arguments (which often contain user data), and silently change behaviour.`,
          remediation: 'Pin to a known commit/version. Prefer local stdio transports for high-trust workflows.',
        });
      }
    } catch {
      pushIfNew(out, {
        id: 'invalid-url',
        title: 'Invalid server URL',
        severity: 'low',
        scope: `${root}.url`,
        detail: `Server "${name}" url is not a valid URL.`,
        remediation: 'Fix the URL or remove the server entry.',
      });
    }
  }

  // ── Command / args ─────────────────────────────────────────────────────
  const cmd = (server.command ?? '').trim();
  if (cmd) {
    const base = cmd.split(/[\\/]/).pop()!.toLowerCase();
    if (DANGEROUS_CMDS.includes(base)) {
      pushIfNew(out, {
        id: 'dangerous-command',
        title: `Dangerous command "${base}"`,
        severity: 'critical',
        scope: `${root}.command`,
        detail: `Server "${name}" launches via "${cmd}", a shell or destructive utility. The MCP host will execute arbitrary commands you didn't write.`,
        remediation: 'Replace with the actual MCP server binary (e.g. a node/python entry-point).',
      });
    }
    if (cmd.includes('|') || cmd.includes(';') || cmd.includes('&&')) {
      pushIfNew(out, {
        id: 'shell-pipeline',
        title: 'Shell-pipeline-style command',
        severity: 'high',
        scope: `${root}.command`,
        detail: `Server "${name}" command contains shell metacharacters. If the host shells-out the value, this is command-injection prone.`,
        remediation: 'Use a single binary path; pass parameters via "args".',
      });
    }
    if (cmd.startsWith('curl ') || cmd.startsWith('wget ') || cmd.includes('| sh') || cmd.includes('|sh')) {
      pushIfNew(out, {
        id: 'curl-pipe-sh',
        title: 'curl|sh-style installer command',
        severity: 'critical',
        scope: `${root}.command`,
        detail: `Server "${name}" downloads and executes code at startup, defeating any review of what's actually run.`,
        remediation: 'Install the MCP server out-of-band, then point command at the resolved binary.',
      });
    }
  }

  // ── Args inspection ────────────────────────────────────────────────────
  const args = server.args ?? [];
  args.forEach((a, i) => {
    if (typeof a !== 'string') return;
    if (LITERAL_SECRET_RE.test(a)) {
      pushIfNew(out, {
        id: 'secret-in-args',
        title: 'Secret embedded in args',
        severity: 'critical',
        scope: `${root}.args[${i}]`,
        detail: `Args contain what looks like a real secret (API key / JWT / GitHub PAT). Args are checked into source control more often than env files.`,
        remediation: 'Move to env or a secret store; reference via env var.',
      });
    }
    if (a.toLowerCase().includes('--allow-shell') || a.toLowerCase().includes('--unrestricted')) {
      pushIfNew(out, {
        id: 'unrestricted-flag',
        title: 'Unrestricted-mode flag',
        severity: 'high',
        scope: `${root}.args[${i}]`,
        detail: `Arg "${a}" disables the server's own safety controls.`,
        remediation: 'Remove the flag and run with the default sandbox.',
      });
    }
  });

  // ── Env block ──────────────────────────────────────────────────────────
  const env = server.env ?? {};
  for (const [k, v] of Object.entries(env)) {
    const looksSecret = SECRET_KEY_HINTS.some((re) => re.test(k));
    if (looksSecret && typeof v === 'string' && v.length > 0 && !v.startsWith('${') && !v.startsWith('$')) {
      // Looks like a real value, not a substitution placeholder.
      if (LITERAL_SECRET_RE.test(v) || (v.length >= 16 && /[A-Za-z]/.test(v) && /[0-9]/.test(v))) {
        pushIfNew(out, {
          id: 'hardcoded-secret',
          title: `Hardcoded secret in env (${k})`,
          severity: 'critical',
          scope: `${root}.env.${k}`,
          detail: `${k} contains a literal value rather than an env-var reference. Anyone with read access to this config has the credential.`,
          remediation:
            'Use a placeholder like ${env:SECRET_NAME} and store the real value in your OS keychain or a .env outside source control.',
        });
      }
    }
  }

  // ── Tool descriptions: prompt injection inside tool metadata ──────────
  const tools = server.tools ?? [];
  tools.forEach((t, i) => {
    const desc = t?.description ?? '';
    if (typeof desc !== 'string' || !desc) return;
    const matches = detectInjections(desc);
    matches.forEach((m) => {
      pushIfNew(out, {
        id: `tool-injection-${m.pattern.id}`,
        title: `Tool description contains injection pattern: ${m.pattern.name}`,
        severity: 'critical',
        scope: `${root}.tools[${i}].description`,
        detail: `Tool "${t.name ?? `#${i}`}" description includes a known prompt-injection pattern. Because tool descriptions are loaded into the model's context every turn, a malicious description can hijack the assistant on any unrelated user query (Tool Description Injection).`,
        remediation:
          'Audit the upstream MCP source. Pin to a reviewed commit. Strip / sanitise tool descriptions before passing them to the model.',
      });
    });
    if (/\b(ssh|exec|eval|bash|powershell|run_command|run_shell)\b/i.test(t.name ?? '')) {
      pushIfNew(out, {
        id: 'broad-tool-name',
        title: `Broad-permission tool: ${t.name}`,
        severity: 'high',
        scope: `${root}.tools[${i}].name`,
        detail: `Tool "${t.name}" is named like a generic shell/exec primitive. Generic primitives let the model run arbitrary commands and are the standard root cause of "excessive agency" findings.`,
        remediation:
          'Replace with task-specific tools (e.g. "list_files", "read_file") with parameter-level allow-lists.',
      });
    }
  });

  // ── No transport at all ────────────────────────────────────────────────
  if (!server.command && !server.url) {
    pushIfNew(out, {
      id: 'no-transport',
      title: 'Server has no command or url',
      severity: 'low',
      scope: root,
      detail: `Server "${name}" defines neither a stdio command nor a remote url; the MCP client will not be able to start it.`,
      remediation: 'Add command/args (stdio) or url (HTTP/SSE).',
    });
  }
}

export function auditMcpConfig(raw: unknown): Finding[] {
  const out: Finding[] = [];
  if (!raw || typeof raw !== 'object') {
    out.push({
      id: 'parse',
      title: 'Input is not a JSON object',
      severity: 'low',
      scope: '$',
      detail: 'Provide a valid claude_desktop_config.json (or any { mcpServers: {...} } structure).',
      remediation: 'Paste the contents of your MCP client config.',
    });
    return out;
  }
  const cfg = raw as McpConfig & Record<string, unknown>;
  const servers: Record<string, McpServerEntry> | undefined = cfg.mcpServers ?? cfg.servers;

  // Allow auditing a single server entry too.
  if (!servers && typeof cfg === 'object' && ('command' in cfg || 'url' in cfg || 'tools' in cfg)) {
    auditServer('(anonymous)', cfg as McpServerEntry, out);
    return out;
  }

  if (!servers || typeof servers !== 'object') {
    out.push({
      id: 'no-servers',
      title: 'No mcpServers / servers key found',
      severity: 'info',
      scope: '$',
      detail:
        'The auditor expected an object with an "mcpServers" key (Claude Desktop / Cursor format) or a single server entry.',
      remediation: 'Paste a config in the standard shape, e.g. { "mcpServers": { "fetch": { "command": "..." } } }.',
    });
    return out;
  }

  for (const [name, entry] of Object.entries(servers)) {
    if (!entry || typeof entry !== 'object') continue;
    auditServer(name, entry, out);
  }

  if (out.length === 0) {
    out.push({
      id: 'clean',
      title: 'No issues found',
      severity: 'info',
      scope: '$',
      detail: `${Object.keys(servers).length} server(s) checked. No heuristic findings — that's not a guarantee of safety, just absence of known bad signals.`,
      remediation: 'Continue to pin upstream versions and review tool descriptions on every update.',
    });
  }
  return out;
}

export function summarise(findings: Finding[]): {
  counts: Record<Severity, number>;
  worst: Severity;
} {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  const order: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
  const worst = order.find((s) => counts[s] > 0) ?? 'info';
  return { counts, worst };
}

// ─────────────────────────────────────────────────────────────────────────
// Claude Code settings scanner
// ─────────────────────────────────────────────────────────────────────────
// Settings shape (per ~/.claude/settings.json):
//   {
//     "permissions": { "allow": ["Bash(git:*)"], "deny": ["Bash(rm:*)"], "ask": [...] },
//     "hooks": { "PreToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "...", "timeout": 5 }] }] },
//     "mcpServers": {...},
//     "apiKeyHelper": "/path/to/script",
//     "env": {...}
//   }

interface ClaudeCodeSettings {
  permissions?: {
    allow?: string[];
    deny?: string[];
    ask?: string[];
    defaultMode?: string;
  };
  hooks?: Record<
    string,
    Array<{
      matcher?: string;
      hooks?: Array<{ type?: string; command?: string; timeout?: number }>;
    }>
  >;
  mcpServers?: Record<string, McpServerEntry>;
  apiKeyHelper?: string;
  env?: Record<string, string>;
  enableAllProjectMcpServers?: boolean;
  enabledMcpjsonServers?: string[];
  disabledMcpjsonServers?: string[];
}

const DANGEROUS_BASH_HEADS = [
  'rm',
  'mv',
  'dd',
  'mkfs',
  'shutdown',
  'reboot',
  'kill',
  'killall',
  'chmod',
  'chown',
  'sudo',
  'su',
  'curl',
  'wget',
  'eval',
  'sh',
  'bash',
  'find',
];

function checkPermissionRule(rule: string, kind: 'allow' | 'deny' | 'ask', out: Finding[]): void {
  // Bash(*) — full shell access
  if (rule === 'Bash(*)' || rule === 'Bash' || rule === '*') {
    pushIfNew(out, {
      id: 'permission-blank-cheque',
      title: `${kind === 'allow' ? 'Blank-cheque allow rule' : 'Catch-all rule'}: ${rule}`,
      severity: kind === 'allow' ? 'critical' : 'low',
      scope: `permissions.${kind}`,
      detail:
        kind === 'allow'
          ? `Rule "${rule}" allows the model to invoke any shell command without prompting. Tool poisoning, prompt injection, or a misjudged step can run anything.`
          : `Rule "${rule}" is a catch-all in ${kind}.`,
      remediation:
        'Replace with task-specific allow rules like Bash(git status), Bash(npm test), Bash(ls *). Keep destructive primitives (rm, mv, curl) out of allow.',
    });
  }

  // Bash(<dangerous>:*) in allow
  const m = rule.match(/^Bash\((\w+)(?::\*?)?\)/);
  if (m && kind === 'allow') {
    const head = m[1]!.toLowerCase();
    if (DANGEROUS_BASH_HEADS.includes(head)) {
      pushIfNew(out, {
        id: `permission-dangerous-${head}`,
        title: `Dangerous allow rule: Bash(${head}:*)`,
        severity: head === 'rm' || head === 'curl' || head === 'wget' || head === 'sudo' ? 'critical' : 'high',
        scope: `permissions.allow`,
        detail: `Allow rule "${rule}" auto-approves "${head}" with any args. ${head === 'curl' || head === 'wget' ? 'Trivially exfiltrates files or pulls payloads from C2.' : head === 'rm' ? 'Wipes anything the model thinks needs cleaning up.' : 'Broad-permission shell primitive — moves it from "ask" to silent execution.'}`,
        remediation: `Tighten the rule (e.g. Bash(${head} ./safe/path) or move it back to "ask"). Don't auto-approve destructive or network primitives.`,
      });
    }
  }

  // Read(/etc/*), Read(~/.ssh/*) etc. in allow
  const r = rule.match(/^Read\((.+)\)$/);
  if (r && kind === 'allow') {
    const target = r[1];
    if (
      /\/etc\/|~\/\.ssh|\/\.env|\/\.aws|\/\.config|\/Library\/Keychains/i.test(target!) ||
      target === '*' ||
      target === '/' ||
      target === '~'
    ) {
      pushIfNew(out, {
        id: 'permission-sensitive-read',
        title: `Sensitive read allow: Read(${target})`,
        severity: 'high',
        scope: `permissions.allow`,
        detail: `Auto-approving reads on "${target}" lets the model surface secrets, SSH keys, AWS creds, or tokens — which a prompt-injection then exfiltrates.`,
        remediation: 'Scope reads to the project tree. Keep secret-bearing paths in "ask" or "deny".',
      });
    }
  }

  // WebFetch(*) etc. — broad network egress
  if (/^WebFetch(\(\*?\))?$/i.test(rule) && kind === 'allow') {
    pushIfNew(out, {
      id: 'permission-broad-webfetch',
      title: 'Broad WebFetch allow',
      severity: 'medium',
      scope: `permissions.allow`,
      detail: 'WebFetch with no host scope lets indirect-injection content reach attacker-controlled URLs.',
      remediation: 'Pin WebFetch to specific hosts: WebFetch(domain:github.com), WebFetch(domain:docs.example.com).',
    });
  }
}

function checkHookEntry(
  event: string,
  matcher: string | undefined,
  hookCmd: { type?: string; command?: string; timeout?: number },
  idx: number,
  out: Finding[]
): void {
  const cmd = (hookCmd.command ?? '').trim();
  const scope = `hooks.${event}[${idx}]${matcher ? `(${matcher})` : ''}`;

  if (!cmd) return;

  if (cmd.includes('| sh') || cmd.includes('|sh') || /\bcurl\b.*\|\s*(ba)?sh/.test(cmd)) {
    pushIfNew(out, {
      id: 'hook-curl-pipe-sh',
      title: 'Hook downloads and executes code',
      severity: 'critical',
      scope,
      detail: `Hook command "${cmd.slice(0, 80)}..." pipes a network download into a shell. The hook fires automatically — there's no user prompt — so this is silent RCE.`,
      remediation: 'Install hook scripts out-of-band, then point command at the resolved local path.',
    });
  }

  if (/^https?:\/\//.test(cmd)) {
    pushIfNew(out, {
      id: 'hook-remote-url',
      title: 'Hook command is a remote URL',
      severity: 'critical',
      scope,
      detail: `Hook command begins with "${cmd.slice(0, 60)}..." — every fired hook becomes a remote-code-execution gadget if the host is compromised.`,
      remediation: 'Hooks should run vetted local scripts only.',
    });
  }

  if (/\b(rm|dd|mkfs)\s+-rf?\s+\//.test(cmd)) {
    pushIfNew(out, {
      id: 'hook-destructive',
      title: 'Hook contains destructive command',
      severity: 'critical',
      scope,
      detail: `Hook would run "${cmd}" — destructive on every trigger.`,
      remediation: 'Remove the destructive op or scope it to a known temp path.',
    });
  }

  if (LITERAL_SECRET_RE.test(cmd) || /(ghp_|sk-|AKIA|xox[abprs]-)/.test(cmd)) {
    pushIfNew(out, {
      id: 'hook-secret-in-command',
      title: 'Hook command contains a literal secret',
      severity: 'critical',
      scope,
      detail:
        'A token, key, or PAT is embedded directly in the hook command. Anyone with read access to settings.json gets the credential.',
      remediation: 'Read secrets from env/keychain inside the hook script — never inline them in settings.',
    });
  }

  if (typeof hookCmd.timeout !== 'number' || hookCmd.timeout > 60) {
    pushIfNew(out, {
      id: 'hook-no-timeout',
      title: 'Hook has no / large timeout',
      severity: 'low',
      scope,
      detail: `Hook ${typeof hookCmd.timeout !== 'number' ? 'has no timeout' : `times out after ${hookCmd.timeout}s`}. Long/missing timeouts let a hung hook block the agent or run cost-bombs.`,
      remediation: 'Set "timeout" to a small number (e.g. 5–10 seconds) appropriate for the script.',
    });
  }

  if (event === 'UserPromptSubmit' || event === 'PreToolUse') {
    if (/^https?:\/\/|curl|wget|nc\s/i.test(cmd)) {
      pushIfNew(out, {
        id: 'hook-egress-pretool',
        title: `Network egress in ${event} hook`,
        severity: 'high',
        scope,
        detail:
          'Pre-tool / pre-prompt hooks see every user input. If they egress to the network, every prompt is leaking.',
        remediation: 'Keep PreToolUse and UserPromptSubmit hooks local-only.',
      });
    }
  }
}

export function auditClaudeCodeSettings(raw: unknown): Finding[] {
  const out: Finding[] = [];
  if (!raw || typeof raw !== 'object') {
    out.push({
      id: 'parse',
      title: 'Input is not a JSON object',
      severity: 'low',
      scope: '$',
      detail: 'Paste a valid Claude Code settings.json (~/.claude/settings.json or .claude/settings.json).',
      remediation: 'Paste your settings file content.',
    });
    return out;
  }
  const cfg = raw as ClaudeCodeSettings;

  // Permissions
  if (cfg.permissions) {
    for (const rule of cfg.permissions.allow ?? []) {
      if (typeof rule === 'string') checkPermissionRule(rule, 'allow', out);
    }
    for (const rule of cfg.permissions.deny ?? []) {
      if (typeof rule === 'string') checkPermissionRule(rule, 'deny', out);
    }

    // No deny rules at all
    if (!cfg.permissions.deny || cfg.permissions.deny.length === 0) {
      pushIfNew(out, {
        id: 'permissions-no-deny',
        title: 'No deny rules configured',
        severity: 'low',
        scope: 'permissions.deny',
        detail:
          'A deny list is the safety net for prompt injection. Without explicit denies (rm:*, curl:*, sudo:*, sensitive paths), allow-list mistakes have no backstop.',
        remediation: 'Add Bash(rm:*), Bash(curl:*), Bash(wget:*), Read(~/.ssh/*), Read(/etc/*) to deny.',
      });
    }

    if (cfg.permissions.defaultMode === 'bypassPermissions' || cfg.permissions.defaultMode === 'acceptEdits') {
      pushIfNew(out, {
        id: 'permissions-permissive-default',
        title: `Permissive defaultMode: ${cfg.permissions.defaultMode}`,
        severity: cfg.permissions.defaultMode === 'bypassPermissions' ? 'critical' : 'medium',
        scope: 'permissions.defaultMode',
        detail:
          cfg.permissions.defaultMode === 'bypassPermissions'
            ? 'bypassPermissions disables ALL prompts. The agent runs anything the model decides to run. Reserve for sandboxes only.'
            : 'acceptEdits silently accepts file edits. Combined with prompt injection, this writes attacker-chosen content to disk.',
        remediation: 'Use "default" (asks for risky actions) for normal projects.',
      });
    }
  } else {
    pushIfNew(out, {
      id: 'no-permissions-block',
      title: 'No "permissions" block',
      severity: 'info',
      scope: '$',
      detail:
        'Without permissions Claude Code falls back to its built-in defaults. Consider declaring an explicit deny list.',
      remediation: 'Add at least: { "permissions": { "deny": ["Bash(rm:*)", "Bash(curl:*)", "Read(~/.ssh/*)"] } }.',
    });
  }

  // Hooks
  if (cfg.hooks) {
    for (const [event, matchers] of Object.entries(cfg.hooks)) {
      if (!Array.isArray(matchers)) continue;
      matchers.forEach((m, mi) => {
        const hookCmds = m?.hooks ?? [];
        hookCmds.forEach((h, hi) => {
          if (!h || typeof h !== 'object') return;
          checkHookEntry(event, m?.matcher, h, mi * 100 + hi, out);
        });
      });
    }
  }

  // apiKeyHelper
  if (cfg.apiKeyHelper && typeof cfg.apiKeyHelper === 'string') {
    if (/^https?:\/\//.test(cfg.apiKeyHelper) || cfg.apiKeyHelper.includes('| sh')) {
      pushIfNew(out, {
        id: 'api-key-helper-remote',
        title: 'apiKeyHelper executes remote code',
        severity: 'critical',
        scope: 'apiKeyHelper',
        detail: 'apiKeyHelper runs every time the agent boots. A remote/curl|sh helper is unauditable RCE.',
        remediation: 'Point apiKeyHelper at a local script that reads from your OS keychain.',
      });
    }
  }

  // env
  if (cfg.env) {
    for (const [k, v] of Object.entries(cfg.env)) {
      const looksSecret = SECRET_KEY_HINTS.some((re) => re.test(k));
      if (
        looksSecret &&
        typeof v === 'string' &&
        v.length > 0 &&
        !v.startsWith('${') &&
        !v.startsWith('$') &&
        (LITERAL_SECRET_RE.test(v) || (v.length >= 16 && /[A-Za-z]/.test(v) && /[0-9]/.test(v)))
      ) {
        pushIfNew(out, {
          id: 'env-hardcoded-secret',
          title: `Hardcoded secret in env (${k})`,
          severity: 'critical',
          scope: `env.${k}`,
          detail: `${k} contains a literal credential. settings.json is checked into dotfile repos more often than people remember.`,
          remediation: 'Use ${env:SECRET_NAME} placeholders; keep the real value out of source control.',
        });
      }
    }
  }

  // mcpServers re-uses the existing auditor
  if (cfg.mcpServers) {
    for (const [name, entry] of Object.entries(cfg.mcpServers)) {
      if (!entry || typeof entry !== 'object') continue;
      auditServer(name, entry, out);
    }
  }

  // enableAllProjectMcpServers
  if (cfg.enableAllProjectMcpServers === true) {
    pushIfNew(out, {
      id: 'enable-all-project-mcp',
      title: 'enableAllProjectMcpServers is true',
      severity: 'medium',
      scope: 'enableAllProjectMcpServers',
      detail:
        'Trusts every .mcp.json found in the project tree without prompting. Cloning a malicious repo silently activates its MCP servers.',
      remediation: 'Leave this off; rely on the per-server prompt or curate enabledMcpjsonServers.',
    });
  }

  if (out.length === 0) {
    out.push({
      id: 'clean',
      title: 'No issues found',
      severity: 'info',
      scope: '$',
      detail:
        'No heuristic findings. Heuristics only — keep deny rules tight, vet hook scripts, and pin MCP server versions.',
      remediation: 'Re-run after every settings change.',
    });
  }
  return out;
}

/**
 * Auto-detect: pick MCP-style or Claude-Code-style based on the keys present.
 * Falls back to MCP if ambiguous (most common case).
 */
export function auditConfig(raw: unknown): { findings: Finding[]; mode: 'mcp' | 'claude-code' } {
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if ('permissions' in obj || 'hooks' in obj || 'apiKeyHelper' in obj || 'enableAllProjectMcpServers' in obj) {
      return { findings: auditClaudeCodeSettings(raw), mode: 'claude-code' };
    }
  }
  return { findings: auditMcpConfig(raw), mode: 'mcp' };
}
