/**
 * Advanced Intel API — Consolidated routes for all 24 gap features.
 * SATs, Threat Modeling, Intel Requirements, Detection-as-Code,
 * Deception, Behavioral Analytics, Export, IOC Lifecycle, Confidence.
 */

import { Hono } from 'hono';
import type { Env } from '../env';
import { createAnalysis, getAnalysis, listAnalyses, updateAnalysis, calculateAchScores, SAT_SCHEMA } from '../lib/structured-analytic-techniques';
import { createThreatModel, getThreatModel, listThreatModels, updateThreatModel, THREAT_MODEL_SCHEMA } from '../lib/threat-modeling';
import { createRequirement, getRequirement, listRequirements, updateRequirement, analyzeGaps, INTEL_REQ_SCHEMA } from '../lib/intel-requirements';
import { createRule, getRule, listRules, updateRule, deployRule, generateCoverageReport, DETECTION_CODE_SCHEMA } from '../lib/detection-as-code';
import { createCanaryToken, listCanaryTokens, triggerCanaryAlert, listCanaryAlerts, acknowledgeAlert, DECEPTION_SCHEMA } from '../lib/deception-technology';
import { detectZScoreAnomalies, detectFrequencyAnomalies, detectHighEntropyStrings, buildBaseline } from '../lib/behavioral-analytics';
import { exportToStix21, exportToMisp, exportToSigma, exportToYara, exportToSnort, exportToSuricata, exportToCSV, exportToPfSense } from '../lib/export-formats';
import { upsertIOC, getIOC, getIOCByValue, listIOCs, submitFeedback, runAgingSweep, IOC_LIFECYCLE_SCHEMA } from '../lib/ioc-lifecycle-manager';
import { calculateConfidence, combineConfidenceAssessments, applyConfidenceDecay, calculateSourceReliability, getReliabilityScale, getCredibilityScale } from '../lib/confidence-scoring';

const advanced = new Hono<{ Bindings: Env }>();

/* ─── Schema Init ─────────────────────────────────────────────────────────── */
advanced.post('/api/v1/advanced/init', async (c) => {
  const allSchemas = [SAT_SCHEMA, THREAT_MODEL_SCHEMA, INTEL_REQ_SCHEMA, DETECTION_CODE_SCHEMA, DECEPTION_SCHEMA, IOC_LIFECYCLE_SCHEMA];
  for (const schema of allSchemas) {
    for (const sql of schema.split(';').filter((s) => s.trim())) {
      if (sql.trim()) await c.env.DB.prepare(sql).run();
    }
  }
  return c.json({ ok: true, schemas: 6 });
});

/* ─── SATs ────────────────────────────────────────────────────────────────── */
advanced.post('/api/v1/sat', async (c) => { const body = await c.req.json(); return c.json(await createAnalysis(c.env.DB, body), 201); });
advanced.get('/api/v1/sat', async (c) => c.json(await listAnalyses(c.env.DB, c.req.query('type') as any)));
advanced.get('/api/v1/sat/:id', async (c) => { const found = await getAnalysis(c.env.DB, c.req.param('id')); return found ? c.json(found) : c.json({ error: 'Not found' }, 404); });
advanced.patch('/api/v1/sat/:id', async (c) => { const updated = await updateAnalysis(c.env.DB, c.req.param('id'), await c.req.json()); return updated ? c.json(updated) : c.json({ error: 'Not found' }, 404); });
advanced.post('/api/v1/sat/ach/score', async (c) => { const { hypotheses, evidence } = await c.req.json(); return c.json(calculateAchScores(hypotheses, evidence)); });

/* ─── Threat Modeling ─────────────────────────────────────────────────────── */
advanced.post('/api/v1/threat-models', async (c) => { const body = await c.req.json(); return c.json(await createThreatModel(c.env.DB, body), 201); });
advanced.get('/api/v1/threat-models', async (c) => c.json(await listThreatModels(c.env.DB)));
advanced.get('/api/v1/threat-models/:id', async (c) => { const found = await getThreatModel(c.env.DB, c.req.param('id')); return found ? c.json(found) : c.json({ error: 'Not found' }, 404); });
advanced.patch('/api/v1/threat-models/:id', async (c) => { const updated = await updateThreatModel(c.env.DB, c.req.param('id'), await c.req.json()); return updated ? c.json(updated) : c.json({ error: 'Not found' }, 404); });

/* ─── Intel Requirements ──────────────────────────────────────────────────── */
advanced.post('/api/v1/intel-requirements', async (c) => { const body = await c.req.json(); return c.json(await createRequirement(c.env.DB, body), 201); });
advanced.get('/api/v1/intel-requirements', async (c) => c.json(await listRequirements(c.env.DB, { status: c.req.query('status') as any, priority: c.req.query('priority') as any })));
advanced.get('/api/v1/intel-requirements/:id', async (c) => { const found = await getRequirement(c.env.DB, c.req.param('id')); return found ? c.json(found) : c.json({ error: 'Not found' }, 404); });
advanced.patch('/api/v1/intel-requirements/:id', async (c) => { const updated = await updateRequirement(c.env.DB, c.req.param('id'), await c.req.json()); return updated ? c.json(updated) : c.json({ error: 'Not found' }, 404); });
advanced.get('/api/v1/intel-requirements/gaps', async (c) => { const reqs = await listRequirements(c.env.DB, { status: 'active' }); return c.json(analyzeGaps(reqs)); });

/* ─── Detection-as-Code ───────────────────────────────────────────────────── */
advanced.post('/api/v1/detection-rules', async (c) => { const body = await c.req.json(); return c.json(await createRule(c.env.DB, body), 201); });
advanced.get('/api/v1/detection-rules', async (c) => c.json(await listRules(c.env.DB, { format: c.req.query('format') as any, status: c.req.query('status') as any })));
advanced.get('/api/v1/detection-rules/:id', async (c) => { const found = await getRule(c.env.DB, c.req.param('id')); return found ? c.json(found) : c.json({ error: 'Not found' }, 404); });
advanced.patch('/api/v1/detection-rules/:id', async (c) => { const updated = await updateRule(c.env.DB, c.req.param('id'), await c.req.json()); return updated ? c.json(updated) : c.json({ error: 'Not found' }, 404); });
advanced.post('/api/v1/detection-rules/:id/deploy', async (c) => { const body = await c.req.json(); await deployRule(c.env.DB, c.req.param('id'), body.environment ?? 'production', body.deployed_by ?? 'analyst'); return c.json({ ok: true }); });
advanced.get('/api/v1/detection-rules/coverage/report', async (c) => c.json(await generateCoverageReport(c.env.DB)));

/* ─── Deception Technology ────────────────────────────────────────────────── */
advanced.post('/api/v1/canary-tokens', async (c) => { const body = await c.req.json(); return c.json(await createCanaryToken(c.env.DB, body), 201); });
advanced.get('/api/v1/canary-tokens', async (c) => c.json(await listCanaryTokens(c.env.DB)));
advanced.get('/api/v1/canary-alerts', async (c) => c.json(await listCanaryAlerts(c.env.DB)));
advanced.post('/api/v1/canary-alerts/:id/acknowledge', async (c) => { const body = await c.req.json(); await acknowledgeAlert(c.env.DB, c.req.param('id'), body.analyst ?? 'analyst'); return c.json({ ok: true }); });

/* ─── IOC Lifecycle ───────────────────────────────────────────────────────── */
advanced.post('/api/v1/ioc-lifecycle', async (c) => { const body = await c.req.json(); return c.json(await upsertIOC(c.env.DB, body), 201); });
advanced.get('/api/v1/ioc-lifecycle', async (c) => c.json(await listIOCs(c.env.DB, { status: c.req.query('status') as any, type: c.req.query('type') as any, minConfidence: Number(c.req.query('min_confidence') ?? 0) })));
advanced.get('/api/v1/ioc-lifecycle/:id', async (c) => { const found = await getIOC(c.env.DB, c.req.param('id')); return found ? c.json(found) : c.json({ error: 'Not found' }, 404); });
advanced.get('/api/v1/ioc-lifecycle/lookup/:value', async (c) => { const found = await getIOCByValue(c.env.DB, c.req.param('value')); return found ? c.json(found) : c.json({ error: 'Not found' }, 404); });
advanced.post('/api/v1/ioc-lifecycle/:id/feedback', async (c) => { const body = await c.req.json(); await submitFeedback(c.env.DB, c.req.param('id'), body.feedback_type, body.analyst ?? 'analyst', body.notes ?? ''); return c.json({ ok: true }); });
advanced.post('/api/v1/ioc-lifecycle/aging-sweep', async (c) => { const body = await c.req.json().catch(() => ({})); const expired = await runAgingSweep(c.env.DB, body.min_confidence ?? 10); return c.json({ expired }); });

/* ─── Behavioral Analytics ────────────────────────────────────────────────── */
advanced.post('/api/v1/analytics/zscore', async (c) => { const { points, metric, threshold } = await c.req.json(); return c.json(detectZScoreAnomalies(points, metric, threshold)); });
advanced.post('/api/v1/analytics/frequency', async (c) => { const { current, historical, threshold } = await c.req.json(); return c.json(detectFrequencyAnomalies(new Map(Object.entries(current)), new Map(Object.entries(historical).map(([k, v]) => [k, v as number[]])), threshold)); });
advanced.post('/api/v1/analytics/entropy', async (c) => { const { strings, threshold } = await c.req.json(); return c.json(detectHighEntropyStrings(strings, threshold)); });

/* ─── Export Formats ──────────────────────────────────────────────────────── */
advanced.post('/api/v1/export/stix', async (c) => { const body = await c.req.json(); return c.text(exportToStix21(body), 200, { 'content-type': 'application/json' }); });
advanced.post('/api/v1/export/misp', async (c) => { const body = await c.req.json(); return c.text(exportToMisp(body.iocs, body.event_name ?? 'IOC Export'), 200, { 'content-type': 'application/json' }); });
advanced.post('/api/v1/export/sigma', async (c) => { const body = await c.req.json(); return c.text(exportToSigma(body.name, body.description, body.iocs)); });
advanced.post('/api/v1/export/yara', async (c) => { const body = await c.req.json(); return c.text(exportToYara(body.name, body.description, body.hash_iocs ?? [], body.string_iocs ?? [])); });
advanced.post('/api/v1/export/snort', async (c) => { const body = await c.req.json(); return c.text(exportToSnort(body.name, body.ip_iocs ?? [])); });
advanced.post('/api/v1/export/suricata', async (c) => { const body = await c.req.json(); return c.text(exportToSuricata(body.name, body.ip_iocs ?? [])); });
advanced.post('/api/v1/export/csv', async (c) => { const body = await c.req.json(); return c.text(exportToCSV(body), 200, { 'content-type': 'text/csv' }); });
advanced.post('/api/v1/export/pfsense', async (c) => { const body = await c.req.json(); return c.text(exportToPfSense(body)); });

/* ─── Confidence Scoring ──────────────────────────────────────────────────── */
advanced.get('/api/v1/confidence/scales', (c) => c.json({ reliability: getReliabilityScale(), credibility: getCredibilityScale() }));
advanced.post('/api/v1/confidence/calculate', async (c) => { const { reliability, credibility } = await c.req.json(); return c.json(calculateConfidence(reliability, credibility)); });
advanced.post('/api/v1/confidence/combine', async (c) => { const { assessments } = await c.req.json(); return c.json({ score: combineConfidenceAssessments(assessments) }); });
advanced.post('/api/v1/confidence/decay', async (c) => { const { confidence, last_seen, half_life_days } = await c.req.json(); return c.json({ decayed: applyConfidenceDecay(confidence, last_seen, half_life_days) }); });

export default advanced;
