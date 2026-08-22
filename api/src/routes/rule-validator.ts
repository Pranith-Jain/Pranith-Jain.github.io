/**
 * Detection-rule validator + Sigma converter REST surface.
 *
 * POST /rules/validate        { kind: 'yara'|'sigma'|'suricata'|'snort'|'osquery', source }
 * POST /rules/sigma/convert   { target: 'splunk'|'kql', yaml, fieldNameMap? }
 * GET  /rules/validate/meta   capability descriptor
 */
import { Hono } from 'hono'
import type { Env } from '../env'
import { logError } from '../lib/logger'
import { badRequest, internalError, notFound } from '../lib/api-error'
import { validateRule, convertSigmaToSplunk, convertSigmaToKql } from '../lib/rule-toolkit'
import type { RuleKind } from '../lib/rule-toolkit'
import { RECIPES, getRecipeDetail } from '../lib/agent/recipes'

export const ruleValidatorRouter = new Hono<{ Bindings: Env }>()

const KINDS: RuleKind[] = ['yara', 'sigma', 'suricata', 'snort', 'osquery']

ruleValidatorRouter.get('/tools/recipes/:id', (c) => {
  const recipe = getRecipeDetail(c.req.param('id') ?? '')
  if (!recipe) return notFound(c, `unknown recipe: ${c.req.param('id')}`)
  return c.json({ ok: true, ...recipe })
})

ruleValidatorRouter.get('/tools/recipes', (c) => {
  return c.json({ recipes: RECIPES.map(({ id, name, trigger }) => ({ id, name, trigger })) })
})

ruleValidatorRouter.get('/rules/validate/meta', (c) => {
  return c.json({
    kinds: KINDS,
    targets: ['splunk', 'kql'],
    capabilities: {
      yara: 'structural lint: braces, sections, string refs, hex tokens, dup names',
      sigma: 'YAML schema + logsource + detection + condition identifier checks',
      suricata: 'header grammar + required opts (msg/sid/rev) + local sid range warn',
      osquery: 'read-only guard + paren balance + known-table check + multi-stmt reject',
      sigma_convert: 'Sigma → Splunk SPL / Sentinel KQL (field ops, wildcards, N-of expansions)',
    },
  })
})

ruleValidatorRouter.post('/rules/validate', async (c) => {
  try {
    const body = await c.req.json<{ kind?: string; source?: string }>().catch(() => ({} as Record<string, unknown>))
    const kind = String(body.kind ?? '').toLowerCase() as RuleKind
    const source = body.source != null ? String(body.source) : ''
    if (!KINDS.includes(kind)) return badRequest(c, `kind must be one of: ${KINDS.join(', ')}`)
    if (!source) return badRequest(c, 'source is required')
    if (source.length > 200_000) return badRequest(c, 'source too large (max 200k chars)')
    const result = validateRule(kind, source)
    return c.json({ kind, ...result })
  } catch (e) {
    logError('rule validate failed', e)
    return internalError(c, `validate_failed: ${e instanceof Error ? e.message : String(e)}`)
  }
})

ruleValidatorRouter.post('/rules/sigma/convert', async (c) => {
  try {
    const body = await c.req.json<{ target?: string; yaml?: string; fieldNameMap?: Record<string, string> }>().catch(() => ({} as Record<string, unknown>))
    const target = String(body.target ?? '').toLowerCase()
    const yaml = body.yaml != null ? String(body.yaml) : ''
    const fieldNameMap = body.fieldNameMap as Record<string, string> | undefined
    if (target !== 'splunk' && target !== 'kql') return badRequest(c, 'target must be splunk or kql')
    if (!yaml) return badRequest(c, 'yaml is required')
    if (yaml.length > 200_000) return badRequest(c, 'yaml too large (max 200k chars)')
    if (fieldNameMap !== undefined && (typeof fieldNameMap !== 'object' || Array.isArray(fieldNameMap))) {
      return badRequest(c, 'fieldNameMap must be an object when provided')
    }
    const result = target === 'splunk' ? convertSigmaToSplunk(yaml, fieldNameMap) : convertSigmaToKql(yaml, fieldNameMap)
    if (!result.ok) return badRequest(c, result.error ?? 'conversion failed')
    return c.json(result)
  } catch (e) {
    logError('sigma convert failed', e)
    return internalError(c, `convert_failed: ${e instanceof Error ? e.message : String(e)}`)
  }
})
