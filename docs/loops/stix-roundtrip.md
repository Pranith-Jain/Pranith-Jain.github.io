# STIX Roundtrip

**Category:** Interop / manual

## Loop Description

Keep the DFIR toolkit's STIX interop honest: anything the platform exports as STIX must
re-import losslessly, and external bundles the platform ingests must parse without dropping
objects or relationships. Loop until a build → export → import → compare cycle round-trips
the IOCs, actors, techniques, and relationships intact.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT trim the test bundle to whatever currently round-trips — exercise the full object
  set (indicators, threat-actors, attack-patterns, relationships, sightings).
- Do NOT silently drop objects on import to make the compare pass; a dropped relationship
  is a data-loss bug, not a tidy result.
- Validate against the STIX shape, not just "JSON parsed" — malformed-but-parseable
  bundles still fail interop with real tools.
- Preserve IDs/refs across the roundtrip; broken `*_ref`s sever the graph.

## Kickoff Prompt

```
Start the "STIX Roundtrip" loop.

Goal: STIX export re-imports losslessly and external bundles parse without dropping objects
Max iterations: 6
Between iterations run: build a bundle -> export -> re-import -> diff objects/relationships; also import a real external bundle
Exit when: the roundtrip diff is empty (no dropped/altered objects, refs intact) for the full object set

Step 1: Build a bundle covering indicators/actors/techniques/relationships, export to
STIX, re-import, and diff. Fix any dropped/mangled object or broken ref. Repeat with a real
external bundle.

Self-pace this loop. After each iteration, run the roundtrip + diff, and only continue
while objects/relationships are lost or altered. Stop when lossless or max iterations is
reached. Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Build a full bundle** — indicators, threat-actors, attack-patterns, relationships, sightings.
2. **Export → import** — STIX export then re-import; preserve IDs/`*_ref`s.
3. **Diff** — compare objects + relationships in vs out; no drops/alterations.
4. **External bundle** — import a real third-party bundle; confirm nothing is silently lost.
