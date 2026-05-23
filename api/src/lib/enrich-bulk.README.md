# `enrich-bulk` — multi-provider IoC enrichment

Batch IOC enrichment across configured CTI providers (VirusTotal, AbuseIPDB, Shodan, OTX, Hybrid Analysis, etc.). Concurrency-controlled, signal-aware, surfaces per-provider scores plus a composite verdict. Currently lives at `api/src/lib/enrich-bulk.ts`.

## What it does

```ts
enrichBulk(
  iocs: { type: IndicatorType; value: string }[],
  providers: ProviderAdapter[],
  env: ProviderEnv,
  opts?: { signal?: AbortSignal; concurrency?: number; perIocBudgetMs?: number }
): Promise<IocEnrichment[]>
```

For each IoC, fan out to every configured provider that supports that type, collect per-provider verdicts, and emit:

```ts
interface IocEnrichment {
  type: IndicatorType;
  value: string;
  composite: {
    score: number; // 0–100, weighted across providers that responded
    verdict: 'clean' | 'suspicious' | 'malicious' | 'unknown';
    tags: string[]; // union of provider tags, deduped
  };
  providers: ProviderScore[]; // per-provider raw results, including unsupported / not_configured / errored
}
```

## Provider contract

A provider is anything satisfying `ProviderAdapter`:

```ts
type ProviderAdapter = (
  indicator: { type: IndicatorType; value: string },
  env: ProviderEnv,
  signal: AbortSignal
) => Promise<ProviderResult>;
```

Each provider self-reports the indicator types it supports and gracefully returns `unsupported` (not applicable) or `error` (with message). Missing API keys return `unsupported` rather than firing the request and surfacing a 401 in the composite.

## What it handles for you

- **Concurrency control.** Bounded fan-out so a 200-IoC batch doesn't open 200 simultaneous sockets.
- **Per-IOC budget.** Slow providers are cut off so one stuck call doesn't stall the whole batch.
- **AbortSignal propagation.** Caller cancels → every in-flight request gets aborted.
- **Composite scoring.** Multi-provider score with a documented weighting so the composite verdict is reproducible.
- **Result shape preserved.** Every provider's raw response is returned alongside the composite — no information loss.

## Internal dependencies (extraction blockers)

| Internal import                                    | Path             | Extraction strategy                                                           |
| -------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------- |
| `IndicatorType`                                    | `./indicator`    | Type-only; inline the union.                                                  |
| Provider adapters (`virustotal`, `abuseipdb`, ...) | `../providers/*` | Each adapter is ~50–100 LOC and self-contained. Ship as separate sub-modules. |
| `ProviderEnv`                                      | type, ambient    | Just an object map of API keys. Define as a public interface.                 |

No Workers-specific dependencies. Runs anywhere that has `fetch` + `AbortController`.

## Test coverage

`api/test/lib/enrich-bulk.test.ts` covers concurrency limits, budget enforcement, abort propagation, composite scoring math, and provider-failure isolation.

## What it deliberately does not do

- **No de-duplication.** Caller passes a deduped list.
- **No persistence / caching.** Pair with KV or another store. The current Worker integration caches per-IoC results at the edge before calling `enrichBulk`.
- **No threat-actor / CVE enrichment.** Just IoCs. For CVE enrichment, use `cve-enrich.ts`.

## Suggested package name

`@pranithjain/ioc-enrich` or `cti-ioc-enrich`. ~340 LOC + per-provider modules. MIT licence.
