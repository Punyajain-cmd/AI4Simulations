import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, GizmoHelper, GizmoViewport, Html } from "@react-three/drei";
import * as THREE from "three";

interface MeshConfig {
  gridNI: number;
  gridNJ: number;
  gridNK: number;
  domainLx: number;
  domainLy: number;
  domainLz: number;
  bc1?: number;
  bc2?: number;
  bc3?: number;
  bc4?: number;
  bc5?: number;
  bc6?: number;
  meshStretchJ?: number;
  meshStretchI?: number;
  wallSpacingJ?: number;
  clusteringType?: number;
}

function stretchCoords(n: number, length: number, stretch: number, wallSpacing?: number): number[] {
  if (n <= 1) return [0];
  const coords: number[] = [];
  if (wallSpacing && wallSpacing > 0 && stretch > 1) {
    // Hyperbolic tangent clustering (Vinokur)
    const s = stretch;
    for (let i = 0; i < n; i++) {
      const xi = i / (n - 1);
      const y = (1 + Math.tanh(s * (xi - 0.5)) / Math.tanh(0.5 * s));
      coords.push(y * length);
    }
  } else if (stretch > 1) {
    // Geometric progression from wall
    const r = stretch;
    let dy0 = length * (r - 1) / (Math.pow(r, n - 1) - 1);
    let pos = 0;
    coords.push(pos);
    for (let i = 1; i < n; i++) {
      dy0 *= r;
      pos += dy0;
      coords.push(Math.min(pos, length));
    }
    // Normalize
    const max = coords[coords.length - 1];
    for (let i = 0; i < coords.length; i++) coords[i] = (coords[i] / max) * length;
  } else {
    for (let i = 0; i < n; i++) coords.push((i / (n - 1)) * length);
  }
  return coords;
}

function bcColor(code: number): THREE.Color {
  const c = new THREE.Color();
  if (code >= 11 && code < 20) return c.setHex(0x00e5ff); // inlet — cyan
  if (code >= 21 && code < 30) return c.setHex(0xff7700); // outlet — orange
  if (code >= 31 && code < 40) return c.setHex(0xff2255); // wall — red
  if (code >= 41 && code < 50) return c.setHex(0x44ff88); // top/freestream — green
  if (code >= 51 && code < 70) return c.setHex(0xbbbbbb); // periodic — grey
  return c.setHex(0x888888);
}

const DISPLAY_MAX_I = 32;
const DISPLAY_MAX_J = 32;
const DISPLAY_MAX_K = 8;

function StructuredGrid({ cfg, displayMode }: { cfg: MeshConfig; displayMode: string }) {
  const linesRef = useRef<THREE.LineSegments>(null);

  const { geometry, bboxSize } = useMemo(() => {
    const NI = Math.min(cfg.gridNI, DISPLAY_MAX_I);
    const NJ = Math.min(cfg.gridNJ, DISPLAY_MAX_J);
    const NK = Math.min(cfg.gridNK, DISPLAY_MAX_K);
    const Lx = cfg.domainLx;
    const Ly = cfg.domainLy;
    const Lz = cfg.domainLz;

    const stretchJ = cfg.meshStretchJ ?? 1.0;
    const stretchI = cfg.meshStretchI ?? 1.0;

    const xs = stretchCoords(NI, Lx, stretchI);
    const ys = stretchCoords(NJ, Ly, stretchJ, cfg.wallSpacingJ);
    const zs = stretchCoords(NK, Lz, 1.0);

    const pts: number[] = [];
    const cols: number[] = [];

    function addLine(
      x1: number, y1: number, z1: number,
      x2: number, y2: number, z2: number,
      color: THREE.Color
    ) {
      pts.push(x1, y1, z1, x2, y2, z2);
      cols.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }

    const lineColor = new THREE.Color(0x1a6ea8);
    const dimColor  = new THREE.Color(0x0d3a5a);

    // I-direction lines (streamwise)
    for (let j = 0; j < NJ; j++) {
      for (let k = 0; k < NK; k++) {
        const faceColor = j === 0 ? bcColor(cfg.bc3 ?? 31)
                         : j === NJ - 1 ? bcColor(cfg.bc4 ?? 42)
                         : (j === 1 || j === NJ - 2) ? new THREE.Color(0x0d5080)
                         : dimColor;
        const isBoundary = j === 0 || j === NJ - 1 || k === 0 || k === NK - 1;
        const c = isBoundary ? faceColor : lineColor;
        for (let i = 0; i < NI - 1; i++) {
          addLine(xs[i], ys[j], zs[k], xs[i + 1], ys[j], zs[k], c);
        }
      }
    }

    // J-direction lines (wall-normal)
    for (let i = 0; i < NI; i++) {
      for (let k = 0; k < NK; k++) {
        const faceColor = i === 0 ? bcColor(cfg.bc1 ?? 11)
                         : i === NI - 1 ? bcColor(cfg.bc2 ?? 21)
                         : lineColor;
        const isBoundary = i === 0 || i === NI - 1 || k === 0 || k === NK - 1;
        const c = isBoundary ? faceColor : lineColor;
        for (let j = 0; j < NJ - 1; j++) {
          addLine(xs[i], ys[j], zs[k], xs[i], ys[j + 1], zs[k], c);
        }
      }
    }

    // K-direction lines (spanwise)
    if (NK > 1) {
      for (let i = 0; i < NI; i++) {
        for (let j = 0; j < NJ; j++) {
          const c = (i === 0 || i === NI - 1 || j === 0 || j === NJ - 1)
            ? new THREE.Color(0x334455)
            : dimColor;
          for (let k = 0; k < NK - 1; k++) {
            addLine(xs[i], ys[j], zs[k], xs[i], ys[j], zs[k + 1], c);
          }
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    return { geometry: geo, bboxSize: new THREE.Vector3(Lx, Ly, Lz) };
  }, [cfg, displayMode]);

  return (
    <lineSegments ref={linesRef} geometry={geometry}>
      <lineBasicMaterial vertexColors attach="material" />
    </lineSegments>
  );
}

function BoundaryFaces({ cfg }: { cfg: MeshConfig }) {
  const Lx = cfg.domainLx;
  const Ly = cfg.domainLy;
  const Lz = cfg.domainLz;

  const faces = [
    { pos: [0, Ly / 2, Lz / 2], rot: [0, Math.PI / 2, 0], size: [Lz, Ly], code: cfg.bc1 ?? 11, label: "Inlet" },
    { pos: [Lx, Ly / 2, Lz / 2], rot: [0, -Math.PI / 2, 0], size: [Lz, Ly], code: cfg.bc2 ?? 21, label: "Outlet" },
    { pos: [Lx / 2, 0, Lz / 2], rot: [-Math.PI / 2, 0, 0], size: [Lx, Lz], code: cfg.bc3 ?? 31, label: "Bottom" },
    { pos: [Lx / 2, Ly, Lz / 2], rot: [Math.PI / 2, 0, 0], size: [Lx, Lz], code: cfg.bc4 ?? 42, label: "Top" },
  ];

  return (
    <>
      {faces.map((f, i) => {
        const col = bcColor(f.code);
        return (
          <mesh
            key={i}
            position={f.pos as [number, number, number]}
            rotation={f.rot as [number, number, number]}
          >
            <planeGeometry args={[f.size[0], f.size[1]]} />
            <meshBasicMaterial color={col} transparent opacity={0.08} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </>
  );
}

function AxisLabels({ cfg }: { cfg: MeshConfig }) {
  const { domainLx: Lx, domainLy: Ly, domainLz: Lz } = cfg;
  return (
    <>
      <Html position={[Lx + 0.05, 0, 0]}>
        <span className="font-mono text-[10px] text-cyan-400 select-none">+X</span>
      </Html>
      <Html position={[0, Ly + 0.05, 0]}>
        <span className="font-mono text-[10px] text-green-400 select-none">+Y</span>
      </Html>
      {Lz > 0 && (
        <Html position={[0, 0, Lz + 0.05]}>
          <span className="font-mono text-[10px] text-orange-400 select-none">+Z</span>
        </Html>
      )}
    </>
  );
}

function SceneContent({ cfg, displayMode }: { cfg: MeshConfig; displayMode: string }) {
  const { domainLx: Lx, domainLy: Ly, domainLz: Lz } = cfg;
  const center: [number, number, number] = [Lx / 2, Ly / 2, Lz / 2];
  const dist = Math.max(Lx, Ly, Lz) * 2.2;

  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[dist, dist, dist]} intensity={1} />
      <OrbitControls
        target={center}
        enableDamping
        dampingFactor={0.05}
        minDistance={0.001}
        maxDistance={dist * 5}
      />

      <StructuredGrid cfg={cfg} displayMode={displayMode} />
      {displayMode === "surface" && <BoundaryFaces cfg={cfg} />}
      <AxisLabels cfg={cfg} />

      {/* Domain bounding box */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(Lx, Ly, Lz)]} />
        <lineBasicMaterial color={0x334466} />
        <primitive object={new THREE.Object3D()} position={center} />
      </lineSegments>

      <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
        <GizmoViewport
          axisColors={["#ff4466", "#44ff88", "#4488ff"]}
          labelColor="white"
        />
      </GizmoHelper>
    </>
  );
}

const BC_LEGEND = [
  { code: "11-19", label: "Inlet",      color: "#00e5ff" },
  { code: "21-29", label: "Outlet",     color: "#ff7700" },
  { code: "31-39", label: "Wall",       color: "#ff2255" },
  { code: "41-49", label: "Freestream", color: "#44ff88" },
  { code: "51-69", label: "Periodic",   color: "#bbbbbb" },
];

export interface MeshViewerProps {
  config: Record<string, unknown>;
}

export default function MeshViewer({ config: rawConfig }: MeshViewerProps) {
  const [displayMode, setDisplayMode] = useState<"wireframe" | "surface">("wireframe");
  const [showLegend, setShowLegend] = useState(true);

  const cfg: MeshConfig = {
    gridNI: Number(rawConfig.gridNI) || 69,
    gridNJ: Number(rawConfig.gridNJ) || 49,
    gridNK: Number(rawConfig.gridNK) || 3,
    domainLx: Number(rawConfig.domainLx) || 2.33,
    domainLy: Number(rawConfig.domainLy) || 1.0,
    domainLz: Number(rawConfig.domainLz) || 0.5,
    bc1: Number(rawConfig.bc1) || 11,
    bc2: Number(rawConfig.bc2) || 21,
    bc3: Number(rawConfig.bc3) || 31,
    bc4: Number(rawConfig.bc4) || 42,
    bc5: Number(rawConfig.bc5) || 51,
    bc6: Number(rawConfig.bc6) || 61,
    meshStretchJ: Number(rawConfig.meshStretchJ) || 1.0,
    meshStretchI: Number(rawConfig.meshStretchI) || 1.0,
    wallSpacingJ: Number(rawConfig.wallSpacingJ) || 0,
    clusteringType: Number(rawConfig.clusteringType) || 0,
  };

  const displayNI = Math.min(cfg.gridNI, DISPLAY_MAX_I);
  const displayNJ = Math.min(cfg.gridNJ, DISPLAY_MAX_J);
  const displayNK = Math.min(cfg.gridNK, DISPLAY_MAX_K);
  const totalNodes = cfg.gridNI * cfg.gridNJ * cfg.gridNK;
  const displayNodes = displayNI * displayNJ * displayNK;
  const isClipped = totalNodes > displayNodes;

  return (
    <div className="relative w-full h-full bg-[#020c18] overflow-hidden select-none">
      {/* Controls bar */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 flex-wrap">
        {(["wireframe", "surface"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setDisplayMode(m)}
            className={`font-mono text-[10px] uppercase tracking-wider px-3 py-1 border transition-all ${
              displayMode === m
                ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-400"
                : "bg-black/40 border-white/10 text-white/40 hover:text-white/70"
            }`}
          >
            {m}
          </button>
        ))}
        <button
          onClick={() => setShowLegend((v) => !v)}
          className="font-mono text-[10px] uppercase tracking-wider px-3 py-1 border bg-black/40 border-white/10 text-white/40 hover:text-white/70 transition-all"
        >
          {showLegend ? "Hide" : "Show"} BC
        </button>
      </div>

      {/* Grid stats */}
      <div className="absolute top-3 right-3 z-10 bg-black/70 border border-white/10 px-3 py-2 font-mono text-[10px] space-y-0.5">
        <div className="text-white/50 uppercase tracking-widest mb-1">Grid</div>
        <div className="text-cyan-400">{cfg.gridNI} × {cfg.gridNJ} × {cfg.gridNK}</div>
        <div className="text-white/40">{totalNodes.toLocaleString()} nodes</div>
        {isClipped && (
          <div className="text-yellow-400/80 mt-1">
            Display: {displayNI}×{displayNJ}×{displayNK}
          </div>
        )}
        <div className="text-white/30 mt-1">{cfg.domainLx} × {cfg.domainLy} × {cfg.domainLz} m</div>
        {(cfg.meshStretchJ ?? 1) > 1 && (
          <div className="text-purple-400">Stretch J: {(cfg.meshStretchJ ?? 1).toFixed(2)}×</div>
        )}
      </div>

      {/* BC Legend */}
      {showLegend && (
        <div className="absolute bottom-3 left-3 z-10 bg-black/70 border border-white/10 px-3 py-2 font-mono text-[10px] space-y-1">
          <div className="text-white/50 uppercase tracking-widest mb-1">Boundary Conditions</div>
          {BC_LEGEND.map((b) => (
            <div key={b.code} className="flex items-center gap-2">
              <div className="w-3 h-2 shrink-0" style={{ backgroundColor: b.color }} />
              <span style={{ color: b.color }}>{b.label}</span>
              <span className="text-white/30">({b.code})</span>
            </div>
          ))}
        </div>
      )}

      {/* Hint */}
      <div className="absolute bottom-3 right-3 z-10 font-mono text-[9px] text-white/20">
        Scroll to zoom · Drag to orbit · Shift+drag to pan
      </div>

      <Canvas
        camera={{
          position: [cfg.domainLx * 1.5, cfg.domainLy * 1.5, cfg.domainLz * 3],
          fov: 45,
          near: 0.0001,
          far: 1000,
        }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: "#020c18" }}
      >
        <SceneContent cfg={cfg} displayMode={displayMode} />
      </Canvas>
    </div>
  );
}
