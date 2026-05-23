# `extract` — regex + dictionary CTI entity extractor

Synchronous, dependency-free CTI entity extractor. Pulls IoCs, CVEs, threat actors, malware families, and topic tags out of unstructured text (RSS bodies, briefings, dark-web posts). Currently lives at `api/src/lib/extract.ts`.

## What it does

```ts
extract(title: string, body: string): ExtractedEntities
```

Returns:

```ts
interface ExtractedEntities {
  iocs: ExtractedIoc[]; // ipv4 / ipv6 / domain / url / sha256 / md5 / ...
  actors: ExtractedActor[]; // matched against ACTOR_ALIASES (FIN7, APT28, ...)
  malware: ExtractedMalware[]; // matched against MALWARE_DICT (Lumma, RedLine, ...)
  cves: ExtractedCve[]; // CVE-YYYY-NNNN pattern
  tags: string[]; // topic tags from INTEL_KEYWORDS (ransomware, infostealer, ...)
  summary: string; // first ~280 chars of body
}
```

Granular per-type extractors are also exported (`extractIocs`, `extractCves`, `extractActors`, `extractMalware`, `extractTags`, `makeSummary`).

## Design choices

- **Synchronous.** No I/O. Trivial to run in any runtime — Workers, Node, browser. Per-invocation cost is microseconds.
- **Refanged.** Indicator values are run through `refang()` first so common defanging (`hxxp://`, `[.]`, `(dot)`, `[at]`) doesn't hide IoCs.
- **Boundary-aware.** Patterns use word-ish boundaries so "RedLine" the malware doesn't match "redlined the doc."
- **No de-duplication across calls.** Each call returns its own list; caller dedupes if needed.
- **No LLM.** If you want novel-entity extraction (actors / malware not in the dictionary), pair with `extract-llm.ts` and merge.

## Internal dependencies (extraction blockers)

| Internal import                         | Path                           | Extraction strategy                                                                                                  |
| --------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `detectType`, `refang`, `IndicatorType` | `./indicator`                  | Vendor — small (~150 LOC), no further deps.                                                                          |
| `ACTOR_ALIASES`                         | `../data/threat-actor-aliases` | Accept as constructor option. Library default = a small bootstrap dict; user supplies the full ~500-entry alias map. |
| `MALWARE_DICT`                          | `../data/malware-dict`         | Same pattern — option, optional.                                                                                     |
| `INTEL_KEYWORDS`                        | `../data/intel-keywords`       | Same pattern — option, optional.                                                                                     |

The dictionaries are the interesting product. They were hand-curated from MITRE ATT&CK Groups, MalwareBazaar tags, MISP galaxies, and 100+ vendor writeups. They could ship with the package as a permissive-licensed bootstrap set, with the option for users to extend / replace.

## Test coverage

`api/test/lib/extract.test.ts` carries the spec — defang round-trips, alias resolution, false-positive boundaries, summary truncation. Lift verbatim.

## What it deliberately does not do

- **No web fetching.** Caller passes text in.
- **No STIX serialization.** Pair with `stix-build.ts` for that.
- **No fuzzy / LLM matching.** Strict regex + dictionary. Recall caps at "what's in the dict + what regex catches"; precision is high.

## Suggested package name

`@pranithjain/cti-extract` or `cti-text-extract`. ~350 LOC + ~3 data files. MIT licence (dictionaries derived from open sources need attribution).
