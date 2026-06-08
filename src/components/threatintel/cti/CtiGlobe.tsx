/**
 * CtiGlobe - 3D interactive globe using globe.gl
 *
 * Re-engineered for World Monitor-style appearance:
 *  - globe.gl v2 with proper configuration
 *  - Earth textures: night + topology
 *  - Blue atmosphere glow
 *  - Points with altitude based on severity
 *  - Animated arcs with dash effect
 *  - Pulsing rings for critical points
 *  - Auto-rotate after inactivity
 */

import { useEffect, useRef, useState, useCallback, useMemo, type JSX } from 'react';
import Globe from 'globe.gl';
import type { CtiArc, CtiPoint } from './geo';
import { severityColor } from './geo';

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface RingDatum {
  lat: number;
  lng: number;
  size: number;
  color: string;
}

interface CtiGlobeProps {
  arcs: CtiArc[];
  points: CtiPoint[];
  focus: { lat: number; lng: number } | null;
  onPointClick?: (point: CtiPoint) => void;
  onArcHover?: (arc: CtiArc | null) => void;
  autoRotate?: boolean;
}

/* ─── Component ─────────────────────────────────────────────────────────── */

export default function CtiGlobe({
  arcs,
  points,
  focus,
  onPointClick,
  onArcHover,
  autoRotate = false,
}: CtiGlobeProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<ReturnType<typeof Globe> | null>(null);
  const rotAngleRef = useRef(0);
  const rafRef = useRef(0);
  const userInteracting = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ring data for critical/high severity points
  const ringData: RingDatum[] = useMemo(
    () =>
      points
        .filter((p) => p.severity === 'critical' || p.severity === 'high')
        .slice(0, 80)
        .map((p) => ({
          lat: p.lat,
          lng: p.lng,
          size: p.severity === 'critical' ? 3.5 : 2.5,
          color: severityColor(p.severity),
        })),
    [points]
  );

  // Initialize globe
  useEffect(() => {
    if (!containerRef.current) return;

    try {
      const globe = Globe()(containerRef.current)
        // Globe appearance
        .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
        .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
        .backgroundImageUrl('')
        .backgroundColor('rgba(0,0,0,0)')
        // Atmosphere
        .showAtmosphere(true)
        .atmosphereColor('#4f8fff')
        .atmosphereAltitude(0.2)
        // Points
        .pointsData(points)
        .pointLat((p: unknown) => (p as CtiPoint).lat)
        .pointLng((p: unknown) => (p as CtiPoint).lng)
        .pointColor((p: unknown) => severityColor((p as CtiPoint).severity))
        .pointAltitude((p: unknown) => {
          const alts: Record<string, number> = {
            critical: 0.12,
            high: 0.07,
            medium: 0.045,
            low: 0.03,
            info: 0.02,
          };
          return alts[(p as CtiPoint).severity] ?? 0.03;
        })
        .pointRadius((p: unknown) => {
          const sizes: Record<string, number> = {
            critical: 1.8,
            high: 1.3,
            medium: 0.8,
            low: 0.5,
            info: 0.35,
          };
          return sizes[(p as CtiPoint).severity] ?? 0.6;
        })
        .pointLabel((p: unknown) => {
          const point = p as CtiPoint;
          const sevColor = severityColor(point.severity);
          return `
            <div style="
              background: rgba(10,15,26,0.95);
              color: #e2e8f0;
              padding: 12px 16px;
              border-radius: 10px;
              font-size: 12px;
              font-family: 'SF Mono', 'Fira Code', monospace;
              max-width: 300px;
              border: 1px solid ${sevColor}50;
              box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            ">
              <div style="font-weight: 600; margin-bottom: 6px; color: #f8fafc; font-size: 13px;">${point.label}</div>
              <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
                <span style="
                  background: ${sevColor}25;
                  color: ${sevColor};
                  padding: 2px 8px;
                  border-radius: 4px;
                  font-size: 10px;
                  font-weight: 600;
                  text-transform: uppercase;
                ">${point.severity}</span>
                <span style="opacity: 0.6; font-size: 11px;">Count: ${point.count}</span>
              </div>
            </div>
          `;
        })
        .onPointClick((p: unknown) => {
          onPointClick?.(p as CtiPoint);
        })
        // Rings
        .ringsData(ringData)
        .ringLat((r: unknown) => (r as RingDatum).lat)
        .ringLng((r: unknown) => (r as RingDatum).lng)
        .ringColor((r: unknown) => (r as RingDatum).color)
        .ringMaxRadius((r: unknown) => (r as RingDatum).size)
        .ringAltitude(0.005)
        .ringRepeatPeriod(1800)
        // Arcs
        .arcsData(arcs)
        .arcColor((a: unknown) => (a as CtiArc).color)
        .arcDashLength(0.6)
        .arcDashGap(0.05)
        .arcDashAnimateTime(2500)
        .arcStroke(0.4)
        .arcLabel((a: unknown) => {
          const arc = a as CtiArc;
          return `
            <div style="
              background: rgba(10,15,26,0.95);
              color: #e2e8f0;
              padding: 10px 14px;
              border-radius: 8px;
              font-size: 11px;
              font-family: 'SF Mono', 'Fira Code', monospace;
              max-width: 280px;
              border: 1px solid ${arc.color}40;
              box-shadow: 0 4px 16px rgba(0,0,0,0.4);
            ">
              ${arc.label}
            </div>
          `;
        })
        .onArcHover((a: unknown) => {
          onArcHover?.(a ? (a as CtiArc) : null);
        })
        // Animation
        .animateIn(true);

      // Set initial POV
      globe.pointOfView({ lat: 20, lng: 0, altitude: 2.5 }, 0);

      globeRef.current = globe;
      setReady(true);

      // Handle resize
      const resizeObserver = new ResizeObserver(() => {
        if (containerRef.current && globeRef.current) {
          const w = containerRef.current.clientWidth;
          const h = containerRef.current.clientHeight;
          globeRef.current.width(w).height(h);
        }
      });
      resizeObserver.observe(containerRef.current);

      return () => {
        resizeObserver.disconnect();
        if (globeRef.current) {
          globeRef.current = null;
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize globe');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update data when it changes
  useEffect(() => {
    if (!globeRef.current) return;
    globeRef.current.pointsData(points);
  }, [points]);

  useEffect(() => {
    if (!globeRef.current) return;
    globeRef.current.ringsData(ringData);
  }, [ringData]);

  useEffect(() => {
    if (!globeRef.current) return;
    globeRef.current.arcsData(arcs);
  }, [arcs]);

  // Focus on point
  useEffect(() => {
    if (!focus || !globeRef.current) return;
    userInteracting.current = true;
    globeRef.current.pointOfView({ lat: focus.lat, lng: focus.lng, altitude: 1.5 }, 1200);
    setTimeout(() => {
      userInteracting.current = false;
    }, 4000);
  }, [focus]);

  // Auto-rotation
  useEffect(() => {
    if (!autoRotate || !globeRef.current) return;

    let lastTime = performance.now();
    const rotate = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      if (!userInteracting.current && globeRef.current) {
        rotAngleRef.current += delta * 2.5;
        const pov = globeRef.current.pointOfView();
        globeRef.current.pointOfView({ lat: pov.lat, lng: rotAngleRef.current % 360 }, 0);
      }
      rafRef.current = requestAnimationFrame(rotate);
    };
    rafRef.current = requestAnimationFrame(rotate);

    return () => cancelAnimationFrame(rafRef.current);
  }, [autoRotate]);

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-[#0a0f1a]">
        <div className="text-center p-6 max-w-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800/50 flex items-center justify-center">
            <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-300 mb-1">Globe Unavailable</p>
          <p className="text-xs text-slate-500 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-xs font-mono rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 transition-colors"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-[#0a0f1a]">
      {/* Globe container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Loading state */}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0f1a]">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-2 border-blue-500/20" />
              <div className="absolute inset-0 w-16 h-16 rounded-full border-2 border-transparent border-t-blue-500 animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-300">Initializing Globe</p>
              <p className="text-xs text-slate-500 mt-1">Loading 3D renderer…</p>
            </div>
          </div>
        </div>
      )}

      {/* Stats overlay */}
      {ready && (
        <div className="absolute bottom-4 left-4 bg-[#0f1629]/80 backdrop-blur-sm rounded-lg border border-slate-700/50 px-3 py-1.5 pointer-events-none">
          <span className="text-[10px] font-mono text-slate-400">
            {points.length} points · {arcs.length} arcs
          </span>
        </div>
      )}
    </div>
  );
}
