# ADR 0027: Kubernetes code-to-cloud uses one exact workload identity

## Status

Accepted, implemented, and live-accepted through EKS on 2026-08-31. Automated connector and
correlation verification also passes for GKE and AKS identity shapes. See the
[live acceptance record](../product/kubernetes-code-to-cloud-live-acceptance-2026-08-31.md).

## Decision

Denali uses one provider-neutral Kubernetes workload contract above the cloud cluster
inventory. AWS, Google Cloud, and Azure continue to observe EKS, GKE, and AKS clusters
through their own control planes. A separate bounded Kubernetes snapshot observes workload
UID, revision, namespace, kind, name, service account, and image digests from the Kubernetes
API.

The importer accepts only a Kubernetes `List` containing at most 10,000 objects and 20 MiB.
It supports `Deployment`, `StatefulSet`, `DaemonSet`, `Job`, and `CronJob`. It does not read
Secret or ConfigMap objects. It examines environment-variable **names** for AI classification
but never retains environment values. Piping a snapshot over standard input avoids writing
the source API response to disk.

Every supported workload is retained as an observed `cloud_resource`. A workload becomes an
`ai_workload` only when it has `denali.ai/workload=true` or an allow-listed model, deployment,
or endpoint configuration key. AI workloads receive `HOSTED_ON` relationships to the exact
cloud cluster natural key and `RUNS_AS` relationships to their Kubernetes service account.
An unpinned runtime image remains visible, makes coverage partial, and supplies no digest
identifier.

## Exact identity contract

All Kubernetes deployment joins require exact values for:

- cloud provider and `kubernetes_workload` runtime kind;
- provider cluster boundary: AWS account and Region, GCP project and location, or Azure
  subscription, resource group, and location;
- cluster name;
- namespace, workload kind, and workload name;
- Kubernetes service account; and
- every source-declared `sha256` image digest.

Runtime UID and revision are always observed and retained. A source manifest may require
them with `denali.ai/workload-uid` and `denali.ai/workload-revision`; otherwise they remain
runtime evidence and do not manufacture a source claim.

The cloud cluster natural key is also validated against the declared provider scope:

| Provider | Cluster natural key                                                  |
| -------- | -------------------------------------------------------------------- |
| EKS      | Exact cluster ARN                                                    |
| GKE      | `//container.googleapis.com/projects/.../locations/.../clusters/...` |
| AKS      | Exact, normalized Azure managed-cluster resource ID                  |

## Source declaration contract

Kubernetes YAML is opt-in. The workload must set `denali.ai/workload: "true"`, supply a
literal cloud boundary, and use digest-pinned images. Dynamic, incomplete, or tag-only image
references produce a visible warning and no deployment edge.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: model-api
  namespace: ai-prod
  annotations:
    denali.ai/workload: 'true'
    denali.ai/provider: aws
    denali.ai/account-id: '123456789012'
    denali.ai/region: us-east-1
    denali.ai/cluster-name: model-cluster
spec:
  template:
    spec:
      serviceAccountName: model-runtime
      containers:
        - name: api
          image: registry.example/model@sha256:<64-hex-digest>
```

GCP uses exactly one of `denali.ai/project-id` or `denali.ai/project-number`, plus
`denali.ai/location`. Azure uses `denali.ai/subscription-id`,
`denali.ai/resource-group`, and `denali.ai/location`.

## Collection path

The recommended path keeps the snapshot off disk:

```bash
kubectl get deployments,statefulsets,daemonsets,jobs,cronjobs -A -o json |
  denali-kubernetes-import - \
    --provider aws \
    --account-id 123456789012 \
    --region us-east-1 \
    --cluster-name model-cluster \
    --cluster-natural-key arn:aws:eks:us-east-1:123456789012:cluster/model-cluster
```

The caller is responsible for selecting the intended Kubernetes context. Denali validates
the supplied cloud cluster boundary but does not acquire or persist a kubeconfig or cloud
credential.

## Consequences

- Similar names, labels, model IDs, mutable image tags, and cluster-name-only matches cannot
  create `DEPLOYED_BY` edges.
- Kubernetes API observation and cloud cluster observation remain independent evidence.
- Workload source revision remains unattested unless a separate artifact provenance source
  proves it.
- The shared workload contract has live EKS evidence. GKE and AKS workload identities retain
  automated contract coverage but have not each received a separate live workload fixture.
