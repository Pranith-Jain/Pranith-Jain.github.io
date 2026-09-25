# ADR 0011: Static artifact inclusion is not runtime execution

## Status

Accepted.

## Decision

Denali may classify a repository finding as `artifact_included` only when it can trace
the finding's exact source file from a literal, declared artifact entry through a
bounded graph of local module imports.

The first supported build contracts are:

- an AWS CDK `NodejsFunction` with a literal `entry`; and
- an ECS image with a literal CDK asset context and Dockerfile whose build contains a
  literal `esbuild <entry> --bundle` command.

The module graph follows static TypeScript/JavaScript imports, re-exports, and literal
dynamic imports. It excludes type-only imports and commented-out imports. Relative
`.js`, `.mjs`, and `.cjs` module specifiers are resolved to their source-language
counterparts using deterministic candidate rules. A missing or ambiguous local module
makes coverage partial; Denali does not choose a candidate.

Findings whose source file is outside the traced graph remain `repository_only` for
that artifact. The same finding may be included in one artifact and repository-only for
another.

## Evidence boundary

The active `DEPLOYED_BY` assertion retains:

- the repository-relative artifact entry and optional Dockerfile;
- the set of repository-relative source modules reached; and
- one deterministic import chain from the artifact entry to each reached module.

Evidence contains paths and build metadata, not source snippets, prompts, runtime
payloads, credentials, or environment values.

`artifact_included` proves that the source module is part of the declared bundle under
the supported static build model. It does **not** prove that:

- the vulnerable or misconfigured call executes at runtime;
- a particular branch can reach the call;
- the deployed artifact bytes match the current working tree;
- middleware or a downstream service does or does not add an equivalent control; or
- the call produced a harmful consequence.

Those stronger conclusions require separate runtime, artifact-attestation, call-graph,
or issue-correlation evidence. Denali does not create a workload security issue from
artifact inclusion alone.

## Coverage behavior

Unsupported build systems, dynamic entry paths, non-literal Docker build declarations,
unresolved local imports, and source files outside the scan bounds remain explicit
partial coverage. A known import chain may still be reported as included when another
branch is incomplete because the reported chain is independently valid; the product
must show the coverage limitation alongside it.

Non-relative package imports are treated as external dependencies in this first slice.
Projects that configure local path aliases require a future resolver before Denali may
claim complete local-module coverage for those aliases.

## Consequences

- Anna's `judgment/bedrock.ts` call site is included in both its Lambda and proposal
  worker bundles through different import chains.
- Anna's disabled Visual QA call site remains repository-only for both live artifacts.
- The UI can separate artifact context from repository context without implying runtime
  execution.
- Supporting another bundler or language requires a new explicit build and resolution
  contract rather than a filename or model-name heuristic.
