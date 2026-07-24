/**
 * Quick test of the ensemble QA module — run against a sample report.
 * Usage: npx tsx scripts/test-ensemble-qa.ts
 */

const GROQ_KEY = process.env.GROQ_API_KEY;
const GOOGLE_KEY = process.env.GOOGLE_AI_STUDIO_API_KEY;

if (!GROQ_KEY && !GOOGLE_KEY) {
  console.error('Need at least one LLM key: GROQ_API_KEY or GOOGLE_AI_STUDIO_API_KEY');
  process.exit(1);
}

const SAMPLE_REPORT = `# Threat Intelligence Report: Lazarus Group

## Executive Summary
Lazarus Group (APT38) is a North Korean state-sponsored threat actor responsible for the 2017 WannaCry ransomware attack and numerous cryptocurrency theft operations. Recent activity includes targeting of cryptocurrency exchanges and DeFi protocols.

## Key Findings
- **CVE-2023-44487**: HTTP/2 Rapid Reset DDoS vulnerability (CVSS 7.5)
- **MITRE ATT&CK**: T1566.001 (Spearphishing Attachment), T1059.001 (PowerShell)
- **IOCs**: 185.220.101.34 (C2 server), evil-domain.example.com (phishing)

## Risk Assessment
**Severity**: High | **Confidence**: Medium | **TLP**: AMBER`;

const SAMPLE_DATA = `[enrich_actor] {"name":"Lazarus Group","aliases":["Hidden Cobra","Zinc"],"country":"North Korea","mitre_techniques":["T1566.001","T1059.001","T1071.001"]}
[check_ioc] {"indicator":"185.220.101.34","verdict":"malicious","score":95,"providers":[{"source":"abuseipdb","verdict":"malicious"}]}
[lookup_cve] {"cve_id":"CVE-2023-44487","severity":"HIGH","cvss":7.5}`;

async function testEnsembleQa() {
  console.log('=== Ensemble QA Test ===\n');
  console.log('Sample report length:', SAMPLE_REPORT.length, 'chars');
  console.log('Sample data length:', SAMPLE_DATA.length, 'chars');
  console.log('');

  // Simulate what ensemble-qa.ts does
  const models: Array<{ provider: string; label: string; key?: string }> = [
    { provider: 'gemini', label: 'gemini', key: GOOGLE_KEY },
    { provider: 'groq', label: 'groq', key: GROQ_KEY },
  ].filter((m) => m.key);

  console.log(`Running QA on ${models.length} model(s)...`);

  const results = await Promise.allSettled(
    models.map(async (m) => {
      const system = `You are a CTI report QA analyst. Verify claims against data. Score 0-100. Respond with JSON: {"flagged_claims":[],"missing_facts":[],"corrections":[],"quality_score":85,"quality_notes":""}`;

      const reportTag = 'report_to_verify';
      const dataTag = 'collected_data';
      const user =
        '<' +
        reportTag +
        '>\n' +
        SAMPLE_REPORT +
        '\n</' +
        reportTag +
        '>\n\n<' +
        dataTag +
        '>\n' +
        SAMPLE_DATA +
        '\n</' +
        dataTag +
        '>\n\nVerify every claim. Flag hallucinations, add missing facts, correct errors.';

      const model = m.provider === 'gemini' ? 'gemini-2.0-flash' : 'openai/gpt-oss-120b';
      const url =
        m.provider === 'gemini'
          ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${m.key}`
          : 'https://api.groq.com/openai/v1/chat/completions';

      const body =
        m.provider === 'gemini'
          ? {
              contents: [{ role: 'user', parts: [{ text: `${system}\n\n${user}` }] }],
              generationConfig: { maxOutputTokens: 4000, temperature: 0.1 },
            }
          : {
              model,
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
              ],
              max_tokens: 4000,
              temperature: 0.1,
            };

      const start = Date.now();
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(m.provider === 'groq' ? { authorization: `Bearer ${m.key}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
      const elapsed = Date.now() - start;

      if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`${m.label}: HTTP ${res.status} ${err.slice(0, 100)}`);
      }

      const json = (await res.json()) as Record<string, unknown>;
      let text = '';
      if (m.provider === 'gemini') {
        const c = (json as Record<string, unknown>).candidates as Array<Record<string, unknown>> | undefined;
        const parts = (c?.[0] as Record<string, unknown>)?.content as Record<string, unknown> | undefined;
        const partArr = parts?.parts as Array<Record<string, unknown>> | undefined;
        text = ((partArr?.[0] as Record<string, unknown>)?.text as string) ?? '';
      } else {
        const c = (json as Record<string, unknown>).choices as Array<Record<string, unknown>> | undefined;
        const msg = (c?.[0] as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
        text = (msg?.content as string) ?? '';
      }

      // Parse JSON from response
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error(`${m.label}: no JSON in response`);
      const parsed = JSON.parse(match[0]);

      return {
        model: `${m.label}:${model}`,
        elapsed,
        qualityScore: parsed.quality_score ?? 0,
        flaggedCount: (parsed.flagged_claims ?? []).length,
        missingCount: (parsed.missing_facts ?? []).length,
        correctionsCount: (parsed.corrections ?? []).length,
        notes: parsed.quality_notes ?? '',
      };
    })
  );

  console.log('\n=== Results ===\n');

  const successful = results
    .filter((r): r is PromiseFulfilledResult<NonNullable<Awaited<(typeof results)[0]>>> => r.status === 'fulfilled')
    .map((r) => r.value);

  const failed = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => r.reason?.message ?? String(r.reason));

  for (const r of successful) {
    console.log(`✅ ${r.model} (${r.elapsed}ms)`);
    console.log(`   Quality Score: ${r.qualityScore}/100`);
    console.log(`   Flagged Claims: ${r.flaggedCount}`);
    console.log(`   Missing Facts: ${r.missingCount}`);
    console.log(`   Corrections: ${r.correctionsCount}`);
    console.log(`   Notes: ${r.notes}`);
    console.log('');
  }

  for (const f of failed) {
    console.log(`❌ Failed: ${f}`);
  }

  if (successful.length > 1) {
    const scores = successful.map((r) => r.qualityScore);
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const consensus = scores.filter((s) => Math.abs(s - avg) <= 10).length;
    console.log(`\n=== Ensemble Consensus ===`);
    console.log(`Average Score: ${avg}/100`);
    console.log(`Consensus Strength: ${consensus}/${successful.length} models agree`);
  }
}

testEnsembleQa().catch(console.error);
