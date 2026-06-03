/**
 * PowerShell deobfuscator — heuristic, multi-pass, client-side.
 *
 * Real PowerShell loaders chain a handful of techniques. Rather than try to
 * be a full parser, we run a set of independent passes in a loop until the
 * input stops changing (or we hit a max-iteration cap).
 *
 * Each pass is intentionally small. A pass:
 *   - declares a name that shows up in the trace
 *   - returns the (possibly transformed) string and a flag for whether it
 *     changed something
 *
 * The trace lets the analyst see exactly which transformations fired.
 */

export interface Pass {
  name: string;
  description: string;
  apply: (s: string) => { out: string; changed: boolean };
}

export interface Step {
  passName: string;
  before: string;
  after: string;
}

export interface DeobfResult {
  /** Final, hopefully-readable string. */
  output: string;
  /** Ordered list of transformations that fired. */
  steps: Step[];
  /** Total number of iterations the deobfuscator ran. */
  iterations: number;
  /** True if the output stopped changing before max iterations. */
  fixedPoint: boolean;
}

const MAX_ITERATIONS = 12;

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/** Decode a base64 string assuming UTF-16LE (the EncodedCommand encoding). */
function b64Utf16LE(s: string): string | null {
  try {
    const bin = atob(s);
    let out = '';
    for (let i = 0; i + 1 < bin.length; i += 2) {
      const code = bin.charCodeAt(i) | (bin.charCodeAt(i + 1) << 8);
      out += String.fromCharCode(code);
    }
    return out;
  } catch {
    return null;
  }
}

/** Decode a base64 string assuming UTF-8 (the more common case). */
function b64Utf8(s: string): string | null {
  try {
    const bin = atob(s);
    // Decode UTF-8 from the binary string
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

/** Heuristic — does this look like PowerShell-y text after decoding? */
function looksReadable(s: string): boolean {
  if (s.length < 3) return false;
  // At least 80% printable ASCII / common chars.
  let printable = 0;
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if ((code >= 0x20 && code < 0x7f) || code === 0x09 || code === 0x0a || code === 0x0d) printable++;
  }
  return printable / s.length > 0.8;
}

// ─────────────────────────────────────────────────────────────────────────
// Passes
// ─────────────────────────────────────────────────────────────────────────

/** -EncodedCommand <base64> — the canonical Windows-Defender bypass entry-point. */
const passEncodedCommand: Pass = {
  name: 'encoded-command',
  description: 'Decode -EncodedCommand / -EC base64 (UTF-16LE).',
  apply(s) {
    const re = /-(?:enc(?:odedcommand)?|ec|e)\s+["']?([A-Za-z0-9+/=]{16,})["']?/i;
    const m = s.match(re);
    if (!m) return { out: s, changed: false };
    const decoded = b64Utf16LE(m[1]);
    if (!decoded || !looksReadable(decoded)) return { out: s, changed: false };
    return { out: s.replace(m[0], decoded), changed: true };
  },
};

/** Standalone long base64 blocks (FromBase64String('…'), or a raw blob). */
const passFromBase64String: Pass = {
  name: 'from-base64-string',
  description: "Decode [Convert]::FromBase64String('…') / standalone long base64 blocks.",
  apply(s) {
    const re =
      /(?:\[(?:System\.)?Convert\]::FromBase64String\(\s*["']([A-Za-z0-9+/=]{20,})["']\s*\)|["']([A-Za-z0-9+/=]{40,}={0,2})["'])/g;
    let changed = false;
    const out = s.replace(re, (full, a: string | undefined, b: string | undefined) => {
      const blob = a ?? b;
      if (!blob) return full;
      // Try UTF-8 first (more common), fall back to UTF-16LE.
      let dec = b64Utf8(blob);
      if (!dec || !looksReadable(dec)) dec = b64Utf16LE(blob);
      if (!dec || !looksReadable(dec)) return full;
      changed = true;
      return `'${dec}'`;
    });
    return { out, changed };
  },
};

/** -join, +-string concat with reverse / char-array tricks. */
const passReverseString: Pass = {
  name: 'reverse-string',
  description: 'Resolve "rts.eulav" -split | %{$_[..]} reverse-string idioms.',
  apply(s) {
    // [string]::Concat([char[]]"abc"[..]) — too pattern-specific to be robust.
    // Catch the simple "...".ToCharArray() | …Reverse pattern.
    const re = /\[(?:System\.)?Array\]::Reverse\(\s*\[?(?:char\[\])?\]?\s*["']([^"']{4,})["']\s*\)/gi;
    let changed = false;
    const out = s.replace(re, (_full, body: string) => {
      changed = true;
      return `'${body.split('').reverse().join('')}'`;
    });
    return { out, changed };
  },
};

/** "abc".Replace("X","").Replace("Y","") → unwind these. */
const passReplaceChain: Pass = {
  name: 'replace-chain',
  description: 'Apply chained .Replace("a","b") calls on string literals.',
  apply(s) {
    const re = /["']([^"'\\]{3,})["']\s*((?:\.[Rr]eplace\(\s*["'][^"']*["']\s*,\s*["'][^"']*["']\s*\))+)/g;
    let changed = false;
    const out = s.replace(re, (_full, base: string, chain: string) => {
      let cur = base;
      for (const m of chain.matchAll(/\.[Rr]eplace\(\s*["']([^"']*)["']\s*,\s*["']([^"']*)["']\s*\)/g)) {
        const find = m[1];
        const repl = m[2];
        cur = cur.split(find).join(repl);
      }
      changed = true;
      return `'${cur.replace(/'/g, "''")}'`;
    });
    return { out, changed };
  },
};

/** "{0}{1}{2}" -f 'a','b','c' → 'abc' */
const passFormatString: Pass = {
  name: 'format-string',
  description: "Resolve \"{0}{1}…\" -f 'a','b',… format-string composition.",
  apply(s) {
    const re = /["']((?:\{\d+\}|[^"'{}])+)["']\s*-f\s*((?:["'][^"']*["']\s*,?\s*)+)/g;
    let changed = false;
    const out = s.replace(re, (_full, fmt: string, argsStr: string) => {
      const args = [...argsStr.matchAll(/["']([^"']*)["']/g)].map((m) => m[1]);
      const result = fmt.replace(/\{(\d+)\}/g, (_, idx: string) => {
        const i = parseInt(idx, 10);
        return args[i] ?? `{${i}}`;
      });
      changed = true;
      return `'${result.replace(/'/g, "''")}'`;
    });
    return { out, changed };
  },
};

/** [char]65 + [char]66 → 'AB'; also [char[]](65,66,67) -join '' */
const passCharLiterals: Pass = {
  name: 'char-literals',
  description: 'Resolve [char]NN, [char]0xNN, [char[]](…) -join sequences.',
  apply(s) {
    let changed = false;
    let out = s;

    // [char]65 + [char]66 + …
    const seqRe = /(?:\[char\]\s*(?:0x[0-9a-fA-F]+|\d+)\s*\+?\s*){2,}/g;
    out = out.replace(seqRe, (full) => {
      const codes = [...full.matchAll(/\[char\]\s*(0x[0-9a-fA-F]+|\d+)/g)].map((m) =>
        m[1].startsWith('0x') ? parseInt(m[1], 16) : parseInt(m[1], 10)
      );
      if (codes.length > 50_000) return full;
      let text = '';
      for (const c of codes) text += String.fromCharCode(c);
      changed = true;
      return `'${text.replace(/'/g, "''")}'`;
    });

    // [char[]](72,73) -join ''
    const arrRe = /\[char\[\]\]\s*\(\s*((?:(?:0x[0-9a-fA-F]+|\d+)\s*,?\s*)+)\)\s*-join\s*['"]\s*['"]/g;
    out = out.replace(arrRe, (_full, body: string) => {
      const codes = [...body.matchAll(/0x[0-9a-fA-F]+|\d+/g)].map((m) => {
        const v = m[0];
        return v.startsWith('0x') ? parseInt(v, 16) : parseInt(v, 10);
      });
      if (codes.length > 50_000) return _full;
      let text = '';
      for (const c of codes) text += String.fromCharCode(c);
      changed = true;
      return `'${text.replace(/'/g, "''")}'`;
    });

    return { out, changed };
  },
};

/** Strip backticks used as syntactic noise: `I`E`X` → IEX. */
const passStripBackticks: Pass = {
  name: 'strip-backticks',
  description: 'Strip lone backticks used as escape-noise (e.g. `i`e`x → iex).',
  apply(s) {
    if (!/`/.test(s)) return { out: s, changed: false };
    // Drop backticks that are between word chars or before letters.
    const out = s.replace(/`(?=[A-Za-z0-9_])/g, '');
    return { out, changed: out !== s };
  },
};

/** GZip blob: -bxor decompression chains we can't actually run, but flag. */
const passFlagDangerous: Pass = {
  name: 'flag-dangerous',
  description: "Flag dangerous primitives we can't resolve — IEX, DownloadString, GzipStream.",
  apply(s) {
    return { out: s, changed: false };
  },
};

const PASSES: Pass[] = [
  passEncodedCommand,
  passFromBase64String,
  passStripBackticks,
  passReverseString,
  passReplaceChain,
  passFormatString,
  passCharLiterals,
  passFlagDangerous,
];

// ─────────────────────────────────────────────────────────────────────────
// Driver
// ─────────────────────────────────────────────────────────────────────────

export function deobfuscate(input: string): DeobfResult {
  const steps: Step[] = [];
  let cur = input;
  let iteration = 0;
  let anyChange = true;

  while (anyChange && iteration < MAX_ITERATIONS) {
    anyChange = false;
    for (const pass of PASSES) {
      let result;
      try {
        result = pass.apply(cur);
      } catch {
        continue;
      }
      const { out, changed } = result;
      if (changed) {
        steps.push({ passName: pass.name, before: cur, after: out });
        cur = out;
        anyChange = true;
      }
    }
    iteration++;
  }

  return { output: cur, steps, iterations: iteration, fixedPoint: !anyChange };
}

export interface RiskFinding {
  id: string;
  label: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

/** Static risk patterns to call out in the final output. */
export function findRisks(s: string): RiskFinding[] {
  const out: RiskFinding[] = [];
  const checks: Array<[RegExp, RiskFinding]> = [
    [
      /\b(IEX|Invoke-Expression)\b/i,
      {
        id: 'iex',
        label: 'Invoke-Expression / IEX',
        severity: 'critical',
        description: 'Executes an arbitrary string as PowerShell. Almost universal in stagers.',
      },
    ],
    [
      /\bDownloadString|DownloadFile\b/i,
      {
        id: 'downloadstring',
        label: 'DownloadString / DownloadFile',
        severity: 'critical',
        description: 'WebClient.DownloadString — the classic remote-payload pull.',
      },
    ],
    [
      /\b(?:Net\.WebClient|Net\.Sockets|Net\.HttpWebRequest|System\.Net\.WebRequest)\b/i,
      {
        id: 'net-classes',
        label: '.NET network primitives',
        severity: 'high',
        description: 'Direct .NET network classes — used to bypass cmdlet logging.',
      },
    ],
    [
      /\bSet-MpPreference\b/i,
      {
        id: 'defender-tamper',
        label: 'Set-MpPreference (Defender tampering)',
        severity: 'critical',
        description: 'Adds Defender exclusions / disables real-time protection.',
      },
    ],
    [
      /\bAdd-MpPreference\b/i,
      {
        id: 'defender-add',
        label: 'Add-MpPreference (Defender exclusion)',
        severity: 'high',
        description: 'Adds an exclusion path / process / extension.',
      },
    ],
    [
      /\b(IO\.Compression\.GzipStream|IO\.Compression\.DeflateStream)\b/i,
      {
        id: 'gzip',
        label: 'GZip / Deflate decompression',
        severity: 'medium',
        description: 'Compressed-payload decoder — common second-stage wrapper.',
      },
    ],
    [
      /\bReflection\.Assembly\b/i,
      {
        id: 'reflection',
        label: 'Reflection.Assembly load',
        severity: 'high',
        description: 'In-memory assembly load — fileless execution primitive.',
      },
    ],
    [
      /\b(?:VirtualAlloc|VirtualProtect|WriteProcessMemory|CreateRemoteThread)\b/i,
      {
        id: 'pinvoke',
        label: 'P/Invoke shellcode primitives',
        severity: 'critical',
        description: 'Process-injection primitives via Add-Type / DllImport.',
      },
    ],
    [
      /-WindowStyle\s+Hidden|-w\s+hidden/i,
      {
        id: 'hidden-window',
        label: '-WindowStyle Hidden',
        severity: 'low',
        description: 'Hides the PowerShell host window — a low-confidence indicator on its own.',
      },
    ],
    [
      /-NoProfile|-nop\b/i,
      {
        id: 'no-profile',
        label: '-NoProfile',
        severity: 'low',
        description: 'Skips $PROFILE — common in malicious one-liners and benign scripts alike.',
      },
    ],
  ];
  for (const [re, finding] of checks) {
    if (re.test(s)) out.push(finding);
  }
  return out;
}
