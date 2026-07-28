/**
 * Real world map loader for the ARGUS globe.
 *
 * The globe renders accurate country borders from the world-atlas Natural
 * Earth 110m TopoJSON already served at /world-110m.json (the same asset the
 * react-simple-maps pages use, so it is warm in the browser cache). Borders
 * are decoded with topojson-client; actor home-nations are highlighted in
 * their attribution colour. Falls back to the bundled simplified outlines if
 * the fetch fails (offline / blocked).
 */
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
import type { Topology, GeometryCollection } from 'topojson-specification';

/** Rings per country: each ring is an array of [lng, lat]. */
export interface WorldCountry {
  /** ISO 3166-1 numeric id (as a string), e.g. "643" for Russia. */
  id: string;
  name: string;
  rings: number[][][];
}

/** ISO 3166-1 alpha-2 → numeric, for every nation in the attribution palette. */
export const ALPHA2_TO_NUMERIC: Record<string, string> = {
  RU: '643',
  CN: '156',
  KP: '408',
  IR: '364',
  IN: '356',
  PK: '586',
  IL: '376',
  TR: '792',
  SA: '682',
  AE: '784',
  EG: '818',
  SY: '760',
  LB: '422',
  YE: '887',
  VN: '704',
  MM: '104',
  UZ: '860',
  BY: '112',
  KZ: '398',
  GB: '826',
  US: '840',
  KR: '410',
};

function geometryToRings(geom: Geometry): number[][][] {
  const rings: number[][][] = [];
  if (geom.type === 'Polygon') {
    for (const ring of geom.coordinates) rings.push(ring as number[][]);
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      for (const ring of poly) rings.push(ring as number[][]);
    }
  }
  return rings;
}

/**
 * Fetch and decode the world countries. Resolves `null` on any failure so the
 * caller can fall back to the bundled simplified outlines.
 */
export async function loadWorldCountries(): Promise<WorldCountry[] | null> {
  try {
    const res = await fetch('/world-110m.json');
    if (!res.ok) return null;
    const topo = (await res.json()) as Topology<{ countries: GeometryCollection }>;
    const fc = feature(topo, topo.objects.countries) as unknown as FeatureCollection;
    const out: WorldCountry[] = [];
    for (const f of fc.features) {
      if (!f.geometry) continue;
      const rings = geometryToRings(f.geometry);
      if (rings.length === 0) continue;
      out.push({
        id: String(f.id ?? ''),
        name: (f.properties as { name?: string } | undefined)?.name ?? '',
        rings,
      });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}
