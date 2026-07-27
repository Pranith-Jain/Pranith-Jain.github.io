/**
 * World Intel — REST routes under /api/v1/world-intel/*.
 *
 * Live data feeds from free public APIs: cyber threats, earthquakes,
 * wildfires, internet outages, disease outbreaks, space weather,
 * GDELT news, maritime warnings, military flights, and strategic
 * infrastructure datasets.
 *
 * Mirrors world-intel-mcp (github.com/marc-shade/world-intel-mcp)
 * domain coverage, running natively in the Cloudflare Worker.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { internalError } from '../lib/api-error';
import {
  fetchCyberThreats,
  fetchEarthquakes,
  fetchWildfires,
  fetchInternetOutages,
  fetchDiseaseOutbreaks,
  fetchSpaceWeather,
  fetchGdeltSearch,
  fetchMaritimeWarnings,
  fetchMilitaryFlights,
  queryBases,
  queryPorts,
} from '../lib/world-intel';

export const worldIntelRouter = new Hono<{ Bindings: Env }>();

// ─── Cyber Threats ──────────────────────────────────────────────────────
worldIntelRouter.get('/world-intel/cyber', async (c) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 50)));
    const data = await fetchCyberThreats(limit);
    return c.json(data);
  } catch (e) {
    return internalError(c, `wi_cyber_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Earthquakes ────────────────────────────────────────────────────────
worldIntelRouter.get('/world-intel/earthquakes', async (c) => {
  try {
    const minMag = Number(c.req.query('min_mag') ?? 4.5);
    const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 50)));
    const data = await fetchEarthquakes(minMag, limit);
    return c.json(data);
  } catch (e) {
    return internalError(c, `wi_quakes_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Wildfires ──────────────────────────────────────────────────────────
worldIntelRouter.get('/world-intel/wildfires', async (c) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(c.req.query('limit') ?? 100)));
    const data = await fetchWildfires(limit);
    return c.json(data);
  } catch (e) {
    return internalError(c, `wi_wildfires_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Internet Outages ──────────────────────────────────────────────────
worldIntelRouter.get('/world-intel/outages', async (c) => {
  try {
    const data = await fetchInternetOutages();
    return c.json(data);
  } catch (e) {
    return internalError(c, `wi_outages_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Disease Outbreaks ─────────────────────────────────────────────────
worldIntelRouter.get('/world-intel/disease', async (c) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 30)));
    const data = await fetchDiseaseOutbreaks(limit);
    return c.json(data);
  } catch (e) {
    return internalError(c, `wi_disease_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Space Weather ──────────────────────────────────────────────────────
worldIntelRouter.get('/world-intel/space-weather', async (c) => {
  try {
    const data = await fetchSpaceWeather();
    return c.json(data);
  } catch (e) {
    return internalError(c, `wi_space_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── GDELT News Search ──────────────────────────────────────────────────
worldIntelRouter.get('/world-intel/news', async (c) => {
  try {
    const q = c.req.query('q');
    if (!q) return c.json({ error: 'missing q parameter' }, 400);
    const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 30)));
    const data = await fetchGdeltSearch(q, limit);
    return c.json(data);
  } catch (e) {
    return internalError(c, `wi_gdelt_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Maritime Warnings ──────────────────────────────────────────────────
worldIntelRouter.get('/world-intel/maritime', async (c) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 50)));
    const data = await fetchMaritimeWarnings(limit);
    return c.json(data);
  } catch (e) {
    return internalError(c, `wi_maritime_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Military Flights ───────────────────────────────────────────────────
worldIntelRouter.get('/world-intel/military-flights', async (c) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(c.req.query('limit') ?? 100)));
    const data = await fetchMilitaryFlights(limit);
    return c.json(data);
  } catch (e) {
    return internalError(c, `wi_mil_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Strategic Bases (static) ───────────────────────────────────────────
worldIntelRouter.get('/world-intel/bases', async (c) => {
  try {
    const operator = c.req.query('operator') ?? undefined;
    const country = c.req.query('country') ?? undefined;
    const type = c.req.query('type') ?? undefined;
    const bases = queryBases({ operator, country, type });
    return c.json({ bases, count: bases.length, source: 'static-geospatial', timestamp: new Date().toISOString() });
  } catch (e) {
    return internalError(c, `wi_bases_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Strategic Ports (static) ───────────────────────────────────────────
worldIntelRouter.get('/world-intel/ports', async (c) => {
  try {
    const type = c.req.query('type') ?? undefined;
    const ports = queryPorts({ type });
    return c.json({ ports, count: ports.length, source: 'static-geospatial', timestamp: new Date().toISOString() });
  } catch (e) {
    return internalError(c, `wi_ports_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Dashboard — all-in-one summary ────────────────────────────────────
worldIntelRouter.get('/world-intel/dashboard', async (c) => {
  try {
    const [cyber, quakes, outages, space, milFlights] = await Promise.all([
      fetchCyberThreats(10),
      fetchEarthquakes(4.0, 10),
      fetchInternetOutages(),
      fetchSpaceWeather(),
      fetchMilitaryFlights(20),
    ]);
    return c.json({
      cyber, earthquakes: quakes, outages, spaceWeather: space, militaryFlights: milFlights,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return internalError(c, `wi_dashboard_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
