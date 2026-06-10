# Detection Rule Quality

**Category:** Detection Engineering / manual

## Loop Description

Author or refine detection content (YARA / Sigma / hunting queries) until it validates,
matches the known-malicious samples it targets, and does NOT fire on benign samples. A
DFIR-toolkit detection isn't done because it parses — it's done when it catches what it
should and stays quiet on what it shouldn't.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT loosen a rule to "catch everything" — a rule that matches benign samples is a
  false-positive generator, which is worse than no rule.
- Do NOT tighten a rule down to a single hardcoded hash/IP to force a pass — it must
  generalize to the family/technique it claims to detect.
- Validate syntax AND behavior: a rule that compiles but matches nothing (or everything)
  has failed the loop.
- Anchor on real artifacts — include the malware family name and known strings/IOCs from
  collected data, not invented ones.

## Kickoff Prompt

```
Start the "Detection Rule Quality" loop.

Goal: The detection rule validates, matches true positives, and stays quiet on benign samples
Max iterations: 8
Between iterations run: validate the rule (syntax) + run it against the true-positive and benign sample sets
Exit when: syntax valid, all true positives matched, zero benign matches

Step 1: Write/refine the rule from the collected artifacts (family name, strings, IOCs).
Validate syntax, run it against the malicious and benign sample sets, and tune to close
false negatives and false positives.

Self-pace this loop. After each iteration, validate + run both sample sets, and only
continue while any true positive is missed or any benign sample matches. Stop when clean
or max iterations is reached. Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Draft from artifacts** — base the rule on real family strings/IOCs from collected data.
2. **Validate syntax** — run it through the detection-engine validator; fix parse/compile errors.
3. **True positives** — confirm it matches the samples it targets (no false negatives).
4. **Benign set** — confirm it does NOT match benign samples (no false positives); tune and repeat.
