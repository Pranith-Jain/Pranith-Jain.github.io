/**
 * AEAD Workflow Orchestrator — chains Acquire→Enrich→Assess→Deliver phases.
 *
 * Manages investigation lifecycle across phases, tracking progress,
 * triggering adaptive chaining (discovered identifiers fan out automatically),
 * and producing phase summaries.
 */

import {
  workspaceGet,
  workspaceUpdate,
  subjectList,
  findingList,
  type WorkspaceEnv,
  type Workspace,
} from './cti-workspace';

export type AeadPhase = 'acquire' | 'enrich' | 'assess' | 'deliver' | 'complete';

export interface PhaseProgress {
  phase: AeadPhase;
  status: 'pending' | 'active' | 'complete' | 'skipped';
  commandsRun: string[];
  findingsCount: number;
  subjectsDiscovered: number;
  startedAt?: string;
  completedAt?: string;
}

export interface WorkflowState {
  workspaceId: string;
  target: string;
  targetType: string;
  currentPhase: AeadPhase;
  phases: PhaseProgress[];
  startedAt: string;
  updatedAt: string;
}

export interface PhaseCommand {
  command: string;
  description: string;
  category: 'acquire' | 'enrich' | 'assess' | 'deliver';
  targetTypes: string[]; // which target types this applies to
}

/** All available AEAD commands mapped to phases. */
export const AEAD_COMMANDS: PhaseCommand[] = [
  // ACQUIRE
  {
    command: '/sweep',
    description: 'Multi-vector recon on any target type',
    category: 'acquire',
    targetTypes: ['person', 'domain', 'org', 'username', 'email', 'ip'],
  },
  {
    command: '/query',
    description: 'Build advanced search operator queries',
    category: 'acquire',
    targetTypes: ['person', 'domain', 'org', 'username', 'email', 'ip'],
  },
  {
    command: '/username',
    description: 'Enumerate handle across 3000+ platforms',
    category: 'acquire',
    targetTypes: ['person', 'org', 'username'],
  },
  {
    command: '/email-deep',
    description: 'Deep email investigation',
    category: 'acquire',
    targetTypes: ['person', 'org', 'email'],
  },
  {
    command: '/subdomain',
    description: 'Subdomain enumeration via CT logs',
    category: 'acquire',
    targetTypes: ['domain', 'org'],
  },
  {
    command: '/threat-check',
    description: 'IP/domain/URL threat intelligence',
    category: 'acquire',
    targetTypes: ['domain', 'ip'],
  },
  {
    command: '/breach-deep',
    description: 'Multi-source breach lookup',
    category: 'acquire',
    targetTypes: ['person', 'domain', 'org', 'email'],
  },
  {
    command: '/github-osint',
    description: 'GitHub user/org/repo recon',
    category: 'acquire',
    targetTypes: ['person', 'domain', 'org', 'username'],
  },
  { command: '/scam-check', description: 'Phishing/scam domain check', category: 'acquire', targetTypes: ['domain'] },
  {
    command: '/secrets',
    description: 'Exposed credentials in repos',
    category: 'acquire',
    targetTypes: ['domain', 'org'],
  },
  {
    command: '/msftrecon',
    description: 'M365/Azure tenant recon',
    category: 'acquire',
    targetTypes: ['domain', 'org'],
  },

  // ENRICH
  {
    command: '/branch',
    description: 'Expand a discovered identifier laterally',
    category: 'enrich',
    targetTypes: ['person', 'domain', 'org', 'username', 'email', 'ip'],
  },
  {
    command: '/crossref',
    description: 'Detect shared identifiers across subjects',
    category: 'enrich',
    targetTypes: ['person', 'domain', 'org', 'username', 'email', 'ip'],
  },
  {
    command: '/timeline',
    description: 'Assemble dated event sequence',
    category: 'enrich',
    targetTypes: ['person', 'domain', 'org', 'username', 'email', 'ip'],
  },
  {
    command: '/link-subjects',
    description: 'Define connection between two subjects',
    category: 'enrich',
    targetTypes: ['person', 'domain', 'org', 'username', 'email', 'ip'],
  },

  // ASSESS
  {
    command: '/exposure',
    description: 'Composite exposure score (0-100)',
    category: 'assess',
    targetTypes: ['person', 'domain', 'org', 'username', 'email', 'ip'],
  },
  {
    command: '/threat-model',
    description: 'Build threat model from findings',
    category: 'assess',
    targetTypes: ['person', 'domain', 'org', 'username', 'email', 'ip'],
  },
  {
    command: '/validate',
    description: 'Quality audit — score 0-100',
    category: 'assess',
    targetTypes: ['person', 'domain', 'org', 'username', 'email', 'ip'],
  },
  {
    command: '/coverage',
    description: 'Coverage matrix with identified gaps',
    category: 'assess',
    targetTypes: ['person', 'domain', 'org', 'username', 'email', 'ip'],
  },

  // DELIVER
  {
    command: '/report',
    description: 'Formal structured intelligence report',
    category: 'deliver',
    targetTypes: ['person', 'domain', 'org', 'username', 'email', 'ip'],
  },
  {
    command: '/report brief',
    description: 'Single-page executive brief',
    category: 'deliver',
    targetTypes: ['person', 'domain', 'org', 'username', 'email', 'ip'],
  },
  {
    command: '/brief',
    description: 'Plain-language summary',
    category: 'deliver',
    targetTypes: ['person', 'domain', 'org', 'username', 'email', 'ip'],
  },
  {
    command: '/render entities',
    description: 'ASCII entity relationship diagram',
    category: 'deliver',
    targetTypes: ['person', 'domain', 'org', 'username', 'email', 'ip'],
  },
  {
    command: '/render timeline',
    description: 'Chronological event chart',
    category: 'deliver',
    targetTypes: ['person', 'domain', 'org', 'username', 'email', 'ip'],
  },
];

function phaseIndex(phase: AeadPhase): number {
  const order: AeadPhase[] = ['acquire', 'enrich', 'assess', 'deliver', 'complete'];
  return order.indexOf(phase);
}

/** Get commands recommended for the current phase and target type. */
export function getPhaseCommands(phase: AeadPhase, targetType: string): PhaseCommand[] {
  return AEAD_COMMANDS.filter((cmd) => cmd.category === phase && cmd.targetTypes.includes(targetType));
}

/** Build initial workflow state for a workspace. */
export function initWorkflowState(ws: Workspace): WorkflowState {
  return {
    workspaceId: ws.id,
    target: ws.target,
    targetType: ws.targetType,
    currentPhase: ws.phase as AeadPhase,
    phases: (['acquire', 'enrich', 'assess', 'deliver', 'complete'] as AeadPhase[]).map((phase) => ({
      phase,
      status:
        phaseIndex(phase) < phaseIndex(ws.phase as AeadPhase)
          ? ('complete' as const)
          : phase === ws.phase
            ? ('active' as const)
            : ('pending' as const),
      commandsRun: [],
      findingsCount: 0,
      subjectsDiscovered: 0,
    })),
    startedAt: ws.createdAt,
    updatedAt: ws.updatedAt,
  };
}

/** Advance a workspace to the next phase. */
export async function advancePhase(
  env: WorkspaceEnv,
  workspaceId: string
): Promise<{ workspace: Workspace; nextPhase: AeadPhase } | null> {
  const ws = await workspaceGet(env, workspaceId);
  if (!ws) return null;

  const order: AeadPhase[] = ['acquire', 'enrich', 'assess', 'deliver', 'complete'];
  const currentIdx = order.indexOf(ws.phase as AeadPhase);

  if (currentIdx >= order.length - 1) {
    return { workspace: ws, nextPhase: ws.phase as AeadPhase };
  }

  const nextPhase = order[currentIdx + 1] as AeadPhase;
  const updated = await workspaceUpdate(env, workspaceId, {
    phase: nextPhase,
    status: nextPhase === 'complete' ? 'active' : ws.status,
  });

  return { workspace: updated!, nextPhase };
}

/** Get summary stats for a workspace. */
export async function workspaceSummary(env: WorkspaceEnv, workspaceId: string) {
  const ws = await workspaceGet(env, workspaceId);
  if (!ws) return null;

  const subjects = await subjectList(env, workspaceId);
  const findings = await findingList(env, workspaceId);

  const findingsByWeight = {
    CRITICAL: findings.filter((f) => f.weight === 'CRITICAL').length,
    HIGH: findings.filter((f) => f.weight === 'HIGH').length,
    MEDIUM: findings.filter((f) => f.weight === 'MEDIUM').length,
    LOW: findings.filter((f) => f.weight === 'LOW').length,
    INFO: findings.filter((f) => f.weight === 'INFO').length,
  };

  const findingsByType: Record<string, number> = {};
  for (const f of findings) {
    findingsByType[f.findingType] = (findingsByType[f.findingType] || 0) + 1;
  }

  const recommendedCommands = getPhaseCommands(ws.phase as AeadPhase, ws.targetType);

  return {
    workspace: ws,
    subjectsCount: subjects.length,
    findingsCount: findings.length,
    findingsByWeight,
    findingsByType,
    currentPhase: ws.phase,
    recommendedCommands: recommendedCommands.map((c) => c.command),
  };
}
