# ADR 0024: GCP code-to-cloud uses Cloud Asset resource snapshots

## Status

Accepted for Cloud Run services and Cloud Run functions Gen2. Live-project control-plane
acceptance passed on 2026-08-31 using an independently observed Cloud Run service and an exact
exported-YAML identity join.

## Decision

Denali reads Cloud Run services and Cloud Run functions through the project-scoped Cloud
Asset Inventory `assets.list` endpoint with `contentType=RESOURCE`. Collection is explicit,
uses the connection's keyless service-account identity, and runs once for every exact project
ID and immutable project number selected during onboarding.

The bounded collector requests only these supported asset types:

- `run.googleapis.com/Service`; and
- `cloudfunctions.googleapis.com/Function`, retaining only `GEN_2` functions.

Each asset type has independent inventory and relationship coverage. Pagination stops at 100
pages or 10,000 records per type and project. A failed type cannot withdraw observations from
the other type. Cloud Run RESOURCE content is identity-checked and normalized from either the
Knative v1 Service shape or the Cloud Run v2 Service shape; other shapes remain partial
coverage rather than guessed inventory.

Cloud Asset Viewer already granted by the accepted onboarding flow includes the required
resource-list permission. Validation now exercises `cloudasset.assets.listResource` with the
same two asset types and `RESOURCE` content rather than treating a resource-search call as
proof of this permission. The API contract and supported types are documented by Google in
[assets.list](https://cloud.google.com/asset-inventory/docs/reference/rest/v1/assets/list) and
[Cloud Asset supported types](https://cloud.google.com/asset-inventory/docs/asset-types).

## AI workload classification

Every valid resource is retained as an observed `cloud_resource`. It becomes an
`ai_workload` eligible for deployment correlation only when the resource snapshot contains
at least one bounded signal:

- the explicit label `denali_ai_workload=true`; or
- an environment-variable **name** matching the existing model-configuration-key contract,
  such as `VERTEX_MODEL_ID`.

Environment values, secret references, arbitrary annotations, and full provider responses
are never persisted. The sole value exception is a syntactically constrained model identifier
under an explicit allowlist of non-secret keys (`VERTEX_MODEL_ID`, `GEMINI_MODEL_ID`, and
`GOOGLE_MODEL_ID`). That bounded value creates an observed `ai_model` asset and a workload
`USES` relationship. Evidence otherwise retains only resource identity, project/location,
immutable UID when present, revision, update time, classification method, and matching
configuration key names. Runtime service-account identity and `RUNS_AS` relationships are
observed separately.

## Source identity contracts

Terraform declarations are eligible only when `project`, `location`, and `name` are all
literal inside a `google_cloud_run_v2_service` or `google_cloudfunctions2_function` resource.
The exact join requires:

- provider `gcp` and the same runtime kind;
- exact project ID;
- exact location; and
- exact service or function name.

Exported Cloud Run `serving.knative.dev/v1` Service YAML uses its literal metadata namespace
as immutable project number. Its exact join therefore requires project number, the literal
`cloud.googleapis.com/location` label, and metadata name. Dynamic or incomplete values remain
visible limitations and create no edge.

Cloud Run revision, image, endpoint, and runtime service account are independent runtime
context. The first slice does not claim that a Terraform image string or repository revision
matches deployed bytes; artifact identity and source-revision attestation remain separate.

## Operational consequences

- Existing GCP connections created without the new `gcp.code_to_cloud` declared scope must
  explicitly adopt and validate that scope before collection.
- A successful empty collection proves the bounded asset types were enumerated, not that the
  project has no other compute or AI systems.
- Name similarity, labels other than the explicit classification label, and shared model names
  never create a deployment relationship.
- Cloud Asset snapshot freshness is provider-controlled and is represented by observation and
  resource update timestamps rather than assumed to be instantaneous.
