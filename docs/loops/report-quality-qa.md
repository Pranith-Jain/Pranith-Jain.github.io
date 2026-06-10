# Report Quality QA

**Category:** Quality / manual

## Loop Description

Drive the investigator's report QA up to standard: run the QA verifier against a generated
CTI report, and reduce hallucinated/unsupported claims and missing facts until the quality
score clears your threshold. This is the guard against analyst-grade reports that read well
but aren't grounded in the collected data.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT raise the score by deleting hard content — the report must stay complete AND
  grounded; trimming everything to avoid flagged claims is gaming the metric.
- Do NOT add facts the collected data doesn't support to fill "missing facts" — every
  claim must trace to a source in the run.
- Do NOT lower the quality threshold to pass the loop.
- Fix the generation/grounding, not just the one report — a recurring hallucination
  pattern means the synthesizer or its prompt needs the fix.

## Kickoff Prompt

```
Start the "Report Quality QA" loop.

Goal: Generated CTI reports clear the quality threshold with no unsupported claims
Max iterations: 8
Between iterations run: run the QA verifier on a fresh report (qualityScore, flaggedClaims, missingFacts)
Exit when: qualityScore >= threshold AND flaggedClaims is empty AND key facts are present and sourced

Step 1: Generate a report for a representative query, run the QA verifier, and address the
flagged (unsupported) claims and missing facts at their source — the synthesizer logic or
prompt — then re-run.

Self-pace this loop. After each iteration, run QA, read the score + flags, and only
continue while the score is below threshold or claims are flagged. Stop when it clears or
max iterations is reached. Give a short status update each pass.
```

## Steps (Agent Actions)

1. **Generate + verify** — run an investigation and the QA verifier; capture `qualityScore`, `flaggedClaims`, `missingFacts`.
2. **Trace flags** — for each flagged claim, find why it isn't grounded in the collected data.
3. **Fix at the source** — adjust the synthesizer/grounding so claims trace to sources; never invent facts.
4. **Re-verify** — re-run QA; exit only when the score clears and no claim is flagged.
