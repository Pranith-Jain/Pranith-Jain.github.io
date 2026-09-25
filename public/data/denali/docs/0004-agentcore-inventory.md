# ADR 0004: AgentCore is the primary AWS agent inventory path

**Status:** accepted — 2026-08-27

## Context

AWS now describes Amazon Bedrock Agents as **Agents Classic**, does not open it to new
customers, and directs new agent deployments to Amazon Bedrock AgentCore. Denali keeps
the Classic connector for existing estates, but new AWS inventory work targets
AgentCore first. This prevents the product model from becoming an increasingly detailed
representation of a legacy-only service.

OCSF is not used for this inventory. It remains Denali's findings and activity
interchange boundary. Durable assets and relationships come from native, read-only
AgentCore control-plane observations.

## Phase-one inventory contract

| AgentCore fact    | Denali representation  | Natural key             |
| ----------------- | ---------------------- | ----------------------- |
| Agent Runtime     | `ai_agent`             | Runtime ARN             |
| Runtime endpoint  | `application_endpoint` | Endpoint ARN            |
| Gateway           | `mcp_server`           | Gateway ARN             |
| Gateway target    | `ai_tool`              | Gateway ARN + target ID |
| Workload identity | `identity`             | Workload identity ARN   |
| Execution role    | `identity`             | IAM role ARN            |
| Memory            | `ai_datastore`         | Memory ARN              |

A gateway target is explicitly marked with `granularity=gateway_target`. It is the
smallest target identity exposed by the control plane, not a claim that Denali has
enumerated every logical MCP operation inside an OpenAPI, Smithy, Lambda, API Gateway,
or remote MCP target.

The relationships are equally conservative:

- a runtime `RUNS_AS` its execution role and workload identity;
- a runtime `EXPOSES` a returned runtime endpoint;
- a gateway `RUNS_AS` its execution role and workload identity;
- a gateway `EXPOSES` a returned gateway target; and
- a memory `RUNS_AS` its returned memory execution role.

Denali does not infer runtime-to-gateway, runtime-to-memory, or target-to-backend edges
from names, ARNs embedded in opaque configuration, or shared identities.

## Coverage boundaries

Each account/region scan declares independent planes for runtime inventory, runtime
endpoint inventory, runtime relationships, gateway inventory, gateway-target inventory,
gateway relationships, workload identity inventory, memory inventory, and memory
relationships.

- A successful list call is required before that inventory plane can be complete.
- A malformed item or failed detail call makes only the affected plane partial.
- Endpoint enumeration failure makes runtime relationships partial without erasing the
  runtime asset already observed.
- Gateway-target enumeration or detail failure makes gateway relationships partial
  without poisoning workload identities, memories, or runtime coverage.
- A complete plane authorizes withdrawal only inside the same account and region.
- “Complete” means complete within the scanning principal's visibility. IAM filtering
  remains an explicit limitation.

## Data minimization

AgentCore APIs can return source artifacts, environment values, JWT configuration,
request-header allowlists, target schemas, credential-provider configuration, memory
namespace templates, extraction schemas, and memory delivery details. These may contain
secrets or sensitive business context.

Phase one stores stable identities and bounded security-relevant derivatives only:
configuration presence, types, counts, status, protocol, network mode, lifecycle limits,
and encryption/authentication flags. It never stores environment names or values,
source code/artifact configuration, target schemas, credential identifiers or tokens,
memory records, namespace values/templates, regexes, or SDK exception text. `GetMemory`
is always called with `view=without_decryption`.

## Consequences

Denali can show current and legacy AWS agent inventory without depending on Prowler or
pretending one API family represents the other. The first AgentCore slice provides
useful asset, identity, endpoint, gateway, target, and memory context while leaving
operation-level tool expansion and relationship inference for later evidence-bearing
work.

## Authoritative references

- [Bedrock API overview and Agents Classic notice](https://docs.aws.amazon.com/bedrock/latest/APIReference/Welcome.html)
- [ListAgentRuntimes](https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_ListAgentRuntimes.html)
- [GetAgentRuntime](https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_GetAgentRuntime.html)
- [ListAgentRuntimeEndpoints](https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_ListAgentRuntimeEndpoints.html)
- [ListGateways](https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_ListGateways.html)
- [GetGateway](https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_GetGateway.html)
- [ListGatewayTargets](https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_ListGatewayTargets.html)
- [GetGatewayTarget](https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_GetGatewayTarget.html)
- [ListWorkloadIdentities](https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_ListWorkloadIdentities.html)
- [ListMemories](https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_ListMemories.html)
- [GetMemory](https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_GetMemory.html)
