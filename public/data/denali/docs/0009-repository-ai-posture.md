# ADR 0009: Repository AI posture is a separate evidence plane

## Status

Accepted.

## Decision

Denali evaluates source-level AI configuration in a connector and coverage plane that
are separate from repository inventory and AWS control-plane posture.

The first supported check reads TypeScript and JavaScript ES-module imports from
`@aws-sdk/client-bedrock-runtime`. For a literal `ConverseCommand`,
`ConverseStreamCommand`, `InvokeModelCommand`, or
`InvokeModelWithResponseStreamCommand` input, it records only top-level property names.
It reports when the command input does not request the AWS managed-guardrail parameters
defined for that API.

The finding says only that the inspected call site does not request a managed guardrail.
It does not claim:

- that prompt injection is exploitable;
- that application-layer instructions or output validation are absent;
- that custom SDK middleware or a downstream proxy cannot add a control;
- that a configured guardrail would make the application safe; or
- that prompts, responses, or runtime payloads were inspected.

Dynamic command inputs and object spreads are indeterminate. They make coverage partial,
produce no absence finding, and prevent resolution by absence. Successful complete scans
are authoritative for this connector's narrow source scope.

## Evidence and privacy boundary

Evidence contains the repository revision, source path and line, command type, top-level
input property names, and required guardrail property names. It never stores source
snippets, prompt text, model payload values, environment values, or secrets.

## Consequences

- Repository inventory, deployed AWS posture, and source posture can corroborate one
  another without pretending to be the same observation.
- A future code-to-cloud correlation layer may join these findings to deployed workloads,
  but a source finding does not create inventory assets or graph edges.
- Additional languages and SDK invocation forms require explicit parsers and coverage
  semantics before they can be called supported.
