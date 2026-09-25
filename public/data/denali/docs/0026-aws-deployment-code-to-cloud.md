# ADR 0026: AWS deployment inventory uses service-specific identity contracts

## Status

Accepted and live-provider verified on 2026-08-31. Automated connector, API, PostgreSQL,
production-web, exact account/Region validation, and eight-plane collection verification
pass. See the [live acceptance record](../product/aws-code-to-cloud-live-acceptance-2026-08-31.md).

## Decision

The `aws.code_to_cloud` connection scope validates and collects four independent regional
planes: Lambda functions, ECS task-definition families, EKS clusters, and SageMaker
endpoints. Each plane has separate inventory and relationship coverage, so a service failure
cannot become an empty result or withdraw observations from another service.

Collection uses the existing external-ID assume-role connection, rebinds the observed STS
account to the configured 12-digit account, and scans either every enabled Region or the
connection's exact selected-Region boundary. Pagination is limited to 100 pages and 10,000
resources per service and Region. Per-resource read failures make only that service plane
partial.

Every valid resource is retained as an observed `cloud_resource`. Lambda functions and ECS
task families become `ai_workload` assets only when they expose the explicit
`denali_ai_workload=true` tag or an allow-listed model/endpoint environment-variable name.
EKS clusters require the explicit tag because cluster existence alone does not prove an AI
workload. SageMaker endpoints are intrinsically model-serving resources and are eligible by
type. Arbitrary environment values, tag values, credentials, code, prompts, and responses are
never retained. The only environment values retained are syntactically bounded model identifiers
from allow-listed `*_MODEL_ID` keys when the key or identifier attributes the model to Bedrock.

Eligible workloads emit `HOSTED_ON` relationships to their cloud resource and `RUNS_AS`
relationships when Lambda role, ECS task role, EKS cluster role, or SageMaker model execution
role evidence is independently observed. A retained Bedrock identifier emits an observed `USES`
relationship from the workload to that exact model. Denali then reads only the linked execution
role's inline and attached IAM policies. A wildcard Bedrock invocation resource produces the
`DENALI-AWS-AI-IAM-001` finding; a denied or malformed IAM read makes this independent posture
plane partial and cannot become an empty result.

## Exact runtime identity contracts

All new direct-inventory joins require exact account ID and Region plus one service-specific
identifier:

| Service             | Runtime kind          | Exact identifier |
| ------------------- | --------------------- | ---------------- |
| Lambda              | `serverless_function` | `function_name`  |
| ECS task definition | `container_task`      | `task_family`    |
| EKS cluster         | `kubernetes_cluster`  | `cluster_name`   |
| SageMaker endpoint  | `model_endpoint`      | `endpoint_name`  |

The accepted CDK/CloudFormation Lambda and ECS join remains unchanged: it still requires the
observed CloudFormation logical-ID prefix plus exact function or container name. Direct
account inventory is an additional identity contract, not a relaxation of that contract.

## Source declaration contracts

Terraform supports `aws_lambda_function`, `aws_ecs_task_definition`, `aws_eks_cluster`, and
`aws_sagemaker_endpoint`. The default AWS provider must contain a literal `region` and exactly
one literal 12-digit `allowed_account_ids` value. Each resource must also contain its literal
service name field (`function_name`, `family`, or `name`).

SAM and CloudFormation YAML/JSON support `AWS::Serverless::Function`,
`AWS::Lambda::Function`, `AWS::ECS::TaskDefinition`, `AWS::EKS::Cluster`, and
`AWS::SageMaker::Endpoint`. Templates must declare literal boundary metadata:

```yaml
Metadata:
  Denali:
    AccountId: '123456789012'
    Region: us-east-1
```

The resource's corresponding name property must also be literal. Dynamic or incomplete
values produce a visible analysis warning and no deployment relationship.

## Consequences

- Existing AWS connections created without `aws.code_to_cloud` cannot collect this inventory;
  the UI explains that a new scoped plan is required.
- EKS correlation in this step proves only repository-to-cluster intent. The shared
  Kubernetes workload contract is defined separately in
  [ADR 0027](0027-shared-kubernetes-code-to-cloud.md).
- Artifact identity and source-revision attestation remain separate from an exact deployment
  identity match.
- A successful empty plane proves only that the bounded list operation completed.
