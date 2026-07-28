import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Waypoints } from 'lucide-react';
import type { Actor } from '../types';
import { COUNTRIES, NATION_PALETTE } from '../data/countries';
import { WORLD_GEOJSON, geoRingTo3D } from '../data/world-map';
import { loadWorldCountries, ALPHA2_TO_NUMERIC, type WorldCountry } from '../data/world-topo';

interface Props {
  actors: Actor[];
  onOpen: (a: Actor) => void;
}

function latLngToVec3(lat: number, lng: number, r: number, out: THREE.Vector3) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  out.set(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
  return out;
}

const COUNTRY_COORDS: Record<string, { lat: number; lng: number; name: string }> = {};
for (const c of COUNTRIES) {
  COUNTRY_COORDS[c.code] = { lat: c.lat, lng: c.lng, name: c.name };
}

export function GlobeView({ actors, onOpen }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<{ actor: Actor; x: number; y: number } | null>(null);
  const [showArcs, setShowArcs] = useState(true);
  const [worldReady, setWorldReady] = useState(false);

  const worldRef = useRef<WorldCountry[] | null>(null);

  const stateRef = useRef<{
    camera: THREE.PerspectiveCamera;
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    globeGroup: THREE.Group;
    raf: number;
    dragging: boolean;
    pickTargets: { mesh: THREE.Mesh; actor: Actor }[];
    alive: boolean;
    baseLand: THREE.Line[];
    mapHighlights: THREE.Line[];
    arcs: THREE.Line[];
    markerMeshes: THREE.Object3D[];
  } | null>(null);

  // Scene setup — runs once
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const w = mount.clientWidth || 800;
    const h = mount.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    camera.position.set(0, 0.3, w < 640 ? 3.8 : 3.0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.inset = '0';
    renderer.domElement.style.zIndex = '0';
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(5, 3, 5);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x435ef1, 0.4);
    rim.position.set(-5, -2, -3);
    scene.add(rim);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    // Starfield — a shell of static points behind the globe for depth.
    const starCount = 900;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 14 + Math.random() * 26;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPos[i * 3 + 2] = r * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0x8fa3d9,
      size: 0.05,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    scene.add(new THREE.Points(starGeo, starMat));

    const globeGeo = new THREE.SphereGeometry(1, 64, 48);
    const globeMat = new THREE.MeshPhongMaterial({
      color: 0x0c1124,
      emissive: 0x050814,
      specular: 0x233052,
      shininess: 16,
      transparent: true,
      opacity: 0.97,
    });
    globeGroup.add(new THREE.Mesh(globeGeo, globeMat));

    // Graticule
    const graticuleMat = new THREE.LineBasicMaterial({ color: 0x233052, transparent: true, opacity: 0.32 });
    const gratGroup = new THREE.Group();
    for (let lat = -75; lat <= 75; lat += 15) {
      const pts: THREE.Vector3[] = [];
      for (let lng = 0; lng <= 360; lng += 4) {
        const v = new THREE.Vector3();
        latLngToVec3(lat, lng, 1.002, v);
        pts.push(v);
      }
      gratGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), graticuleMat));
    }
    for (let lng = 0; lng < 360; lng += 15) {
      const pts: THREE.Vector3[] = [];
      for (let lat = -85; lat <= 85; lat += 4) {
        const v = new THREE.Vector3();
        latLngToVec3(lat, lng, 1.002, v);
        pts.push(v);
      }
      gratGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), graticuleMat));
    }
    globeGroup.add(gratGroup);

    // Atmosphere — brand-blue limb glow.
    const atmoMat = new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vNormal; void main() { vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vNormal; void main() { float intensity = pow(0.62 - dot(vNormal, vec3(0,0,1)), 2.2); gl_FragColor = vec4(0.26, 0.37, 0.95, 1.0) * intensity; }`,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    globeGroup.add(new THREE.Mesh(new THREE.SphereGeometry(1.15, 48, 36), atmoMat));

    // Continent outlines — simplified bundled outlines render immediately as a
    // base layer; they are swapped for accurate Natural Earth borders once the
    // world TopoJSON loads (see the loadWorldCountries effect below).
    const outlineMat = new THREE.LineBasicMaterial({ color: 0x2c3e6b, transparent: true, opacity: 0.3 });
    const baseLand: THREE.Line[] = [];
    for (const feature of WORLD_GEOJSON) {
      for (const ring of feature.rings) {
        const pts = geoRingTo3D(ring, 1.003);
        const vecs = pts.map((p) => new THREE.Vector3(p.x, p.y, p.z));
        const geo = new THREE.BufferGeometry().setFromPoints(vecs);
        const line = new THREE.Line(geo, outlineMat);
        globeGroup.add(line);
        baseLand.push(line);
      }
    }

    // Resize handler
    const onResize = () => {
      const W = mount.clientWidth;
      const H = mount.clientHeight;
      if (W === 0 || H === 0) return;
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      renderer.setSize(W, H);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    let t = 0;
    let rafId = 0;
    let alive = true;

    const tick = () => {
      if (!alive) return;
      t += 0.0012;
      if (!stateRef.current?.dragging) {
        globeGroup.rotation.y = t;
      }
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    };

    // Drag
    let dragging = false;
    let lastX = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
    };
    const onMove = (e: PointerEvent) => {
      if (dragging) {
        globeGroup.rotation.y += (e.clientX - lastX) * 0.005;
        lastX = e.clientX;
      }
    };
    const onUp = () => {
      dragging = false;
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    // Wheel zoom
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.position.z = Math.max(1.8, Math.min(6, camera.position.z + e.deltaY * 0.002));
    };
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    // Pinch zoom
    let pinchDist = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchDist = Math.hypot(
          e.touches[0]!.clientX - e.touches[1]!.clientX,
          e.touches[0]!.clientY - e.touches[1]!.clientY
        );
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0]!.clientX - e.touches[1]!.clientX,
          e.touches[0]!.clientY - e.touches[1]!.clientY
        );
        camera.position.z = Math.max(1.8, Math.min(6, camera.position.z + (pinchDist - dist) * 0.008));
        pinchDist = dist;
      }
    };
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: true });
    renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false });

    stateRef.current = {
      camera,
      scene,
      renderer,
      globeGroup,
      raf: 0,
      dragging: false,
      pickTargets: [],
      alive: true,
      baseLand,
      mapHighlights: [],
      arcs: [],
      markerMeshes: [],
    };
    tick();

    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('touchstart', onTouchStart);
      renderer.domElement.removeEventListener('touchmove', onTouchMove);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      stateRef.current = null;
    };
  }, []);

  // Load accurate Natural Earth borders and swap them in for the simplified
  // bundled outlines. Runs once; the actor-country highlights are drawn by the
  // actors effect below (keyed on worldReady so they re-render after load).
  useEffect(() => {
    let cancelled = false;
    loadWorldCountries().then((countries) => {
      if (cancelled || !countries) return;
      const s = stateRef.current;
      if (!s) return;
      worldRef.current = countries;

      // Drop the simplified base continents.
      for (const line of s.baseLand) s.globeGroup.remove(line);
      s.baseLand = [];

      // Draw every country border as an accurate, subtle line.
      const borderMat = new THREE.LineBasicMaterial({ color: 0x33436e, transparent: true, opacity: 0.38 });
      for (const c of countries) {
        for (const ring of c.rings) {
          const vecs = geoRingTo3D(ring, 1.003).map((p) => new THREE.Vector3(p.x, p.y, p.z));
          s.globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(vecs), borderMat));
        }
      }
      setWorldReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Update markers + arcs when actors change
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;

    // Clear old markers
    for (const pt of s.pickTargets) s.globeGroup.remove(pt.mesh);
    s.pickTargets = [];
    for (const m of s.markerMeshes) s.globeGroup.remove(m);
    s.markerMeshes = [];

    // Clear old arcs + country highlights (tracked explicitly so the accurate
    // border lines drawn by the world-map effect are never touched).
    for (const line of s.arcs) s.globeGroup.remove(line);
    s.arcs = [];
    for (const line of s.mapHighlights) s.globeGroup.remove(line);
    s.mapHighlights = [];

    // Highlight home nations of the currently visible actors in their
    // attribution colour, drawn just above the border lines.
    if (worldReady && worldRef.current) {
      const numericToColor = new Map<string, string>();
      for (const a of actors) {
        const num = ALPHA2_TO_NUMERIC[a.country];
        if (num && !numericToColor.has(num)) {
          numericToColor.set(num, (NATION_PALETTE[a.country] ?? NATION_PALETTE.XX!).color);
        }
      }
      if (numericToColor.size > 0) {
        for (const c of worldRef.current) {
          const color = numericToColor.get(c.id);
          if (!color) continue;
          const hlMat = new THREE.LineBasicMaterial({
            color: new THREE.Color(color),
            transparent: true,
            opacity: 0.85,
          });
          for (const ring of c.rings) {
            const vecs = geoRingTo3D(ring, 1.006).map((p) => new THREE.Vector3(p.x, p.y, p.z));
            const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(vecs), hlMat);
            s.globeGroup.add(line);
            s.mapHighlights.push(line);
          }
        }
      }
    }

    // Group actors by country
    const countryActors: Record<string, Actor[]> = {};
    for (const a of actors) {
      (countryActors[a.country] ??= []).push(a);
    }

    // Add markers
    for (const [code, list] of Object.entries(countryActors)) {
      const coords = COUNTRY_COORDS[code];
      if (!coords) continue;
      const nation = NATION_PALETTE[code] ?? NATION_PALETTE.XX!;
      const v = new THREE.Vector3();
      latLngToVec3(coords.lat, coords.lng, 1.006, v);
      const isMulti = list.length > 1;
      const radius = 0.014 + Math.min(0.03, list.length * 0.007);

      // Pulse glow
      const pulseMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(nation.color),
        transparent: true,
        opacity: 0.08,
      });
      const pulse = new THREE.Mesh(new THREE.SphereGeometry(radius * 2.5, 16, 16), pulseMat);
      pulse.position.copy(v);
      s.globeGroup.add(pulse);
      s.markerMeshes.push(pulse);

      // Main marker
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(nation.color) });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 16), mat);
      mesh.position.copy(v);
      s.globeGroup.add(mesh);
      s.markerMeshes.push(mesh);
      s.pickTargets.push({ mesh, actor: list[0]! });

      if (isMulti) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(radius * 1.5, radius * 1.9, 32),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(nation.color),
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
          })
        );
        ring.position.copy(v);
        ring.lookAt(0, 0, 0);
        s.globeGroup.add(ring);
        s.markerMeshes.push(ring);

        for (let i = 1; i < list.length && i < 3; i++) {
          const off = new THREE.Vector3(
            (Math.random() - 0.5) * 0.02,
            (Math.random() - 0.5) * 0.02,
            (Math.random() - 0.5) * 0.02
          );
          const smallMesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.6, 12, 12), mat.clone());
          smallMesh.position.copy(v).add(off);
          s.globeGroup.add(smallMesh);
          s.markerMeshes.push(smallMesh);
          s.pickTargets.push({ mesh: smallMesh, actor: list[i]! });
        }
      }
    }

    // Arcs
    if (showArcs) {
      for (const [srcCode, srcActors] of Object.entries(countryActors)) {
        const srcCoords = COUNTRY_COORDS[srcCode];
        if (!srcCoords) continue;
        for (const actor of srcActors) {
          for (const tgtName of actor.targets.slice(0, 2)) {
            const tgtEntry = Object.entries(COUNTRY_COORDS).find(([, c]) => c.name === tgtName);
            if (!tgtEntry) continue;
            const [tgtCode, tgtCoords] = tgtEntry;
            if (tgtCode === srcCode) continue;

            const a = new THREE.Vector3();
            const b = new THREE.Vector3();
            latLngToVec3(srcCoords.lat, srcCoords.lng, 1.006, a);
            latLngToVec3(tgtCoords.lat, tgtCoords.lng, 1.006, b);
            const mid = a.clone().add(b).multiplyScalar(0.5);
            const dist = a.distanceTo(b);
            mid.normalize().multiplyScalar(1 + dist * 0.2);
            const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
            const lineGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
            const lineMat = new THREE.LineBasicMaterial({
              color: new THREE.Color(NATION_PALETTE[srcCode]?.color ?? '#5b8def'),
              transparent: true,
              opacity: 0.2,
            });
            const arcLine = new THREE.Line(lineGeo, lineMat);
            s.globeGroup.add(arcLine);
            s.arcs.push(arcLine);
          }
        }
      }
    }
  }, [actors, showArcs, worldReady]);

  // Hover + click detection
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMove = (e: PointerEvent) => {
      const rect = s.renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, s.camera);
      const hits = raycaster.intersectObjects(
        s.pickTargets.map((p) => p.mesh),
        false
      );
      if (hits.length > 0) {
        const target = s.pickTargets.find((p) => p.mesh === hits[0]!.object);
        if (target) {
          s.renderer.domElement.style.cursor = 'pointer';
          setHovered({ actor: target.actor, x: e.clientX - rect.left, y: e.clientY - rect.top });
          return;
        }
      }
      s.renderer.domElement.style.cursor = 'grab';
      setHovered(null);
    };

    const onClick = (e: MouseEvent) => {
      const rect = s.renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, s.camera);
      const hits = raycaster.intersectObjects(
        s.pickTargets.map((p) => p.mesh),
        false
      );
      if (hits.length > 0) {
        const target = s.pickTargets.find((p) => p.mesh === hits[0]!.object);
        if (target) onOpen(target.actor);
      }
    };

    s.renderer.domElement.addEventListener('pointermove', onMove);
    s.renderer.domElement.addEventListener('click', onClick);
    return () => {
      s.renderer.domElement.removeEventListener('pointermove', onMove);
      s.renderer.domElement.removeEventListener('click', onClick);
    };
  }, [onOpen]);

  return (
    <div className="absolute inset-0 flex globe-bg">
      <aside className="w-72 border-r border-white/10 overflow-y-auto p-3 hidden md:block globe-panel">
        <div className="text-eyebrow font-mono text-slate-400 mb-3">Threat origins</div>
        <div className="space-y-0.5">
          {Object.entries(
            actors.reduce<Record<string, Actor[]>>((acc, a) => {
              (acc[a.country] ??= []).push(a);
              return acc;
            }, {})
          )
            .sort(([, a], [, b]) => b.length - a.length)
            .map(([code, list]) => {
              const n = NATION_PALETTE[code] ?? NATION_PALETTE.XX!;
              return (
                <button
                  key={code}
                  onClick={() => onOpen(list[0]!)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/5 text-left transition-all duration-200"
                >
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ background: n.color, boxShadow: `0 0 10px ${n.color}66` }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] text-slate-100 truncate">{n.name}</div>
                    <div className="text-micro font-mono text-slate-400">{list.map((a) => a.name).join(', ')}</div>
                  </div>
                  <span className="text-mini font-mono text-slate-400 shrink-0">{list.length}</span>
                </button>
              );
            })}
        </div>
        <div className="text-eyebrow font-mono text-slate-400 mt-6 mb-2">Controls</div>
        <div className="text-mini text-slate-400 leading-relaxed space-y-1">
          <p>Drag to rotate</p>
          <p>Scroll to zoom</p>
          <p>Click marker to open dossier</p>
        </div>
      </aside>

      <div className="flex-1 relative globe-bg">
        <div ref={mountRef} className="absolute inset-0 z-0" style={{ cursor: 'grab' }} />

        <div className="absolute top-3 left-3 sm:top-4 sm:left-4 flex gap-1.5 sm:gap-2 pointer-events-none">
          <div className="globe-card px-2.5 sm:px-3 py-1.5">
            <div className="font-mono text-xl sm:text-2xl font-bold text-slate-100">{actors.length}</div>
            <div className="text-micro font-mono uppercase tracking-wider text-slate-400">actors</div>
          </div>
          <div className="globe-card px-2.5 sm:px-3 py-1.5">
            <div className="font-mono text-xl sm:text-2xl font-bold text-slate-100">
              {new Set(actors.map((a) => a.country)).size}
            </div>
            <div className="text-micro font-mono uppercase tracking-wider text-slate-400">nations</div>
          </div>
        </div>

        <div className="absolute top-3 right-3 sm:top-4 sm:right-4 flex gap-2">
          <button
            onClick={() => setShowArcs((s) => !s)}
            aria-pressed={showArcs}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-tool font-medium transition-colors ${
              showArcs
                ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                : 'border-white/10 globe-panel text-slate-300 hover:border-white/20'
            }`}
          >
            <Waypoints size={13} className="shrink-0" />
            <span className="hidden sm:inline">target arcs</span>
          </button>
        </div>

        {hovered && (
          <div
            className="globe-card px-3 py-2.5 text-tool pointer-events-none absolute z-10 min-w-[160px]"
            style={{
              left: Math.min(hovered.x + 14, (mountRef.current?.clientWidth ?? 600) - 200),
              top: hovered.y + 14,
            }}
          >
            <div className="font-semibold text-slate-100">{hovered.actor.name}</div>
            <div className="text-slate-400 font-mono text-[11px] mt-0.5">
              {hovered.actor.apt} · {NATION_PALETTE[hovered.actor.country]?.name}
            </div>
            <div className="text-slate-400 text-[11px] mt-1">
              {hovered.actor.motivation} · {hovered.actor.sectors.slice(0, 2).join(', ')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
