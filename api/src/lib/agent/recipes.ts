/**
 * Investigation recipes — executable playbooks (Fleet-parity "Recipes").
 *
 * Each recipe is an ordered sequence of tool intents the planner can follow,
 * with parameter templates resolved from the investigation query. Recipes are
 * injected into the planner context as structured playbooks; `get_recipe`
 * returns the full step list so the planner can execute it literally.
 *
 * This is deliberately data, not code: recipes never execute tools directly
 * (the loop engine's guardrails — dedup, per-step cap, banned tools — stay in
 * charge). The planner treats a recipe as a proven collection plan.
 */

export interface RecipeStep {
  /** Tool to call. */
  tool: string;
  /** Parameter template — {query} and {ioc} placeholders resolved per run. */
  args: Record<string, string>;
  /** Why this step exists (shown to planner + in UI). */
  why: string;
}

export interface Recipe {
  id: string;
  name: string;
  /** When to pick this recipe. */
  trigger: string;
  /** Query types this recipe serves. */
  queryTypes: string[];
  steps: RecipeStep[];
}

export const RECIPES: Recipe[] = [
  {
    id: 'file-triage',
    name: 'Suspicious file triage',
    trigger: 'User supplies base64/hex bytes or a hash of an unknown binary',
    queryTypes: ['malware', 'sample', 'binary', 'general'],
    steps: [
      {
        tool: 'static_triage_file',
        args: { data_base64: '{input}', filename: '{filename}' },
        why: 'Family + entropy + packer signals without executing anything',
      },
      {
        tool: 'sample_scan',
        args: { hash: '{hash}' },
        why: 'Multi-provider sandbox verdicts for the hash when bytes are unavailable',
      },
      {
        tool: 'search_malpedia',
        args: { q: '{family}' },
        why: 'Family intel + references once static triage suggests a family',
      },
      {
        tool: 'get_yara_rules',
        args: { q: '{family}' },
        why: 'Community detection rules to confirm family attribution',
      },
      {
        tool: 'validate_detection_rule',
        args: { kind: 'yara', source: '{generated_yara}' },
        why: 'Validate any rule you author before delivering it',
      },
    ],
  },
  {
    id: 'phishing-email',
    name: 'Phishing email investigation',
    trigger: 'Raw .eml / email headers or a phishing URL supplied',
    queryTypes: ['phishing', 'url', 'general'],
    steps: [
      {
        tool: 'analyze_phishing_email',
        args: { raw_email: '{input}' },
        why: 'Header authentication (SPF/DKIM/DMARC) + URL extraction in one pass',
      },
      {
        tool: 'analyze_phishing_url',
        args: { url: '{url}' },
        why: 'Reputation + visual similarity for each extracted URL',
      },
      {
        tool: 'extract_observables_fast',
        args: { text: '{input}' },
        why: 'Deterministic sweep for defanged IOCs the AI parser may miss',
      },
      {
        tool: 'lookup_domain',
        args: { domain: '{domain}' },
        why: 'Infrastructure context for the sending/hosting domain',
      },
      {
        tool: 'build_stix_bundle',
        args: { indicator: '{ioc}' },
        why: 'Ship the findings as structured intel',
      },
    ],
  },
  {
    id: 'c2-identification',
    name: 'C2 beacon identification',
    trigger: 'Timestamps or PCAP-derived connection log for one destination',
    queryTypes: ['ioc', 'ip', 'general'],
    steps: [
      {
        tool: 'detect_c2_beaconing',
        args: { timestamps: '{timestamps}', destination: '{destination}' },
        why: 'Periodicity + jitter scoring is the fastest beacon tell',
      },
      {
        tool: 'check_ioc',
        args: { indicator: '{destination_ip}' },
        why: 'Reputation corroboration across providers',
      },
      {
        tool: 'lookup_asn',
        args: { asn: '{asn}' },
        why: 'Hosting context — bulletproof hosts vs. mainstream cloud',
      },
      {
        tool: 'passive_dns_lookup',
        args: { q: '{destination_ip}' },
        why: 'Co-hosted domains reveal campaign infrastructure',
      },
    ],
  },
  {
    id: 'dns-tunnel-hunt',
    name: 'DNS tunnel hunt',
    trigger: 'Bulk DNS queries suspected of exfil/channeling',
    queryTypes: ['domain', 'general'],
    steps: [
      {
        tool: 'detect_dns_tunneling',
        args: { queries: '{queries}', zone: '{zone}' },
        why: 'Label length/entropy/uniqueness fingerprint',
      },
      {
        tool: 'lookup_domain',
        args: { domain: '{zone}' },
        why: 'WHOIS/NS posture of the abused zone',
      },
      {
        tool: 'lookup_ip_geo',
        args: { ip: '{resolver_ip}' },
        why: 'Where the tunnel terminates',
      },
    ],
  },
  {
    id: 'report-ioc-sweep',
    name: 'Threat report IOC sweep',
    trigger: 'A blog/advisory/APT report to mine for indicators',
    queryTypes: ['general', 'campaign', 'actor'],
    steps: [
      {
        tool: 'parse_threat_report',
        args: { text: '{input}' },
        why: 'AI extraction adds actors/mitre/context beyond literal IOCs',
      },
      {
        tool: 'extract_observables_fast',
        args: { text: '{input}' },
        why: 'Deterministic pass catches defanged IOCs and exact positions',
      },
      {
        tool: 'enrich_ioc_deep',
        args: { indicator: '{top_ioc}' },
        why: 'Deep enrichment on the highest-value indicator',
      },
      {
        tool: 'reconstruct_attack_chain',
        args: { indicators: '{iocs_csv}', actor: '{actor}' },
        why: 'MITRE kill-chain mapping for the report',
      },
      {
        tool: 'build_stix_bundle',
        args: { actor: '{actor}' },
        why: 'Structured bundle for sharing',
      },
    ],
  },
];

/** Render all recipes as compact planner-facing text. */
export function describeRecipes(): string {
  return RECIPES.map((r) => {
    const steps = r.steps.map((s, i) => `${i + 1}. ${s.tool}`).join(' → ');
    return `- ${r.name} (${r.id}): ${steps}`;
  }).join('\n');
}

/**
 * Build the <recipes> block for the planner system prompt.
 * Kept short — full details come via get_recipe when the planner commits.
 */
export function buildRecipesPrompt(): string {
  if (RECIPES.length === 0) return '';
  return `<recipes>
Proven multi-step collection plans exist for common investigations:
${describeRecipes()}
When the query matches a recipe's trigger, call get_recipe(recipe_id) FIRST and follow its step order — it encodes which tools fill which report section. Deviate only when results demand it.
</recipes>`;
}

/** Full recipe detail for get_recipe output. */
export function getRecipeDetail(id: string): Recipe | null {
  const r = RECIPES.find((x) => x.id === id.trim().toLowerCase());
  if (!r) return null;
  return {
    ...r,
    steps: r.steps.map((s) => ({
      ...s,
      why: s.why,
    })),
  };
}
