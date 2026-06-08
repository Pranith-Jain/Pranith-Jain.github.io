import { useCallback, useEffect, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import type { CtiArc, CtiPoint } from './geo';
import { severityColor } from './geo';

/* ─── WebGL detection ───────────────────────────────────────────────────── */

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl') || canvas.getContext('webgl2') || canvas.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

/* ─── Props ────────────────────────────────────────────────────────────── */

interface CtiGlobeProps {
  arcs: CtiArc[];
  points: CtiPoint[];
  focus: { lat: number; lng: number } | null;
  onPointClick?: (point: CtiPoint) => void;
  onArcHover?: (arc: CtiArc | null) => void;
  /** When true, globe auto-rotates. Defaults to false (user controls). */
  autoRotate?: boolean;
}

/* ─── Globe wrapper ────────────────────────────────────────────────────── */

export default function CtiGlobe({
  arcs,
  points,
  focus,
  onPointClick,
  onArcHover,
  autoRotate = false,
}: CtiGlobeProps): JSX.Element {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globeRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 600 });
  const containerRef = useRef<HTMLDivElement>(null);
  const rotAngleRef = useRef(0);
  const rafRef = useRef(0);
  const userInteracting = useRef(false);
  const [webglError, setWebglError] = useState(false);

  // Check WebGL support on mount
  useEffect(() => {
    if (!hasWebGL()) {
      setWebglError(true);
    }
  }, []);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          w: Math.floor(entry.contentRect.width),
          h: Math.floor(entry.contentRect.height),
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Auto-rotation loop — only runs when autoRotate=true AND user isn't interacting
  useEffect(() => {
    if (!autoRotate) return;
    let lastTime = performance.now();
    const rotate = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      if (!userInteracting.current && globeRef.current) {
        rotAngleRef.current += delta * 5;
        const pov = globeRef.current.pointOfView();
        globeRef.current.pointOfView({ lat: pov.lat, lng: rotAngleRef.current % 360 }, 0);
      }
      rafRef.current = requestAnimationFrame(rotate);
    };
    rafRef.current = requestAnimationFrame(rotate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [autoRotate]);

  // Pause rotation on user interaction
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const down = () => {
      userInteracting.current = true;
    };
    const up = () => {
      setTimeout(() => {
        userInteracting.current = false;
      }, 2000);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('wheel', down);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('wheel', down);
    };
  }, []);

  // Focus on point change
  useEffect(() => {
    if (focus && globeRef.current) {
      userInteracting.current = true;
      globeRef.current.pointOfView({ lat: focus.lat, lng: focus.lng, altitude: 1.5 }, 1000);
      setTimeout(() => {
        userInteracting.current = false;
      }, 3000);
    }
  }, [focus]);

  // Accessor wrappers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arcColor = useCallback((arc: any) => (arc as CtiArc).color, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pointColor = useCallback((point: any) => severityColor((point as CtiPoint).severity), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pointAltitude = useCallback((point: any) => {
    const p = point as CtiPoint;
    const alts: Record<string, number> = { critical: 0.06, high: 0.04, medium: 0.03, low: 0.02, info: 0.015 };
    return alts[p.severity] ?? 0.02;
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pointRadius = useCallback((point: any) => {
    const p = point as CtiPoint;
    return Math.min(Math.max(Math.log2(p.count + 1) * 0.8, 0.3), 3);
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pointLabel = useCallback((point: any) => {
    const p = point as CtiPoint;
    return `<div style="background:rgba(0,0,0,0.85);color:#fff;padding:6px 10px;border-radius:6px;font-size:12px;font-family:monospace;max-width:250px;">
      <div style="font-weight:bold;margin-bottom:2px;">${p.label}</div>
      <div style="opacity:0.7;">Severity: ${p.severity} · Count: ${p.count}</div>
    </div>`;
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arcLabel = useCallback((arc: any) => {
    const a = arc as CtiArc;
    return `<div style="background:rgba(0,0,0,0.85);color:#fff;padding:6px 10px;border-radius:6px;font-size:12px;font-family:monospace;max-width:280px;">
      ${a.label}
    </div>`;
  }, []);

  // Event handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlePointClick = useCallback(
    (point: any) => {
      onPointClick?.(point as CtiPoint);
    },
    [onPointClick]
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleArcHover = useCallback(
    (arc: any) => {
      onArcHover?.(arc ? (arc as CtiArc) : null);
    },
    [onArcHover]
  );

  return (
    <div ref={containerRef} className="w-full h-full min-h-[400px]" style={{ position: 'relative' }}>
      {webglError ? (
        <div className="flex items-center justify-center h-full min-h-[400px] text-center p-6">
          <div>
            <div className="text-4xl mb-3">🌐</div>
            <p className="text-sm text-slate-400 mb-2">3D Globe requires WebGL support.</p>
            <p className="text-xs text-slate-500">
              Your browser may not support WebGL or it may be disabled. Try a different browser or enable hardware
              acceleration.
            </p>
          </div>
        </div>
      ) : (
        <Globe
          ref={globeRef}
          width={dimensions.w}
          height={dimensions.h}
          globeImageUrl="https://unpkg.com/three-globe/example/img/earth-night.jpg"
          bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
          backgroundColor="rgba(0,0,0,0)"
          atmosphereColor="#2c3ee5"
          atmosphereAltitude={0.15}
          arcsData={arcs}
          arcColor={arcColor}
          arcDashLength={0.4}
          arcDashGap={0.2}
          arcDashAnimateTime={2000}
          arcStroke={0.5}
          arcLabel={arcLabel}
          onArcHover={handleArcHover}
          pointsData={points}
          pointColor={pointColor}
          pointAltitude={pointAltitude}
          pointRadius={pointRadius}
          pointLabel={pointLabel}
          onPointClick={handlePointClick}
          pointsMerge={false}
          showAtmosphere={true}
          animateIn={true}
        />
      )}
    </div>
  );
}
