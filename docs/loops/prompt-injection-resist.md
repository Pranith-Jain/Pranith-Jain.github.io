# Prompt Injection Resist

**Category:** LLM Safety / manual

## Loop Description

Harden the AI features against prompt injection from untrusted intel. This platform feeds
attacker-controlled text into LLMs — `parse_threat_report` ingests arbitrary URLs/reports,
IOC enrichment pulls third-party data, and the synthesizer summarizes it all. Loop with
adversarial inputs until a malicious report can't hijack the agent's instructions, exfil
context, or poison the output.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT "fix" an injection by hardcoding a block for that one payload — address the class
  (untrusted text must be data, never instructions).
- Do NOT weaken extraction/enrichment to dodge an attack at the cost of real CTI value;
  the report must stay useful AND safe.
- Treat ALL ingested content as hostile: report bodies, IOC metadata, provider responses,
  filenames — not just the obvious URL field.
- A pass means a fresh adversarial battery finds no new hijack — not that you stopped
  trying payloads.

## Kickoff Prompt

```
Start the "Prompt Injection Resist" loop.

Goal: Untrusted intel cannot hijack the agent's instructions, exfil context, or poison output
Max iterations: 8
Between iterations run: feed an adversarial battery (instruction-override, data-exfil, tool-abuse, output-poisoning payloads) through parse_threat_report / enrichment / synthesis
Exit when: a fresh adversarial battery produces no successful hijack and reports stay grounded

Step 1: Run injection payloads through the untrusted-ingestion paths. For each that
succeeds, fix the class (data/instruction separation, output validation) — not the single
payload. Re-run the battery.

Self-pace this loop. After each iteration, run the battery, read the outcomes, and only
continue while any payload succeeds. Stop when clean or max iterations is reached. Give a
short status update each pass.
```

## Steps (Agent Actions)

1. **Build a battery** — instruction-override, context-exfil, tool-abuse, and output-poisoning payloads in report/IOC/provider fields.
2. **Run through ingestion** — `parse_threat_report`, enrichment, and synthesis.
3. **Fix the class** — enforce data/instruction separation and output validation; never patch a single payload.
4. **Re-test** — fresh battery; exit only when no payload hijacks the agent.
