# ADR 0003: AWS Bedrock inventory is native, regional, and evidence-scoped

**Status:** accepted — 2026-08-26

## Decision

Denali discovers AWS AI inventory directly through read-only AWS control-plane APIs. It
does not require Prowler to make an agent, model, tool, guardrail, identity, or knowledge
base exist in Denali. Prowler may independently assert the same assets and remains the
first reference source for cloud configuration findings.

The first AWS connector covers Amazon Bedrock Agents and Guardrails. Every collection
run is scoped to exactly one account and region. Agent, guardrail, and relationship
coverage are separate planes so success in one API family cannot authorize withdrawal
for another family that failed or was not scanned.

## Inventory contract

| AWS fact                               | Denali representation | Identity rule                                     |
| -------------------------------------- | --------------------- | ------------------------------------------------- |
| Bedrock agent                          | `ai_agent`            | Full agent ARN                                    |
| Agent foundation model                 | `ai_model`            | Exact model or inference-profile identifier       |
| Agent resource role                    | `identity`            | Full IAM role ARN                                 |
| Native Bedrock guardrail               | `ai_guardrail`        | Full guardrail ARN                                |
| Action-group function or API operation | `ai_tool`             | Agent ARN + version + action-group ID + operation |
| Associated knowledge base              | `ai_datastore`        | Account + region + knowledge-base ID              |

An agent is one durable asset. DRAFT and every version reached by an alias are retained
as version-specific configuration inside its source assertion; their roles, models,
guardrails, action groups, and knowledge bases are never flattened into one union.
Disabled action groups and knowledge-base associations remain visible with their state.

## Relationship contract

- Agent `USES` model.
- Agent `RUNS_AS` execution role.
- Agent `PROTECTED_BY` guardrail only after the guardrail resolves to a native guardrail
  observed in the same account and region.
- Agent `CAN_INVOKE` an enabled action-group operation for the specific observed version.
- Agent `CAN_READ` an enabled associated knowledge base for the specific observed version.
- Structural source and hosting relationships remain topology, never authority.

An action-group description or schema may influence an agent, but it does not prove a
permission. Denali never converts descriptive text into `CAN_INVOKE`, `CAN_READ`, or
`CAN_WRITE`.

## Coverage and failure rules

1. `ListAgents` success is required for complete agent inventory coverage in a region.
2. A missing required ID, pagination failure, or failed per-agent detail call makes the
   relevant plane partial. Already observed siblings remain visible.
3. `GetAgent` is DRAFT configuration. Numbered versions are read with
   `GetAgentVersion`; DRAFT configuration is never copied into a numbered version.
4. Alias discovery determines which numbered versions are currently routed. Alias
   status and invocation state are retained.
5. Action groups and knowledge bases are enumerated separately for every retained
   version. A failure in one version does not erase another version's evidence.
6. Guardrail inventory comes only from native `ListGuardrails`/`GetGuardrail` results.
   A bare attachment ID does not mint a guardrail. An ARN-shaped attachment must match
   the observed guardrail ARN, account, region, and short ID.
7. Only a complete plane for the same account and region may withdraw that plane's old
   assertions. Resource-scoped scans never authorize broader withdrawal.

These rules preserve the most important lessons from the earlier Bedrock implementation
without retaining its Prowler carrier rows or scan lifecycle.

## Evidence and data minimization

Evidence stores the AWS operation, account, region, stable resource identifier, and
observation time—not the entire SDK response. Agent instructions, prompt overrides,
function schemas, environment values, and blocked-response messages may contain business
or secret material. Denali stores bounded security-relevant derivatives and hashes by
default; raw sensitive content requires an explicit future evidence-vault design.

Errors persist as safe operation/classification facts. SDK exception strings are not
stored because they may echo request parameters or credentials.

## Implementation sequence

1. Agents, DRAFT configuration, models, execution roles, and native guardrails.
2. Aliases and independently fetched numbered versions.
3. Action groups, function/OpenAPI tools, and confirmation metadata.
4. Knowledge-base associations and their enabled/disabled state.
5. Declared-versus-observed comparison with repository and live MCP inventory.

## Authoritative API references

- [ListAgents](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent_ListAgents.html)
- [AgentVersion](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent_AgentVersion.html)
- [AgentActionGroup](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent_AgentActionGroup.html)
- [ListAgentKnowledgeBases](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent_ListAgentKnowledgeBases.html)
- [GetGuardrail](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_GetGuardrail.html)

## Consequences

Denali gains a standalone AWS inventory even when no CSPM is installed, while multiple
sources can still converge on the same natural keys. The connector is more conservative
than a flat list: partial scans retain stale assertions until positive regional coverage
returns. This is intentional; an honestly stale asset is safer than a falsely absent one.
