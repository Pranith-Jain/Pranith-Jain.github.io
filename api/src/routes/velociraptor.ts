/**
 * Velociraptor connector REST surface.
 *
 * GET  /velociraptor/status                 — config state + capability list
 * POST /velociraptor/clients                { search?, limit? }
 * POST /velociraptor/client                 { client_id }
 * POST /velociraptor/flows                  { client_id, limit? }
 * POST /velociraptor/collect                { client_id, artifacts[], parameters?, urgent?, timeout? }
 * POST /velociraptor/flow                   { client_id, flow_id }
 * POST /velociraptor/results                { client_id, flow_id, artifact?, offset?, rows? }
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, internalError, serviceUnavailable } from '../lib/api-error';
import {
  veloListClients,
  veloGetClient,
  veloListFlows,
  veloCollectArtifact,
  veloGetFlowStatus,
  veloGetFlowResults,
  veloCreateHunt,
  veloGetHunt,
  veloListHunts,
} from '../lib/velociraptor';

export const velociraptorRouter = new Hono<{ Bindings: Env }>();

type VeloEnv = Pick<Env, 'VELO_API_URL' | 'VELO_API_TOKEN' | 'VELO_USERNAME' | 'VELO_PASSWORD'>;

function envOf(c: { env: VeloEnv }): VeloEnv {
  return {
    VELO_API_URL: c.env.VELO_API_URL,
    VELO_API_TOKEN: c.env.VELO_API_TOKEN,
    VELO_USERNAME: c.env.VELO_USERNAME,
    VELO_PASSWORD: c.env.VELO_PASSWORD,
  };
}

async function jsonBody(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown>> {
  try {
    const b = (await c.req.json()) as unknown;
    return typeof b === 'object' && b !== null ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

velociraptorRouter.get('/velociraptor/status', (c) => {
  const configured = Boolean(c.env.VELO_API_URL);
  if (!configured) {
    return serviceUnavailable(
      c,
      'velociraptor not configured — set VELO_API_URL (+ VELO_API_TOKEN or VELO_USERNAME/VELO_PASSWORD)'
    );
  }
  const authMode = c.env.VELO_API_TOKEN ? 'bearer' : c.env.VELO_USERNAME ? 'basic' : 'none';
  return c.json({
    configured: true,
    authMode,
    capabilities: [
      'list_clients',
      'get_client',
      'list_flows',
      'collect_artifact',
      'flow_status',
      'flow_results',
      'create_hunt',
      'get_hunt',
      'list_hunts',
    ],
  });
});

velociraptorRouter.post('/velociraptor/clients', async (c) => {
  try {
    const body = await jsonBody(c);
    const r = await veloListClients(envOf(c), {
      search: typeof body.search === 'string' ? body.search : undefined,
      limit: typeof body.limit === 'number' ? body.limit : undefined,
      self: c.env.SELF,
    });
    if (!r.ok) return internalError(c, `velo_failed: ${r.error}`);
    return c.json(r.data);
  } catch (e) {
    logError('velo clients failed', e);
    return internalError(c, `velo_clients_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

velociraptorRouter.post('/velociraptor/client', async (c) => {
  try {
    const body = await jsonBody(c);
    const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : '';
    if (!clientId) return badRequest(c, 'client_id required');
    const r = await veloGetClient(envOf(c), clientId, { self: c.env.SELF });
    if (!r.ok) return internalError(c, `velo_failed: ${r.error}`);
    return c.json(r.data);
  } catch (e) {
    logError('velo client failed', e);
    return internalError(c, `velo_client_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

velociraptorRouter.post('/velociraptor/flows', async (c) => {
  try {
    const body = await jsonBody(c);
    const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : '';
    if (!clientId) return badRequest(c, 'client_id required');
    const r = await veloListFlows(envOf(c), clientId, {
      limit: typeof body.limit === 'number' ? body.limit : undefined,
      self: c.env.SELF,
    });
    if (!r.ok) return internalError(c, `velo_failed: ${r.error}`);
    return c.json(r.data);
  } catch (e) {
    logError('velo flows failed', e);
    return internalError(c, `velo_flows_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

velociraptorRouter.post('/velociraptor/collect', async (c) => {
  try {
    const body = await jsonBody(c);
    const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : '';
    const artifacts = Array.isArray(body.artifacts) ? body.artifacts.map(String).filter(Boolean) : [];
    if (!clientId || artifacts.length === 0) return badRequest(c, 'client_id and non-empty artifacts[] required');
    if (artifacts.length > 10) return badRequest(c, 'max 10 artifacts per collection');
    const parameters =
      typeof body.parameters === 'object' && body.parameters !== null && !Array.isArray(body.parameters)
        ? Object.fromEntries(
            Object.entries(body.parameters as Record<string, unknown>)
              .slice(0, 50)
              .map(([k, v]) => [k.slice(0, 200), String(v).slice(0, 4000)])
          )
        : undefined;
    const r = await veloCollectArtifact(
      envOf(c),
      {
        client_id: clientId,
        artifacts,
        ...(parameters ? { parameters } : {}),
        urgent: body.urgent === true,
        timeout: typeof body.timeout === 'number' ? Math.min(body.timeout, 3600) : undefined,
      },
      { self: c.env.SELF }
    );
    if (!r.ok) return internalError(c, `velo_failed: ${r.error}`);
    return c.json(r.data);
  } catch (e) {
    logError('velo collect failed', e);
    return internalError(c, `velo_collect_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

velociraptorRouter.post('/velociraptor/flow', async (c) => {
  try {
    const body = await jsonBody(c);
    const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : '';
    const flowId = typeof body.flow_id === 'string' ? body.flow_id.trim() : '';
    if (!clientId || !flowId) return badRequest(c, 'client_id and flow_id required');
    const r = await veloGetFlowStatus(envOf(c), clientId, flowId, { self: c.env.SELF });
    if (!r.ok) return internalError(c, `velo_failed: ${r.error}`);
    return c.json(r.data);
  } catch (e) {
    logError('velo flow failed', e);
    return internalError(c, `velo_flow_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

velociraptorRouter.post('/velociraptor/results', async (c) => {
  try {
    const body = await jsonBody(c);
    const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : '';
    const flowId = typeof body.flow_id === 'string' ? body.flow_id.trim() : '';
    if (!clientId || !flowId) return badRequest(c, 'client_id and flow_id required');
    const r = await veloGetFlowResults(envOf(c), clientId, flowId, {
      artifact: typeof body.artifact === 'string' ? body.artifact : undefined,
      offset: typeof body.offset === 'number' ? body.offset : undefined,
      rows: typeof body.rows === 'number' ? body.rows : undefined,
      self: c.env.SELF,
    });
    if (!r.ok) return internalError(c, `velo_failed: ${r.error}`);
    return c.json(r.data);
  } catch (e) {
    logError('velo results failed', e);
    return internalError(c, `velo_results_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

velociraptorRouter.post('/velociraptor/hunts/create', async (c) => {
  try {
    const body = await jsonBody(c);
    const artifacts = Array.isArray(body.artifacts) ? body.artifacts.map(String).filter(Boolean) : [];
    if (artifacts.length === 0) return badRequest(c, 'artifacts[] required');
    if (artifacts.length > 10) return badRequest(c, 'max 10 artifacts per hunt');
    const parameters =
      typeof body.parameters === 'object' && body.parameters !== null && !Array.isArray(body.parameters)
        ? Object.fromEntries(
            Object.entries(body.parameters as Record<string, unknown>)
              .slice(0, 50)
              .map(([k, v]) => [k.slice(0, 200), String(v).slice(0, 4000)])
          )
        : undefined;
    const r = await veloCreateHunt(
      envOf(c),
      {
        artifacts,
        ...(parameters ? { parameters } : {}),
        labelText: typeof body.label === 'string' ? body.label.slice(0, 100) : undefined,
        expireHours: typeof body.expire_hours === 'number' ? Math.min(body.expire_hours, 720) : undefined,
      },
      { self: c.env.SELF }
    );
    if (!r.ok) return internalError(c, `velo_failed: ${r.error}`);
    return c.json(r.data);
  } catch (e) {
    logError('velo hunt create failed', e);
    return internalError(c, `velo_hunt_create_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

velociraptorRouter.post('/velociraptor/hunt', async (c) => {
  try {
    const body = await jsonBody(c);
    const huntId = typeof body.hunt_id === 'string' ? body.hunt_id.trim() : '';
    if (!huntId) return badRequest(c, 'hunt_id required');
    const r = await veloGetHunt(envOf(c), huntId, { self: c.env.SELF });
    if (!r.ok) return internalError(c, `velo_failed: ${r.error}`);
    return c.json(r.data);
  } catch (e) {
    logError('velo hunt get failed', e);
    return internalError(c, `velo_hunt_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

velociraptorRouter.post('/velociraptor/hunts', async (c) => {
  try {
    const body = await jsonBody(c);
    const r = await veloListHunts(envOf(c), {
      limit: typeof body.limit === 'number' ? body.limit : undefined,
      self: c.env.SELF,
    });
    if (!r.ok) return internalError(c, `velo_failed: ${r.error}`);
    return c.json(r.data);
  } catch (e) {
    logError('velo hunts list failed', e);
    return internalError(c, `velo_hunts_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
