import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * AI Rule Generator — generates detection rules in multiple formats.
 *
 * Supported formats:
 *   - YARA: File pattern matching for malware detection
 *   - Sigma: SIEM-agnostic log detection rules (YAML)
 *   - KQL: Microsoft Sentinel / Defender queries
 *   - Splunk: Splunk SPL queries
 *   - Lucene: Elasticsearch queries
 *   - EQL: Elastic Event Query Language
 *   - Snort/Suricata: Network IDS rules
 *   - PowerShell: Detection scripts
 *   - DLP: Data loss prevention regex patterns
 *   - Supply-chain: Semgrep patterns for supply chain attacks
 *
 * POST /api/v1/rules/generate
 * POST /api/v1/rules/validate
 */

export type RuleType =
  | 'yara'
  | 'sigma'
  | 'kql'
  | 'splunk'
  | 'lucene'
  | 'eql'
  | 'snort'
  | 'powershell'
  | 'dlp'
  | 'supplychain';

const MAX_STRINGS = 50;
const MAX_DESCRIPTION_LENGTH = 5000;

interface GenerateRequest {
  type: RuleType;
  description: string;
  strings?: string[];
  family?: string;
  filetype?: string;
  complexity?: 'basic' | 'standard' | 'advanced';
  logsource?: string;
  table?: string;
}

interface GeneratedRule {
  rule_id: string;
  rule_type: RuleType;
  rule_name: string;
  rule_content: string;
  description: string;
  detection_logic: string[];
  syntax_confidence: 'high' | 'medium' | 'low';
  detection_confidence: 'high' | 'medium' | 'low';
  testing_notes: string;
  mitre_techniques: string[];
  meta: {
    generated_at: string;
    model: string;
    complexity: string;
  };
}

// ── Validation Functions ─────────────────────────────────────────────────

function validateYaraSyntax(rule: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!rule.includes('rule ')) errors.push('Missing rule declaration');
  if (!rule.includes('condition:')) errors.push('Missing condition section');
  const openBraces = (rule.match(/{/g) ?? []).length;
  const closeBraces = (rule.match(/}/g) ?? []).length;
  if (openBraces !== closeBraces) errors.push(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
  if (rule.includes('strings:') && !rule.match(/\$[a-zA-Z_]\w*\s*=/)) {
    errors.push('Strings section declared but no string definitions found');
  }
  return { valid: errors.length === 0, errors };
}

function validateSigmaSyntax(rule: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!rule.includes('title:')) errors.push('Missing title field');
  if (!rule.includes('detection:')) errors.push('Missing detection section');
  if (!rule.includes('condition:')) errors.push('Missing condition in detection section');
  if (!rule.includes('logsource:')) errors.push('Missing logsource section (recommended)');
  // Check YAML-like structure
  if (rule.includes('{') && rule.includes('}') && !rule.includes('selection:')) {
    errors.push('Possible JSON format detected - Sigma uses YAML format');
  }
  return { valid: errors.length === 0, errors };
}

function validateKqlSyntax(rule: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!rule.includes('|')) errors.push('Missing pipe operators - KQL uses pipe-based syntax');
  if (!rule.match(/\b(where|extend|project|summarize|join|union)\b/i)) {
    errors.push('Missing KQL operators (where, extend, project, summarize, etc.)');
  }
  // Check for common syntax errors
  const openParens = (rule.match(/\(/g) ?? []).length;
  const closeParens = (rule.match(/\)/g) ?? []).length;
  if (openParens !== closeParens) errors.push(`Unbalanced parentheses: ${openParens} open, ${closeParens} close`);
  return { valid: errors.length === 0, errors };
}

function validateSplunkSyntax(rule: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!rule.includes('index=') && !rule.includes('sourcetype='))
    errors.push('Missing index or sourcetype specification');
  if (!rule.includes('|') && !rule.match(/^(search|tstats|eventstats)/i))
    errors.push('Missing pipe operators or search command');
  return { valid: errors.length === 0, errors };
}

function validateLuceneSyntax(rule: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!rule.match(/(AND|OR|NOT|:)/i)) errors.push('Missing Lucene operators (AND, OR, NOT, field:value)');
  const openParens = (rule.match(/\(/g) ?? []).length;
  const closeParens = (rule.match(/\)/g) ?? []).length;
  if (openParens !== closeParens) errors.push(`Unbalanced parentheses`);
  return { valid: errors.length === 0, errors };
}

function validateEqlSyntax(rule: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!rule.match(/\b(process|file|network|registry|dns)\b/i))
    errors.push('Missing entity type (process, file, network, etc.)');
  if (!rule.match(/\bwhere\b/i)) errors.push('Missing where clause');
  return { valid: errors.length === 0, errors };
}

function validateSnortSyntax(rule: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!rule.includes('alert') && !rule.includes('drop')) errors.push('Missing action (alert/drop)');
  if (!rule.includes('msg:')) errors.push('Missing msg keyword');
  if (!rule.includes('sid:')) errors.push('Missing sid (signature ID)');
  if (!rule.includes('(') || !rule.includes(')')) errors.push('Missing rule options in parentheses');
  return { valid: errors.length === 0, errors };
}

function validatePowershellSyntax(rule: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!rule.match(/\$(\w+|\{)/)) errors.push('Missing PowerShell variables');
  if (!rule.match(/\b(Get-|Select-|Where-|ForEach-|Import-|Write-)\b/i)) errors.push('Missing PowerShell cmdlets');
  return { valid: errors.length === 0, errors };
}

function validateDlpSyntax(rule: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  try {
    const json = JSON.parse(rule);
    if (!json.patterns && !json.rules && !json.match) errors.push('Missing patterns/rules/match field');
  } catch {
    if (!rule.includes('pattern') && !rule.includes('regex') && !rule.includes('match')) {
      errors.push('Invalid JSON or missing pattern definitions');
    }
  }
  return { valid: errors.length === 0, errors };
}

function validateSupplychainSyntax(rule: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!rule.includes('rules:') && !rule.includes('patterns:')) errors.push('Missing rules or patterns section');
  if (!rule.includes('pattern') && !rule.includes('regex')) errors.push('Missing pattern definitions');
  return { valid: errors.length === 0, errors };
}

function validateRule(type: RuleType, rule: string): { valid: boolean; errors: string[] } {
  switch (type) {
    case 'yara':
      return validateYaraSyntax(rule);
    case 'sigma':
      return validateSigmaSyntax(rule);
    case 'kql':
      return validateKqlSyntax(rule);
    case 'splunk':
      return validateSplunkSyntax(rule);
    case 'lucene':
      return validateLuceneSyntax(rule);
    case 'eql':
      return validateEqlSyntax(rule);
    case 'snort':
      return validateSnortSyntax(rule);
    case 'powershell':
      return validatePowershellSyntax(rule);
    case 'dlp':
      return validateDlpSyntax(rule);
    case 'supplychain':
      return validateSupplychainSyntax(rule);
    default:
      return { valid: false, errors: ['Unknown rule type'] };
  }
}

function extractRuleName(type: RuleType, rule: string): string {
  switch (type) {
    case 'yara': {
      const match = rule.match(/rule\s+(\w+)/);
      return match?.[1] ?? 'generated_yara_rule';
    }
    case 'sigma': {
      const match = rule.match(/title:\s*(.+)/);
      return match?.[1]?.trim().replace(/\s+/g, '_').toLowerCase() ?? 'generated_sigma_rule';
    }
    case 'kql':
      return 'generated_kql_query';
    default:
      return 'generated_rule';
  }
}

// ── Prompt Templates ─────────────────────────────────────────────────────

function buildYaraPrompt(req: GenerateRequest, complexity: string): { system: string; user: string } {
  const complexityInstructions: Record<string, string> = {
    basic: 'Generate a simple rule with basic string matches and conditions.',
    standard: 'Generate a balanced rule with string matches, conditions, and basic metadata.',
    advanced:
      'Generate a comprehensive rule with multiple string types (text, hex, regex), detailed conditions, full metadata, and imports if needed.',
  };

  return {
    system:
      'You are a YARA rule expert. Generate syntactically valid YARA rules. Return ONLY the rule text, no explanations, no markdown code blocks.',
    user: `Generate a syntactically valid YARA rule for the following detection requirement.

Description: ${req.description}
${req.family ? `Malware family: ${req.family}` : ''}
${req.filetype ? `Target file type: ${req.filetype}` : ''}
${req.strings ? `Known strings to match:\n${req.strings.map((s, i) => `$s${i} = "${s}"`).join('\n')}` : ''}

Instructions: ${complexityInstructions[complexity]}

Requirements:
1. Rule MUST be syntactically valid YARA
2. Use appropriate string types (text, hex, regex) based on the content
3. Include meaningful metadata (author, description, date, hash, reference)
4. Include appropriate conditions (file size limits, string combinations)
5. Use modules (pe, elf, math) when relevant to the file type
6. Rule name must be a valid identifier (alphanumeric + underscore, starting with letter)

Return ONLY the YARA rule, no explanations or markdown.`,
  };
}

function buildSigmaPrompt(req: GenerateRequest, complexity: string): { system: string; user: string } {
  const logsource = req.logsource || 'windows/sysmon';

  const complexityInstructions: Record<string, string> = {
    basic: 'Generate a simple Sigma rule with basic selection and condition.',
    standard: 'Generate a balanced Sigma rule with multiple selections, conditions, and metadata.',
    advanced:
      'Generate a comprehensive Sigma rule with aggregations, time windows, multiple log sources, and detailed metadata.',
  };

  return {
    system:
      'You are a Sigma rule expert. Generate syntactically valid Sigma rules in YAML format. Return ONLY the rule YAML, no explanations, no markdown code blocks.',
    user: `Generate a syntactically valid Sigma rule for the following detection requirement.

Description: ${req.description}
${req.family ? `Malware family: ${req.family}` : ''}
${req.strings ? `Known indicators:\n${req.strings.map((s) => `- ${s}`).join('\n')}` : ''}

Log Source: ${logsource}
Instructions: ${complexityInstructions[complexity]}

Requirements:
1. Rule MUST be syntactically valid Sigma YAML
2. Include proper logsource section with category, product, and service
3. Use descriptive selection names (selection_1, selection_process, etc.)
4. Include meaningful detection logic with proper condition operators
5. Add appropriate metadata (id, status, description, author, references, tags)
6. Map to MITRE ATT&CK techniques where applicable
7. Set appropriate severity level (informational, low, medium, high, critical)

Return ONLY the Sigma rule YAML, no explanations or markdown.`,
  };
}

function buildKqlPrompt(req: GenerateRequest, complexity: string): { system: string; user: string } {
  const table = req.table || 'SecurityEvent';

  const complexityInstructions: Record<string, string> = {
    basic: 'Generate a simple KQL query with basic filtering.',
    standard: 'Generate a balanced KQL query with joins, projections, and aggregations.',
    advanced:
      'Generate a comprehensive KQL query with subqueries, time windows, statistical analysis, and anomaly detection.',
  };

  return {
    system:
      'You are a KQL (Kusto Query Language) expert for Microsoft Sentinel, Defender, and Azure Data Explorer. Generate syntactically valid KQL queries. Return ONLY the query, no explanations, no markdown code blocks.',
    user: `Generate a syntactically valid KQL query for the following detection requirement.

Description: ${req.description}
${req.family ? `Malware family: ${req.family}` : ''}
${req.strings ? `Known indicators:\n${req.strings.map((s) => `- ${s}`).join('\n')}` : ''}

Primary Table: ${table}
Instructions: ${complexityInstructions[complexity]}

Requirements:
1. Query MUST be syntactically valid KQL
2. Use appropriate table names and column references
3. Include proper where clauses with correct operators
4. Use extend for calculated columns when needed
5. Add summarize for aggregations if applicable
6. Include project to select relevant columns
7. Add comments explaining complex logic
8. Use datetime functions for time-based filtering
9. Consider using join for multi-table correlations

Return ONLY the KQL query, no explanations or markdown.`,
  };
}

function buildSplunkPrompt(req: GenerateRequest, complexity: string): { system: string; user: string } {
  const complexityInstructions: Record<string, string> = {
    basic: 'Generate a simple Splunk SPL query with basic search and filter.',
    standard: 'Generate a balanced Splunk query with stats, eval, and time ranges.',
    advanced: 'Generate a comprehensive Splunk query with subsearches, lookups, and advanced analytics.',
  };

  return {
    system:
      'You are a Splunk SPL expert. Generate syntactically valid Splunk queries. Return ONLY the query, no explanations, no markdown code blocks.',
    user: `Generate a syntactically valid Splunk query for the following detection requirement.

Description: ${req.description}
${req.family ? `Malware family: ${req.family}` : ''}
${req.strings ? `Known indicators:\n${req.strings.map((s) => `- ${s}`).join('\n')}` : ''}

Instructions: ${complexityInstructions[complexity]}

Requirements:
1. Query MUST be syntactically valid Splunk SPL
2. Start with appropriate index (index=* or specific index)
3. Use proper Splunk commands (search, where, eval, stats, rex, lookup)
4. Include time range picker if applicable
5. Add field extractions using rex if needed
6. Use tstats for performance when possible
7. Add comments with inline documentation

Return ONLY the Splunk query, no explanations or markdown.`,
  };
}

function buildLucenePrompt(req: GenerateRequest, complexity: string): { system: string; user: string } {
  const complexityInstructions: Record<string, string> = {
    basic: 'Generate a simple Lucene query with basic field matches.',
    standard: 'Generate a balanced Lucene query with boolean operators and ranges.',
    advanced: 'Generate a comprehensive Lucene query with wildcards, proximity, and boosting.',
  };

  return {
    system:
      'You are an Elasticsearch Lucene query expert. Generate syntactically valid Lucene queries for Kibana and Elasticsearch. Return ONLY the query, no explanations, no markdown code blocks.',
    user: `Generate a syntactically valid Lucene query for the following detection requirement.

Description: ${req.description}
${req.family ? `Malware family: ${req.family}` : ''}
${req.strings ? `Known indicators:\n${req.strings.map((s) => `- ${s}`).join('\n')}` : ''}

Instructions: ${complexityInstructions[complexity]}

Requirements:
1. Query MUST be syntactically valid Lucene
2. Use proper field:value syntax
3. Use AND, OR, NOT boolean operators
4. Include wildcards (*) where appropriate
5. Use parentheses for grouping
6. Consider range queries for numeric/date fields
7. Use quotes for exact phrase matches

Return ONLY the Lucene query, no explanations or markdown.`,
  };
}

function buildEqlPrompt(req: GenerateRequest, complexity: string): { system: string; user: string } {
  const complexityInstructions: Record<string, string> = {
    basic: 'Generate a simple EQL query with basic event filtering.',
    standard: 'Generate a balanced EQL query with sequences and joins.',
    advanced: 'Generate a comprehensive EQL query with sequences, by fields, and time windows.',
  };

  return {
    system:
      'You are an Elastic EQL (Event Query Language) expert. Generate syntactically valid EQL queries. Return ONLY the query, no explanations, no markdown code blocks.',
    user: `Generate a syntactically valid EQL query for the following detection requirement.

Description: ${req.description}
${req.family ? `Malware family: ${req.family}` : ''}
${req.strings ? `Known indicators:\n${req.strings.map((s) => `- ${s}`).join('\n')}` : ''}

Instructions: ${complexityInstructions[complexity]}

Requirements:
1. Query MUST be syntactically valid EQL
2. Start with entity type (process, file, network, registry, dns)
3. Use where clause with proper operators
4. Use stringContains, startsWith, endsWith for string matching
5. Add sequence queries for multi-step detection
6. Use by keyword for grouping
7. Include time windows for sequences

Return ONLY the EQL query, no explanations or markdown.`,
  };
}

function buildSnortPrompt(req: GenerateRequest, complexity: string): { system: string; user: string } {
  const complexityInstructions: Record<string, string> = {
    basic: 'Generate a simple Snort rule with basic content matching.',
    standard: 'Generate a balanced Snort rule with multiple content options and metadata.',
    advanced: 'Generate a comprehensive Snort rule with PCRE, byte tests, and flow tracking.',
  };

  return {
    system:
      'You are a Snort/Suricata IDS rule expert. Generate syntactically valid Snort rules. Return ONLY the rule, no explanations, no markdown code blocks.',
    user: `Generate a syntactically valid Snort/Suricata rule for the following detection requirement.

Description: ${req.description}
${req.family ? `Malware family: ${req.family}` : ''}
${req.strings ? `Known patterns:\n${req.strings.map((s) => `- ${s}`).join('\n')}` : ''}

Instructions: ${complexityInstructions[complexity]}

Requirements:
1. Rule MUST be syntactically valid Snort/Suricata format
2. Start with alert/drop action
3. Specify protocol (tcp, udp, icmp, ip)
4. Define source and destination with variables ($HOME_NET, $EXTERNAL_NET)
5. Include msg keyword with descriptive message
6. Add content/pcre for pattern matching
7. Include classtype for classification
8. Add sid (signature ID) in 1000000+ range
9. Include rev (revision) number

Return ONLY the Snort rule, no explanations or markdown.`,
  };
}

function buildPowershellPrompt(req: GenerateRequest, complexity: string): { system: string; user: string } {
  const complexityInstructions: Record<string, string> = {
    basic: 'Generate a simple PowerShell script with basic filtering.',
    standard: 'Generate a balanced PowerShell script with event log queries and output formatting.',
    advanced: 'Generate a comprehensive PowerShell script with CIM/WMI, remote queries, and alerting.',
  };

  return {
    system:
      'You are a PowerShell security expert. Generate syntactically valid PowerShell scripts for threat hunting and detection. Return ONLY the script, no explanations, no markdown code blocks.',
    user: `Generate a syntactically valid PowerShell script for the following detection requirement.

Description: ${req.description}
${req.family ? `Malware family: ${req.family}` : ''}
${req.strings ? `Known patterns:\n${req.strings.map((s) => `- ${s}`).join('\n')}` : ''}

Instructions: ${complexityInstructions[complexity]}

Requirements:
1. Script MUST be syntactically valid PowerShell
2. Use Get-WinEvent or Get-EventLog for event queries
3. Include Where-Object for filtering
4. Add Select-Object for output formatting
5. Use regex patterns for string matching
6. Include comments explaining the detection logic
7. Add error handling with try/catch
8. Format output as table or list

Return ONLY the PowerShell script, no explanations or markdown.`,
  };
}

function buildDlpPrompt(req: GenerateRequest, complexity: string): { system: string; user: string } {
  const complexityInstructions: Record<string, string> = {
    basic: 'Generate simple DLP regex patterns for common sensitive data.',
    standard: 'Generate balanced DLP rules with multiple patterns and confidence scoring.',
    advanced: 'Generate comprehensive DLP rules with context-aware patterns and exceptions.',
  };

  return {
    system:
      'You are a Data Loss Prevention (DLP) expert. Generate DLP detection rules in JSON format with regex patterns. Return ONLY the JSON, no explanations, no markdown code blocks.',
    user: `Generate a DLP rule in JSON format for the following detection requirement.

Description: ${req.description}
${req.strings ? `Known patterns:\n${req.strings.map((s) => `- ${s}`).join('\n')}` : ''}

Instructions: ${complexityInstructions[complexity]}

Requirements:
1. Output MUST be valid JSON
2. Include "name" field with descriptive rule name
3. Include "match" field ("any" or "all")
4. Include "patterns" array with id, field, and regex
5. Use proper regex syntax
6. Include "severity" field (low, medium, high, critical)
7. Add "description" explaining what the rule detects
8. Consider "exceptions" for false positive reduction

Return ONLY the DLP JSON rule, no explanations or markdown.`,
  };
}

function buildSupplychainPrompt(req: GenerateRequest, complexity: string): { system: string; user: string } {
  const complexityInstructions: Record<string, string> = {
    basic: 'Generate simple Semgrep patterns for supply chain detection.',
    standard: 'Generate balanced Semgrep rules with multiple patterns and taint tracking.',
    advanced: 'Generate comprehensive Semgrep rules with metavariables, focus, and deep matching.',
  };

  return {
    system:
      'You are a Semgrep/static analysis expert. Generate syntactically valid Semgrep rules for supply chain security. Return ONLY the YAML rule, no explanations, no markdown code blocks.',
    user: `Generate a Semgrep rule for the following supply chain detection requirement.

Description: ${req.description}
${req.family ? `Package/library: ${req.family}` : ''}
${req.strings ? `Known patterns:\n${req.strings.map((s) => `- ${s}`).join('\n')}` : ''}

Instructions: ${complexityInstructions[complexity]}

Requirements:
1. Rule MUST be syntactically valid Semgrep YAML
2. Include rules array with id, message, severity
3. Specify languages (python, javascript, generic, etc.)
4. Use patterns or pattern-regex for matching
5. Add metadata with cwe, owasp references
6. Include fix suggestions if applicable

Return ONLY the Semgrep YAML rule, no explanations or markdown.`,
  };
}

// ── MITRE ATT&CK Extraction ─────────────────────────────────────────────

function extractMitreTechniques(description: string): string[] {
  const techniques: string[] = [];
  const descLower = description.toLowerCase();

  const mappings: [string[], string][] = [
    [['phishing', 'email', 'spearphish'], 'T1566'],
    [['powershell', 'script', 'ps1'], 'T1059.001'],
    [['cmd', 'command', 'cmd.exe'], 'T1059.003'],
    [['persistence', 'registry', 'run key'], 'T1547'],
    [['credential', 'password', 'mimikatz', 'dump'], 'T1003'],
    [['exfil', 'data', 'steal', 'exfiltration'], 'T1041'],
    [['ransom', 'encrypt', 'ransomware'], 'T1486'],
    [['obfuscat', 'pack', 'encode', 'base64'], 'T1027'],
    [['lateral', 'move', 'smb', 'psexec'], 'T1021.002'],
    [['c2', 'command and control', 'beacon', 'cobalt'], 'T1071'],
    [['process', 'injection', 'hollow'], 'T1055'],
    [['dll', 'sideload', 'hijack'], 'T1574'],
    [['wmi', 'wmic'], 'T1047'],
    [['scheduled', 'task', 'schtasks'], 'T1053'],
    [['service', 'sc.exe'], 'T1543.003'],
    [['network', 'connection', 'http', 'https'], 'T1071.001'],
    [['dns', 'query', 'tunneling'], 'T1071.004'],
    [['file', 'create', 'write', 'drop'], 'T1105'],
    [['evasion', 'defense', 'disable', 'av'], 'T1562'],
    [['discovery', 'recon', 'enumerate'], 'T1082'],
    [['collection', 'screen', 'capture', 'keylog'], 'T1113'],
    [['exploit', 'vulnerability', 'cve'], 'T1190'],
    [['supply chain', 'trojan', 'backdoor'], 'T1195'],
  ];

  for (const [keywords, technique] of mappings) {
    if (keywords.some((kw) => descLower.includes(kw))) {
      techniques.push(technique);
    }
  }

  return [...new Set(techniques)].slice(0, 8);
}

// ── Route Handlers ───────────────────────────────────────────────────────

const VALID_TYPES: RuleType[] = [
  'yara',
  'sigma',
  'kql',
  'splunk',
  'lucene',
  'eql',
  'snort',
  'powershell',
  'dlp',
  'supplychain',
];

export async function ruleGeneratorHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<GenerateRequest>();

    if (!body.type || !VALID_TYPES.includes(body.type)) {
      return c.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, 400);
    }

    if (!body.description) {
      return c.json({ error: 'description is required' }, 400);
    }

    if (body.description.length > MAX_DESCRIPTION_LENGTH) {
      return c.json({ error: `description too long (max ${MAX_DESCRIPTION_LENGTH} chars)` }, 400);
    }

    if (body.strings && body.strings.length > MAX_STRINGS) {
      return c.json({ error: `too many strings (max ${MAX_STRINGS})` }, 400);
    }

    const ai = c.env.AI;
    if (!ai) {
      return c.json({ error: 'Workers AI not available' }, 503);
    }

    const complexity = body.complexity ?? 'standard';

    const promptBuilders: Record<RuleType, (req: GenerateRequest, c: string) => { system: string; user: string }> = {
      yara: buildYaraPrompt,
      sigma: buildSigmaPrompt,
      kql: buildKqlPrompt,
      splunk: buildSplunkPrompt,
      lucene: buildLucenePrompt,
      eql: buildEqlPrompt,
      snort: buildSnortPrompt,
      powershell: buildPowershellPrompt,
      dlp: buildDlpPrompt,
      supplychain: buildSupplychainPrompt,
    };

    const { system, user } = promptBuilders[body.type](body, complexity);

    const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 2500,
      temperature: 0.2,
    });

    const content =
      typeof response === 'object' && 'response' in response
        ? (response as { response: string }).response
        : String(response);

    // Clean up response - remove markdown code blocks if present
    let ruleContent = content.trim();
    const codeBlockMatch = ruleContent.match(/```(?:\w+)?\s*([\s\S]*?)```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      ruleContent = codeBlockMatch[1].trim();
    }

    // Validate syntax
    const validation = validateRule(body.type, ruleContent);
    const ruleName = extractRuleName(body.type, ruleContent);
    const mitreTechniques = extractMitreTechniques(body.description);

    const result: GeneratedRule = {
      rule_id: crypto.randomUUID(),
      rule_type: body.type,
      rule_name: ruleName,
      rule_content: ruleContent,
      description: body.description,
      detection_logic: body.strings?.map((s) => `Matches "${s}"`) ?? ['Pattern-based detection'],
      syntax_confidence: validation.valid ? 'high' : 'low',
      detection_confidence: body.strings && body.strings.length > 0 ? 'high' : 'medium',
      testing_notes: validation.valid
        ? `${body.type.toUpperCase()} syntax validated. Test in your environment before deployment.`
        : `Syntax issues detected: ${validation.errors.join('; ')}. Manual review recommended.`,
      mitre_techniques: mitreTechniques,
      meta: {
        generated_at: new Date().toISOString(),
        model: '@cf/meta/llama-3.1-8b-instruct',
        complexity,
      },
    };

    return c.json(result, 200, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('Rule generator error:', err);
    return c.json({ error: 'Generation failed', details: err instanceof Error ? err.message : String(err) }, 500);
  }
}

export async function ruleValidateHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<{ type: RuleType; rule: string }>();

    if (!body.type || !VALID_TYPES.includes(body.type)) {
      return c.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, 400);
    }

    if (!body.rule) {
      return c.json({ error: 'rule is required' }, 400);
    }

    const validation = validateRule(body.type, body.rule);
    const ruleName = extractRuleName(body.type, body.rule);

    // Type-specific analysis
    let analysis: Record<string, unknown> = {};

    if (body.type === 'yara') {
      const stringMatches = body.rule.match(/\$[a-zA-Z_]\w*\s*=/g) ?? [];
      analysis = {
        string_count: stringMatches.length,
        has_conditions: body.rule.includes('condition:'),
        has_metadata: body.rule.includes('meta:'),
        has_imports: body.rule.includes('import '),
        complexity: stringMatches.length > 10 ? 'advanced' : stringMatches.length > 3 ? 'standard' : 'basic',
      };
    } else if (body.type === 'sigma') {
      analysis = {
        has_logsource: body.rule.includes('logsource:'),
        has_detection: body.rule.includes('detection:'),
        has_condition: body.rule.includes('condition:'),
        has_metadata: body.rule.includes('tags:') || body.rule.includes('author:'),
        has_falsepositives: body.rule.includes('falsepositives:'),
      };
    } else if (body.type === 'kql') {
      const operators = body.rule.match(/\b(where|extend|project|summarize|join|union|mv-expand|parse)\b/gi) ?? [];
      analysis = {
        operator_count: operators.length,
        has_where: operators.some((o) => o.toLowerCase() === 'where'),
        has_summarize: operators.some((o) => o.toLowerCase() === 'summarize'),
        has_join: operators.some((o) => o.toLowerCase() === 'join'),
        has_extend: operators.some((o) => o.toLowerCase() === 'extend'),
        complexity: operators.length > 5 ? 'advanced' : operators.length > 2 ? 'standard' : 'basic',
      };
    }

    return c.json({
      type: body.type,
      valid: validation.valid,
      errors: validation.errors,
      rule_name: ruleName,
      analysis,
    });
  } catch (err) {
    return c.json({ error: 'Validation failed', details: err instanceof Error ? err.message : String(err) }, 500);
  }
}
