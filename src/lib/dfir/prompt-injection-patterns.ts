/**
 * Prompt-injection / jailbreak pattern library.
 *
 * Each pattern has a regex (or substring), a category, a severity, and a
 * pointer at the technique it represents. Sourced from public research:
 *   - Greshake et al., "Not what you've signed up for" (indirect injection)
 *   - Liu et al., "Prompt Injection attack against LLM-integrated apps"
 *   - Anthropic's prompt-injection benchmark
 *   - Real-world jailbreaks indexed at jailbreakchat.com archive
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Category =
  | 'instruction-override'
  | 'role-override'
  | 'system-prompt-extraction'
  | 'indirect-injection'
  | 'encoding-smuggling'
  | 'tool-abuse'
  | 'data-exfiltration';

/**
 * OWASP Top 10 for LLM Applications 2025 — IDs each pattern maps to.
 * (LLM05 Improper Output Handling and LLM07 System Prompt Leakage are
 * handled implicitly via LLM02 Sensitive Information Disclosure here.)
 */
export type LlmTop10Id = 'LLM01' | 'LLM02' | 'LLM03' | 'LLM04' | 'LLM06' | 'LLM08' | 'LLM09' | 'LLM10';

export const LLM_TOP10: Record<LlmTop10Id, { num: number; title: string; short: string }> = {
  LLM01: { num: 1, title: 'Prompt Injection', short: 'Direct or indirect attacker control of model instructions.' },
  LLM02: {
    num: 2,
    title: 'Sensitive Information Disclosure',
    short: 'Leakage of system prompts, secrets, or PII via the model.',
  },
  LLM03: { num: 3, title: 'Supply Chain', short: 'Compromised tools, plugins, MCP servers, or training data.' },
  LLM04: {
    num: 4,
    title: 'Data and Model Poisoning',
    short: 'Malicious content injected into training or RAG corpora.',
  },
  LLM06: {
    num: 6,
    title: 'Excessive Agency',
    short: 'Model invokes high-impact tools beyond what the user authorised.',
  },
  LLM08: {
    num: 8,
    title: 'Vector and Embedding Weaknesses',
    short: 'Adversarial inputs to retrieval / embedding pipelines.',
  },
  LLM09: { num: 9, title: 'Misinformation', short: 'Confident incorrect output, hallucination amplification.' },
  LLM10: { num: 10, title: 'Unbounded Consumption', short: 'Resource exhaustion via runaway loops, cost bombs.' },
};

export interface InjectionPattern {
  id: string;
  name: string;
  category: Category;
  severity: Severity;
  description: string;
  re: RegExp;
  reference?: string;
  /** OWASP LLM Top 10 IDs this pattern maps to. */
  owasp: LlmTop10Id[];
}

export const PATTERNS: InjectionPattern[] = [
  // ── Instruction override ──────────────────────────────────────────────
  {
    id: 'ignore-prev-instructions',
    name: 'Ignore previous instructions',
    category: 'instruction-override',
    severity: 'high',
    description: 'Classic direct override. Asks the model to discard everything before the current turn.',
    re: /\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|directives?)\b/i,
    reference: 'Liu et al. 2023',
    owasp: ['LLM01'],
  },
  {
    id: 'override-system',
    name: 'Override system prompt',
    category: 'instruction-override',
    severity: 'high',
    description: 'Direct request to ignore or replace the system prompt.',
    re: /\b(override|replace|bypass)\s+(the\s+)?(system\s+)?(prompt|message|instruction)/i,
    owasp: ['LLM01'],
  },
  {
    id: 'new-instructions',
    name: 'New instructions follow',
    category: 'instruction-override',
    severity: 'medium',
    description: 'Tries to reset context by claiming a new instruction set is starting.',
    re: /\b(new|updated|revised)\s+instructions?\s*(follow|begin|are|:)/i,
    owasp: ['LLM01'],
  },
  {
    id: 'developer-mode',
    name: 'Developer / debug mode',
    category: 'instruction-override',
    severity: 'high',
    description: 'Asks the model to enter a special mode that supposedly bypasses safety.',
    re: /\b(developer|debug|admin|sudo|maintenance|override)\s+mode\b/i,
    owasp: ['LLM01', 'LLM06'],
  },

  // ── Role override / DAN-family ────────────────────────────────────────
  {
    id: 'dan-style',
    name: 'DAN-style roleplay',
    category: 'role-override',
    severity: 'critical',
    description: '"Do Anything Now" persona — claims to be unrestricted. Most-known jailbreak family.',
    re: /\b(DAN|do anything now|jailbroken|unrestricted (AI|model|assistant)|no (longer|more) bound by)\b/i,
    reference: 'r/ChatGPTJailbreak archive',
    owasp: ['LLM01'],
  },
  {
    id: 'evil-twin',
    name: 'Evil twin persona',
    category: 'role-override',
    severity: 'high',
    description: 'Asks for a contrasting "evil" or "uncensored" version of the assistant.',
    re: /\b(evil|dark|uncensored|amoral|opposite)\s+(twin|version|persona|character|self)\b/i,
    owasp: ['LLM01'],
  },
  {
    id: 'pretend-you-are',
    name: 'Pretend you are X',
    category: 'role-override',
    severity: 'medium',
    description: 'Roleplay framing used to extract content the model would otherwise refuse.',
    re: /\b(pretend|act as|roleplay as|simulate (being|that you are))\b.{0,40}\b(an?|the)\b/i,
    owasp: ['LLM01'],
  },
  {
    id: 'grandma-trick',
    name: 'Grandma trick',
    category: 'role-override',
    severity: 'medium',
    description: 'Emotional manipulation: model is asked to roleplay a grandmother sharing dangerous info.',
    re: /\b(grandma|grandmother|granny)\b.{0,80}\b(used to|would|tell me|sing)\b/i,
    owasp: ['LLM01'],
  },

  // ── System prompt extraction ──────────────────────────────────────────
  {
    id: 'reveal-system-prompt',
    name: 'Reveal system prompt',
    category: 'system-prompt-extraction',
    severity: 'high',
    description: 'Asks the model to reproduce its system prompt verbatim.',
    re: /\b(repeat|show|reveal|print|display|output|share|tell me)\b.{0,40}\b(system\s+)?(prompt|instructions?|rules?|directives?)\b/i,
    owasp: ['LLM02'],
  },
  {
    id: 'prompt-prefix-extraction',
    name: 'Prompt prefix extraction',
    category: 'system-prompt-extraction',
    severity: 'high',
    description: 'Asks for the first N words / first paragraph / everything above the user message.',
    re: /\b(first\s+(\d+|few)\s+(words|tokens|lines|sentences|characters)|above\s+(this|the)\s+(message|line))\b/i,
    owasp: ['LLM02'],
  },
  {
    id: 'verbatim-instructions',
    name: 'Verbatim instruction request',
    category: 'system-prompt-extraction',
    severity: 'medium',
    description: 'Explicitly asks for verbatim / unmodified output of system instructions.',
    re: /\b(verbatim|word\s*for\s*word|exact(ly)?|unmodified|raw)\b.{0,30}\b(prompt|instruction|message|content)\b/i,
    owasp: ['LLM02'],
  },

  // ── Indirect injection markers ────────────────────────────────────────
  {
    id: 'embedded-system-tag',
    name: 'Embedded system tag',
    category: 'indirect-injection',
    severity: 'critical',
    description:
      'Fake system/instruction tags inside untrusted content. Common in indirect injection via web pages or documents.',
    re: /<\/?(system|admin|instruction|sudo|override)\b[^>]*>/i,
    reference: 'Greshake et al. 2023',
    owasp: ['LLM01', 'LLM03'],
  },
  {
    id: 'inline-instruction-block',
    name: 'Inline instruction block',
    category: 'indirect-injection',
    severity: 'high',
    description: 'Markdown-style instruction blocks meant to be parsed by the LLM as separate scope.',
    re: /\[\s*(SYSTEM|INSTRUCTION|ASSISTANT|ADMIN)\s*\]/i,
    owasp: ['LLM01'],
  },
  {
    id: 'attention-llm',
    name: 'Attention LLM/AI',
    category: 'indirect-injection',
    severity: 'high',
    description: 'Direct address to the model from inside a document, common in indirect injection.',
    re: /\b(attention|note to|hello)\s+(the\s+)?(LLM|AI|model|assistant|chatbot|chatgpt|claude|gpt)\b/i,
    owasp: ['LLM01'],
  },

  // ── Encoding smuggling ────────────────────────────────────────────────
  {
    id: 'base64-payload',
    name: 'Base64 payload',
    category: 'encoding-smuggling',
    severity: 'high',
    description: 'Long base64-looking string that may smuggle instructions past keyword filters.',
    re: /\b[A-Za-z0-9+/]{120,}={0,2}\b/,
    owasp: ['LLM01'],
  },
  {
    id: 'rot13-payload',
    name: 'ROT13 / Caesar wrapper',
    category: 'encoding-smuggling',
    severity: 'medium',
    description: 'Mentions ROT13 or asks the model to decode an obfuscated payload.',
    re: /\b(ROT[\s-]?13|decode\s+(the|this)\s+(following|cipher|message|string))\b/i,
    owasp: ['LLM01'],
  },
  {
    id: 'leet-speak',
    name: 'Leet-speak obfuscation',
    category: 'encoding-smuggling',
    severity: 'low',
    description: 'Heavy use of digit-letter substitutions — sometimes used to bypass keyword filters.',
    re: /\b\w*[013457]\w*[013457]\w*[013457]\w*[013457]\w+\b/,
    owasp: ['LLM01'],
  },
  {
    id: 'unicode-tag-chars',
    name: 'Invisible Unicode tags',
    category: 'encoding-smuggling',
    severity: 'critical',
    description: 'Unicode tag characters (U+E0000-U+E007F) used to smuggle hidden instructions invisible to humans.',
    re: /[\u{E0000}-\u{E007F}]/u,
    reference: 'Goodside, "Invisible prompt injection"',
    owasp: ['LLM01', 'LLM02'],
  },

  // ── Tool / agent abuse ────────────────────────────────────────────────
  {
    id: 'execute-command',
    name: 'Execute command',
    category: 'tool-abuse',
    severity: 'critical',
    description: "Direct instruction to run a shell command, eval code, or invoke a tool the user hasn't authorised.",
    re: /\b(execute|run|invoke|call|trigger)\s+(the\s+)?(command|tool|function|shell|bash)\b/i,
    owasp: ['LLM06'],
  },
  {
    id: 'curl-wget-payload',
    name: 'curl / wget payload',
    category: 'tool-abuse',
    severity: 'critical',
    description: 'Embedded download command — if the model has shell access, attacker pulls payload from C2.',
    re: /\b(curl|wget|fetch)\s+(-[a-zA-Z]+\s+)*https?:\/\/\S+/i,
    owasp: ['LLM06', 'LLM03'],
  },
  {
    id: 'rm-rf',
    name: 'Destructive filesystem op',
    category: 'tool-abuse',
    severity: 'critical',
    description: 'Destructive shell command. Excessive-agency risk if the model has filesystem write tools.',
    re: /\brm\s+-rf?\s+\/|\bdel\s+\/[fs]\s|\bformat\s+[a-z]:\s/i,
    owasp: ['LLM06'],
  },

  // ── Data exfiltration ─────────────────────────────────────────────────
  {
    id: 'leak-env',
    name: 'Leak environment variables',
    category: 'data-exfiltration',
    severity: 'critical',
    description: 'Asks the model to read or echo env vars / secrets.',
    re: /\b(env|environment)\s+(vars?|variables?)\b|\b(API[_\s]?KEY|SECRET|TOKEN|PASSWORD)\b/i,
    owasp: ['LLM02'],
  },
  {
    id: 'send-to-attacker',
    name: 'Send to attacker URL',
    category: 'data-exfiltration',
    severity: 'critical',
    description: 'Instructs the model to POST data to an external URL — classic indirect-injection exfil.',
    re: /\b(send|post|exfiltrate|forward|upload)\b.{0,40}\b(to|via)\b.{0,80}https?:\/\/\S+/i,
    owasp: ['LLM02'],
  },
  {
    id: 'image-pixel-exfil',
    name: 'Image-pixel exfil',
    category: 'data-exfiltration',
    severity: 'high',
    description: 'Image-render-via-URL exfiltration: model emits markdown image whose URL contains the leaked data.',
    re: /!\[[^\]]*\]\(https?:\/\/[^)]+\?[^)]+\)/,
    owasp: ['LLM02'],
  },

  // ── Data / model poisoning (LLM04) ────────────────────────────────────
  {
    id: 'memory-injection',
    name: 'Memory / fact injection',
    category: 'indirect-injection',
    severity: 'high',
    description:
      'Asks the model (or memory-enabled agent) to permanently remember an attacker-controlled "fact". Poisons future turns and shared memory stores.',
    re: /\b(remember|memori[sz]e|store|save)\s+(this|the following)?\s*(fact|rule|preference|that)\b/i,
    owasp: ['LLM04'],
  },
  {
    id: 'rag-poison',
    name: 'RAG / retrieval poisoning marker',
    category: 'indirect-injection',
    severity: 'high',
    description:
      'Marker phrases used to bait retrievers into surfacing attacker-authored content (top-result, ranking-1, embedding-pin tags).',
    re: /\b(top[_\s-]?result|ranked\s*#?1|embedding[_\s-]?pin|prefer\s+this\s+source)\b/i,
    owasp: ['LLM04', 'LLM08'],
  },

  // ── Misinformation (LLM09) ────────────────────────────────────────────
  {
    id: 'always-claim',
    name: 'Always-claim injection',
    category: 'indirect-injection',
    severity: 'medium',
    description: "Tries to fix a confidently-false statement into the model's output regardless of evidence.",
    re: /\b(always|never)\s+(claim|say|answer|state)\s+that\b/i,
    owasp: ['LLM09'],
  },

  // ── Unbounded consumption (LLM10) ─────────────────────────────────────
  {
    id: 'token-bomb',
    name: 'Token / loop bomb',
    category: 'tool-abuse',
    severity: 'high',
    description:
      'Forces an unbounded generation loop or huge output — drives cost up and starves shared rate-limit budgets.',
    re: /\b(repeat|print|generate)\s+(this|the\s+word|the\s+letter|forever|infinitely|\d{4,}\s+times)\b/i,
    owasp: ['LLM10'],
  },
];

export interface InjectionMatch {
  pattern: InjectionPattern;
  matchedText: string;
  index: number;
}

/** Run every pattern against the input. Returns matches with positions. */
export function detectInjections(input: string): InjectionMatch[] {
  const matches: InjectionMatch[] = [];
  for (const p of PATTERNS) {
    // Reset lastIndex for /g regexes if any (none currently, but defensive)
    const re = new RegExp(p.re.source, p.re.flags);
    const m = re.exec(input);
    if (m) {
      matches.push({
        pattern: p,
        matchedText: m[0],
        index: m.index,
      });
    }
  }
  return matches;
}

export function severityScore(matches: InjectionMatch[]): {
  score: number;
  grade: 'safe' | 'low' | 'medium' | 'high' | 'critical';
} {
  let score = 0;
  for (const m of matches) {
    score += { critical: 40, high: 20, medium: 10, low: 5 }[m.pattern.severity];
  }
  score = Math.min(100, score);
  const grade = score >= 80 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'medium' : score >= 5 ? 'low' : 'safe';
  return { score, grade };
}
