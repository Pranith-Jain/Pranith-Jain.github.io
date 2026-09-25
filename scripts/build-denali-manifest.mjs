#!/usr/bin/env node
/**
 * Build the Denali manifest under public/data/denali/.
 *
 * Replicates the portable, deterministic core of transilienceai/denali
 * (Apache-2.0): the 9 deterministic correlation/detection rules (exact UIDs,
 * thresholds, windows, scope/token lists), the domain taxonomy (asset kinds,
 * coverage states, severities, relationship kinds), and the architecture ADR
 * knowledge base.
 *
 * Sources (Apache-2.0):
 *   https://github.com/transilienceai/denali
 *   Engines: src/denali/issues/engine.py + src/denali/detections/engine.py
 *   Taxonomy: src/denali/domain/inventory.py + findings.py
 *   Docs: docs/architecture/*.md + docs/product/agent-security-roadmap.md
 *
 * What is NOT replicated (requires Postgres, provider credentials, or live
 * cloud access): collectors, connectors, onboarding flows, the web app, and
 * the full snapshot evaluators. The edge `evaluate` surface covers the
 * self-contained sliding-window rules only; everything else is reference.
 *
 * Emits:
 *   public/data/denali/index.json        (slim — counts + slim rule/doc lists)
 *   public/data/denali/rules.json        (9 deterministic rules, full semantics)
 *   public/data/denali/taxonomy.json     (asset/coverage/severity/relationship enums)
 *   public/data/denali/docs-index.json   (slim ADR/roadmap index)
 *   public/data/denali/docs/<slug>.md    (verbatim ADR + roadmap bodies)
 *
 * Usage:
 *   node scripts/build-denali-manifest.mjs [--source <dir>]
 * `--source` points at a local denali checkout (offline mode); otherwise the
 * tree is discovered via the GitHub API and fetched from raw.githubusercontent.
 *
 * Safe to run repeatedly — wipes public/data/denali/ on each run.
 */
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'data', 'denali');

const SOURCE = 'github.com/transilienceai/denali';
const SOURCE_URL = 'https://github.com/transilienceai/denali';
const RAW_BASE = 'https://raw.githubusercontent.com/transilienceai/denali/main';
const LICENSE = 'Apache-2.0';

const args = process.argv.slice(2);
const sourceIdx = args.indexOf('--source');
const LOCAL_SOURCE = sourceIdx >= 0 ? args[sourceIdx + 1] : null;

// Deterministic rule catalog — semantics transcribed from the engine
// docstrings and module constants (issues/engine.py, detections/engine.py).
const RULES = [
  {
    uid: 'DENALI-RUNTIME-ENTRA-FAILURES-001',
    kind: 'runtime_detection',
    engine: 'detections',
    title: 'Repeated failed AI sign-ins',
    description: 'Detect repeated failures for the same exact actor and AI application.',
    inputs: { activityCategory: 'ai_app_sign_in', outcome: 'failure' },
    thresholds: { failureThreshold: 3, failureWindow: '24h' },
    grouping: 'actor external_uid (casefold) + application asset id; densest sliding window wins',
    evidenceSemantics: 'Groups by exact actor/application identity only; activities missing either side count as incomplete, not as misses.',
  },
  {
    uid: 'DENALI-RUNTIME-ENTRA-CONSENT-001',
    kind: 'runtime_detection',
    engine: 'detections',
    title: 'High-impact AI app consent grant',
    description: 'Detect successful consent changes for exact, active, unreviewed AI apps.',
    inputs: { activityCategory: 'admin_change', outcome: 'success' },
    thresholds: {
      consentOperations: ['consent to application', 'add delegated permission grant', 'add app role assignment grant'],
      highImpactScopes: ['mail.readwrite', 'mail.readwrite.shared', 'files.readwrite.all', 'sites.fullcontrol.all', 'directory.readwrite.all', 'rolemanagement.readwrite.directory'],
    },
    evidenceSemantics: 'Proves the consent operation and scope only; feeds the consent-then-use issue rule.',
  },
  {
    uid: 'DENALI-RUNTIME-UNREVIEWED-MODEL-001',
    kind: 'runtime_detection',
    engine: 'detections',
    title: 'Unreviewed model invocation',
    description: 'Detect successful invocation of an exact model still awaiting governance review.',
    inputs: { activityCategory: 'model_invocation', outcome: 'success' },
    thresholds: {},
    evidenceSemantics: 'Requires exact model identity matched to inventory; unresolved model references stay unresolved, never invented.',
  },
  {
    uid: 'DENALI-RUNTIME-AWS-UNDECLARED-MODEL-001',
    kind: 'runtime_detection',
    engine: 'detections',
    title: 'AWS undeclared model invocation',
    description: 'Detect an exact AWS model used by an agent without declared evidence.',
    inputs: { provider: 'aws_agentcore', activityCategory: 'model_invocation', outcome: 'success' },
    thresholds: {},
    evidenceSemantics: 'Session-scoped agent attribution; a model with no declared evidence is flagged, not auto-registered.',
  },
  {
    uid: 'DENALI-RUNTIME-AWS-UNAPPROVED-TOOL-001',
    kind: 'runtime_detection',
    engine: 'detections',
    title: 'AWS unapproved tool invocation',
    description: 'Detect observed AWS tool execution that is not explicitly approved.',
    inputs: { provider: 'aws_agentcore', activityCategory: 'tool_invocation', outcome: 'success' },
    thresholds: {
      mutatingToolTokens: ['create', 'delete', 'execute', 'invoke', 'post', 'publish', 'put', 'send', 'update', 'write'],
    },
    evidenceSemantics: 'Approval is explicit allow-list evidence; absence of approval is the finding, not proof of malice.',
  },
  {
    uid: 'DENALI-RUNTIME-AWS-RISKY-SEQUENCE-001',
    kind: 'runtime_detection',
    engine: 'detections',
    title: 'AWS risky action sequence',
    description: 'Detect a retrieval followed by a mutation-like tool call in one AWS session.',
    inputs: { provider: 'aws_agentcore' },
    thresholds: { sequenceWindow: '5m' },
    evidenceSemantics: 'Order + session + 5-minute window prove sequence only; intent is never inferred.',
  },
  {
    uid: 'DENALI-ISSUE-AGENT-WRITE-001',
    kind: 'issue',
    engine: 'issues',
    title: 'Agent sensitive-data write path',
    description: 'Correlate independently supported agent-to-sensitive-data write paths.',
    inputs: { signals: ['identity.overprivileged', 'tool.write_without_confirmation'] },
    thresholds: { minConfidence: 0.8, eligibleAssertions: ['observed', 'externally_verified'] },
    evidenceSemantics: 'Finding references select already-observed assets by kind + exact natural key — they never add nodes or edges. Only observed/externally-verified capability relationships at >=0.8 confidence participate.',
  },
  {
    uid: 'DENALI-ISSUE-SHADOW-AI-CONSENT-USE-001',
    kind: 'issue',
    engine: 'issues',
    title: 'Unreviewed AI consent then use',
    description: 'Correlate high-impact consent with later exact use of the same AI app.',
    inputs: { detectionRule: 'DENALI-RUNTIME-ENTRA-CONSENT-001', activityCategory: 'ai_app_sign_in', outcome: 'success' },
    thresholds: {},
    evidenceSemantics: 'Proves sequence and identity only. Does not claim the application exercised the granted permission or that either observed actor had malicious intent.',
  },
  {
    uid: 'DENALI-ISSUE-DEPLOYED-BEDROCK-GOVERNANCE-001',
    kind: 'issue',
    engine: 'issues',
    title: 'Deployed Bedrock governance gap',
    description: 'Correlate an included unguarded Bedrock call with broad runtime authority.',
    inputs: {
      signals: ['repository.bedrock_managed_guardrail_not_requested', 'identity.bedrock_model_family_wildcard'],
      deploymentJoin: { kind: 'deployed_by', assertion: 'inferred', confidence: 1.0, correlation: 'deterministic' },
    },
    thresholds: { minConfidence: 0.8 },
    evidenceSemantics: 'The deployment join and reachable-source set prove artifact inclusion only; workload config + role identity independently prove runtime context. Does not claim the source call was executed.',
  },
];

const TAXONOMY = {
  assetKinds: [
    { id: 'ai_application', category: 'ai' },
    { id: 'ai_agent', category: 'ai' },
    { id: 'ai_model', category: 'ai' },
    { id: 'model_artifact', category: 'ai' },
    { id: 'mcp_server', category: 'ai' },
    { id: 'ai_tool', category: 'ai' },
    { id: 'ai_guardrail', category: 'ai' },
    { id: 'ai_pipeline', category: 'ai' },
    { id: 'ai_datastore', category: 'ai' },
    { id: 'ai_workload', category: 'ai' },
    { id: 'ai_framework', category: 'ai' },
    { id: 'code_repository', category: 'supporting' },
    { id: 'cloud_resource', category: 'supporting' },
    { id: 'identity', category: 'supporting' },
    { id: 'application_endpoint', category: 'supporting' },
    { id: 'software_component', category: 'components' },
  ],
  coverageStates: [
    { id: 'complete', meaning: 'Correlation completed with sufficient evidence.' },
    { id: 'partial', meaning: 'Some required evidence failed or is partial; result is qualified.' },
    { id: 'failed', meaning: 'Correlation could not run.' },
    { id: 'not_supported', meaning: 'Provider/scope combination is not supported.' },
    { id: 'unknown', meaning: 'Coverage could not be determined; stays visible, never treated as safe.' },
  ],
  findingSeverities: ['unknown', 'informational', 'low', 'medium', 'high', 'critical'],
  findingStates: ['open', 'resolved', 'suppressed', 'unknown'],
  relationshipCategories: [
    { id: 'capability', meaning: 'Permissions and authority; may participate in a maximum blast-radius walk.' },
    { id: 'influence', meaning: 'Persuasion or steering. Never permission, never traversed as authority.' },
    { id: 'topology', meaning: 'Structural and lineage relationships.' },
  ],
  relationshipKinds: [
    { id: 'can_invoke', category: 'capability' },
    { id: 'can_read', category: 'capability' },
    { id: 'can_write', category: 'capability' },
    { id: 'runs_as', category: 'capability' },
    { id: 'reaches', category: 'capability' },
    { id: 'influences', category: 'influence' },
    { id: 'uses', category: 'topology' },
    { id: 'hosted_on', category: 'topology' },
    { id: 'defined_in', category: 'topology' },
    { id: 'deployed_by', category: 'topology' },
    { id: 'protected_by', category: 'topology' },
    { id: 'trains_on', category: 'topology' },
    { id: 'connects_to', category: 'topology' },
    { id: 'exposes', category: 'topology' },
    { id: 'contains_component', category: 'topology' },
  ],
  evidencePrinciples: [
    'Connection health proves only that declared, read-only entrypoints were callable for the recorded identity and scope at a recorded time.',
    'Collection coverage is separate from connection health. A failed or partial collection cannot withdraw previously observed inventory or resolve findings by absence.',
    'Findings and runtime events do not manufacture inventory assets or graph edges. Identity and correlation require exact, independently observed identifiers.',
    'Inventory is not a finding; a finding is not an issue; activity is not a detection; none is automatically a risk verdict or confirmed incident.',
    'Unsupported, unselected, unavailable, and unknown scope remains visible rather than becoming an empty or safe result.',
    'Collectors retain bounded metadata and evidence. Credentials, tokens, raw prompts/responses, secret values, and arbitrary scanner payloads are excluded.',
    'Demo records are visibly identified as fixture evidence.',
  ],
};

const EXTRA_DOCS = ['docs/product/agent-security-roadmap.md', 'docs/architecture/codebase-and-system-map.md'];

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function walk(dir, base, pred) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, base, pred));
    else if (pred(entry)) out.push(relative(base, full).replace(/\\/g, '/'));
  }
  return out;
}

async function discoverDocs() {
  if (LOCAL_SOURCE) {
    const adrs = walk(join(LOCAL_SOURCE, 'docs/architecture'), join(LOCAL_SOURCE), (e) => /^00\d\d-.*\.md$/.test(e))
      .map((p) => `docs/architecture/${basename(p)}`)
      .sort();
    return [...adrs, ...EXTRA_DOCS];
  }
  const resp = await fetch('https://api.github.com/repos/transilienceai/denali/git/trees/main?recursive=1', {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'portfolio-build-script' },
  });
  if (!resp.ok) throw new Error(`github tree API: ${resp.status}`);
  const data = await resp.json();
  const paths = (data.tree || []).map((t) => t.path);
  const adrs = paths.filter((p) => /^docs\/architecture\/00\d\d-.*\.md$/.test(p)).sort();
  return [...adrs, ...EXTRA_DOCS.filter((p) => paths.includes(p))];
}

async function loadText(relPath) {
  if (LOCAL_SOURCE) return readFileSync(join(LOCAL_SOURCE, relPath), 'utf8');
  const resp = await fetch(`${RAW_BASE}/${relPath}`, { headers: { 'User-Agent': 'portfolio-build-script' } });
  if (!resp.ok) throw new Error(`fetch ${relPath}: ${resp.status}`);
  return await resp.text();
}

function docTitle(body, fallback) {
  const m = body.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : fallback;
}

function docSummary(body) {
  const text = body
    .replace(/^#[^\n]*\n/, '')
    .replace(/[#*>`[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 400);
}

async function main() {
  const replicatedAt = new Date().toISOString().slice(0, 10);

  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  ensureDir(join(OUT, 'docs'));

  // 1. Rules (transcribed deterministic catalog — no fetch needed)
  const rules = RULES.map((r) => ({
    ...r,
    source: SOURCE,
    engineUrl:
      r.engine === 'issues'
        ? `${SOURCE_URL}/blob/main/src/denali/issues/engine.py`
        : `${SOURCE_URL}/blob/main/src/denali/detections/engine.py`,
    license: LICENSE,
  }));
  writeFileSync(
    join(OUT, 'rules.json'),
    JSON.stringify({ source: SOURCE, sourceUrl: SOURCE_URL, license: LICENSE, replicatedAt, total: rules.length, kinds: { issue: 3, runtime_detection: 6 }, rules }, null, 2) + '\n',
  );

  // 2. Taxonomy
  writeFileSync(
    join(OUT, 'taxonomy.json'),
    JSON.stringify(
      {
        source: SOURCE,
        sourceUrl: SOURCE_URL,
        license: LICENSE,
        replicatedAt,
        counts: {
          assetKinds: TAXONOMY.assetKinds.length,
          coverageStates: TAXONOMY.coverageStates.length,
          severities: TAXONOMY.findingSeverities.length,
          relationshipKinds: TAXONOMY.relationshipKinds.length,
        },
        ...TAXONOMY,
      },
      null,
      2,
    ) + '\n',
  );

  // 3. Docs (verbatim ADR + roadmap bodies)
  const docPaths = await discoverDocs();
  const slimDocs = [];
  let skipped = 0;
  for (const docPath of docPaths) {
    let body;
    try {
      body = await loadText(docPath);
    } catch (e) {
      console.warn(`[denali] fetch failed, skipping: ${docPath} (${e.message})`);
      skipped++;
      continue;
    }
    const file = basename(docPath);
    const slug = slugify(file.replace(/\.md$/, ''));
    const isAdr = /^00\d\d-/.test(file);
    const record = {
      slug,
      file,
      kind: isAdr ? 'adr' : 'guide',
      title: docTitle(body, file),
      summary: docSummary(body),
      sourceUrl: `${SOURCE_URL}/blob/main/${docPath}`,
      license: LICENSE,
    };
    writeFileSync(join(OUT, 'docs', `${slug}.md`), body);
    slimDocs.push(record);
  }
  slimDocs.sort((a, b) => a.slug.localeCompare(b.slug));
  writeFileSync(
    join(OUT, 'docs-index.json'),
    JSON.stringify({ source: SOURCE, sourceUrl: SOURCE_URL, license: LICENSE, replicatedAt, total: slimDocs.length, skipped, docs: slimDocs }, null, 2) + '\n',
  );

  // 4. Index
  writeFileSync(
    join(OUT, 'index.json'),
    JSON.stringify(
      {
        source: SOURCE,
        sourceUrl: SOURCE_URL,
        license: LICENSE,
        replicatedAt,
        tagline: 'Evidence-led, provider-neutral AI security platform.',
        edgeNote:
          'Collectors, connectors, and snapshot evaluators require Postgres + provider credentials and are reference-only here. The edge evaluate surface covers the self-contained sliding-window rules.',
        counts: {
          rules: rules.length,
          issueRules: 3,
          runtimeRules: 6,
          assetKinds: TAXONOMY.assetKinds.length,
          docs: slimDocs.length,
        },
        rules: rules.map((r) => ({ uid: r.uid, kind: r.kind, title: r.title, description: r.description })),
        docs: slimDocs,
      },
      null,
      2,
    ) + '\n',
  );

  console.log(`[denali] rules=${rules.length} taxonomyKinds=${TAXONOMY.assetKinds.length} docs=${slimDocs.length} skipped=${skipped}`);
}

main().catch((e) => {
  console.error(`[denali] build failed: ${e.message}`);
  process.exit(1);
});
