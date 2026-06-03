import { useEffect, useRef, useState, useCallback } from "react";

interface ResultsConfig {
  mach: number;
  reynolds: number;
  gridNI: number;
  gridNJ: number;
  domainLx: number;
  domainLy: number;
  bc3: number;
  turbulenceDES: number;
  flowType: number;
}

type Field = "velocity" | "pressure" | "temperature" | "turbulentKE" | "wallShear";
type ColorMap = "jet" | "plasma" | "cool" | "hot";
type Slice = "XY" | "XZ";

// Colormaps: value in [0,1] → [r,g,b]
function jet(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const r = Math.min(Math.max(1.5 - Math.abs(4 * t - 3), 0), 1);
  const g = Math.min(Math.max(1.5 - Math.abs(4 * t - 2), 0), 1);
  const b = Math.min(Math.max(1.5 - Math.abs(4 * t - 1), 0), 1);
  return [r, g, b];
}
function plasma(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const r = 0.05 + 0.9 * t + 0.05 * Math.sin(Math.PI * t);
  const g = 0.02 + 0.3 * t * (1 - t) * 4;
  const b = 0.5 * (1 - t) + 0.1;
  return [Math.min(r,1), Math.min(g,1), Math.min(b,1)];
}
function coolMap(t: number): [number, number, number] {
  return [t, 1 - t * 0.3, 1];
}
function hotMap(t: number): [number, number, number] {
  const r = Math.min(t * 2.5, 1);
  const g = Math.max(t * 2.5 - 1, 0);
  const b = Math.max(t * 3 - 2, 0);
  return [r, g, b];
}

const COLORMAPS: Record<ColorMap, (t: number) => [number, number, number]> = {
  jet, plasma, cool: coolMap, hot: hotMap,
};

// Generate synthetic CFD field
function generateField(
  cfg: ResultsConfig,
  field: Field,
  nx: number,
  ny: number
): Float32Array {
  const data = new Float32Array(nx * ny);
  const { mach, domainLx: Lx, domainLy: Ly, bc3, turbulenceDES } = cfg;
  const hasWall = bc3 >= 31 && bc3 < 40;
  const Re = cfg.reynolds;

  for (let j = 0; j < ny; j++) {
    const eta = j / (ny - 1); // 0=bottom, 1=top
    const y = eta * Ly;

    for (let i = 0; i < nx; i++) {
      const xi = i / (nx - 1);
      const x = xi * Lx;
      let val = 0;

      if (field === "velocity") {
        if (hasWall) {
          // Turbulent BL grows with x^0.8
          const delta = 0.37 * x * Math.pow(Re * x / Lx, -0.2) + 0.001;
          const etaBL = Math.min(y / Math.max(delta, 1e-6), 1.2);
          if (turbulenceDES === 1) {
            // Log-law profile
            const yPlus = etaBL * 50;
            val = yPlus < 11 ? yPlus / 11 : (Math.log(yPlus) / Math.log(10) + 0.1) / 3.5;
          } else {
            // Laminar BL (Blasius-like)
            val = Math.tanh(etaBL * 2.5);
          }
          val = Math.min(1, val);
        } else {
          // Channel flow — parabolic
          const etaC = 2 * eta - 1;
          val = 1 - etaC * etaC;
          // Add streamwise decay at outlet
          val *= 0.7 + 0.3 * (1 - xi * 0.2);
        }
        // Add some noise
        val += 0.01 * (Math.sin(xi * 30) * Math.cos(eta * 20));
        val = Math.max(0, Math.min(1, val));
      } else if (field === "pressure") {
        if (hasWall) {
          // Pressure drop across domain
          val = 1 - xi * 0.4;
          // Stagnation near leading edge
          if (xi < 0.05) val = 1 + (0.05 - xi) / 0.05 * 0.3 * (1 - eta);
          // Low pressure in BL
          val -= eta < 0.1 ? 0.1 * (1 - eta / 0.1) * xi : 0;
        } else {
          // Channel: linear pressure drop
          val = 1 - xi * 0.8 + 0.02 * Math.cos(eta * Math.PI);
        }
        val = Math.max(0, Math.min(1, val));
      } else if (field === "temperature") {
        if (hasWall) {
          // Adiabatic wall → temperature rises in BL
          const delta = 0.37 * x * Math.pow(Math.max(Re * x / Lx, 1), -0.2) + 0.001;
          const etaBL = Math.min(y / Math.max(delta, 1e-6), 1.5);
          val = 1.0 + (1 - Math.tanh(etaBL)) * mach * mach * 0.2 * (1 - eta);
          val = (val - 1) / (mach * mach * 0.2);
          val = Math.max(0, Math.min(1, val));
        } else {
          val = 0.2 + 0.8 * (1 - eta);
          val = Math.max(0, Math.min(1, val));
        }
      } else if (field === "turbulentKE") {
        if (turbulenceDES === 1 && hasWall) {
          const delta = 0.37 * x * Math.pow(Math.max(Re * x / Lx, 1), -0.2) + 0.001;
          const etaBL = y / Math.max(delta, 1e-6);
          // TKE peaks in log layer
          const peak = Math.exp(-0.5 * ((etaBL - 0.3) / 0.15) ** 2);
          val = peak * Math.min(xi * 2, 1);
          val = Math.max(0, Math.min(1, val));
        } else {
          val = 0.05 + 0.02 * Math.sin(xi * 15) * Math.sin(eta * 10);
          val = Math.max(0, Math.min(1, val));
        }
      } else if (field === "wallShear") {
        if (hasWall && j === 0) {
          if (turbulenceDES === 1) {
            val = Math.pow(xi, 0.2) * 0.8 + 0.2;
          } else {
            val = xi < 0.01 ? 0 : Math.pow(xi, -0.5) * 0.4;
          }
          val = Math.max(0, Math.min(1, val));
        } else {
          val = 0;
        }
      }

      data[j * nx + i] = val;
    }
  }
  return data;
}

function drawColorbar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  cmap: ColorMap,
  minVal: number,
  maxVal: number,
  label: string
) {
  const steps = 100;
  for (let i = 0; i < steps; i++) {
    const t = 1 - i / steps;
    const [r, g, b] = COLORMAPS[cmap](t);
    ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
    ctx.fillRect(x, y + (i / steps) * h, w, h / steps + 1);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  ctx.font = "10px JetBrains Mono, monospace";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.textAlign = "left";
  ctx.fillText(maxVal.toFixed(3), x + w + 4, y + 10);
  ctx.fillText(((minVal + maxVal) / 2).toFixed(3), x + w + 4, y + h / 2 + 4);
  ctx.fillText(minVal.toFixed(3), x + w + 4, y + h - 4);

  ctx.save();
  ctx.translate(x + w / 2, y + h + 20);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.textAlign = "center";
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

const FIELD_LABELS: Record<Field, string> = {
  velocity: "U / U∞",
  pressure: "Cp",
  temperature: "T / T∞",
  turbulentKE: "k / k∞",
  wallShear: "τw / τ∞",
};

const FIELD_RANGES: Record<Field, [number, number]> = {
  velocity: [0, 1],
  pressure: [0.6, 1.3],
  temperature: [1.0, 1.2],
  turbulentKE: [0, 0.05],
  wallShear: [0, 1],
};

export interface ResultsViewerProps {
  config: Record<string, unknown>;
  simulationStatus: string;
}

export default function ResultsViewer({ config: rawConfig, simulationStatus }: ResultsViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [field, setField] = useState<Field>("velocity");
  const [colormap, setColormap] = useState<ColorMap>("jet");
  const [probe, setProbe] = useState<{ x: number; y: number; val: number } | null>(null);

  const cfg: ResultsConfig = {
    mach: Number(rawConfig.mach) || 0.2,
    reynolds: Number(rawConfig.reynolds) || 5e6,
    gridNI: Number(rawConfig.gridNI) || 69,
    gridNJ: Number(rawConfig.gridNJ) || 49,
    domainLx: Number(rawConfig.domainLx) || 2.33,
    domainLy: Number(rawConfig.domainLy) || 1.0,
    bc3: Number(rawConfig.bc3) || 31,
    turbulenceDES: Number(rawConfig.turbulenceDES) || 0,
    flowType: Number(rawConfig.flowType) || 1,
  };

  const isAvailable = simulationStatus === "completed" || simulationStatus === "running";

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const W = container.clientWidth;
    const H = container.clientHeight;
    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#020c18";
    ctx.fillRect(0, 0, W, H);

    if (!isAvailable) {
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.font = "12px JetBrains Mono, monospace";
      ctx.textAlign = "center";
      ctx.fillText("Results available after simulation completes", W / 2, H / 2);
      return;
    }

    const padLeft = 40, padRight = 100, padTop = 30, padBottom = 50;
    const plotW = W - padLeft - padRight;
    const plotH = H - padTop - padBottom;
    if (plotW <= 0 || plotH <= 0) return;

    const NX = Math.min(cfg.gridNI, 128);
    const NY = Math.min(cfg.gridNJ, 128);
    const data = generateField(cfg, field, NX, NY);

    const [minV, maxV] = FIELD_RANGES[field];
    const cmap = COLORMAPS[colormap];

    // Draw field as pixel rows
    const cellW = plotW / NX;
    const cellH = plotH / NY;

    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const rawVal = data[(NY - 1 - j) * NX + i];
        const t = (rawVal - minV) / (maxV - minV + 1e-10);
        const [r, g, b] = cmap(Math.max(0, Math.min(1, t)));
        ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
        ctx.fillRect(padLeft + i * cellW, padTop + j * cellH, cellW + 1, cellH + 1);
      }
    }

    // Domain border
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(padLeft, padTop, plotW, plotH);

    // Axes
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "9px JetBrains Mono, monospace";
    ctx.textAlign = "center";
    [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
      const xPos = padLeft + t * plotW;
      ctx.fillText((t * cfg.domainLx).toFixed(2), xPos, H - padBottom + 14);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.moveTo(xPos, padTop);
      ctx.lineTo(xPos, padTop + plotH);
      ctx.stroke();
    });

    ctx.textAlign = "right";
    [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
      const yPos = padTop + (1 - t) * plotH;
      ctx.fillText((t * cfg.domainLy).toFixed(2), padLeft - 4, yPos + 3);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.moveTo(padLeft, yPos);
      ctx.lineTo(padLeft + plotW, yPos);
      ctx.stroke();
    });

    // Axis labels
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.textAlign = "center";
    ctx.font = "10px JetBrains Mono, monospace";
    ctx.fillText("x (m)", padLeft + plotW / 2, H - 5);
    ctx.save();
    ctx.translate(12, padTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("y (m)", 0, 0);
    ctx.restore();

    // Colorbar
    const cbW = 16, cbH = Math.min(plotH * 0.7, 180);
    const cbX = padLeft + plotW + 16;
    const cbY = padTop + (plotH - cbH) / 2;
    drawColorbar(ctx, cbX, cbY, cbW, cbH, colormap, minV, maxV, FIELD_LABELS[field]);

    // Probe
    if (probe) {
      const [r, g, b] = cmap(Math.max(0, Math.min(1, (probe.val - minV) / (maxV - minV + 1e-10))));
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(padLeft + probe.x * plotW, padTop + probe.y * plotH, 5, 0, Math.PI * 2);
      ctx.stroke();

      const domX = probe.x * cfg.domainLx;
      const domY = (1 - probe.y) * cfg.domainLy;
      const dispVal = (probe.val * (maxV - minV) + minV).toFixed(4);

      ctx.fillStyle = "rgba(0,0,0,0.85)";
      const tx = padLeft + probe.x * plotW + 12;
      const ty = padTop + probe.y * plotH - 8;
      ctx.fillRect(tx - 2, ty - 12, 130, 44);
      ctx.strokeStyle = `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(tx - 2, ty - 12, 130, 44);

      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.textAlign = "left";
      ctx.font = "9px JetBrains Mono, monospace";
      ctx.fillText(`x: ${domX.toFixed(4)} m`, tx + 2, ty + 2);
      ctx.fillText(`y: ${domY.toFixed(4)} m`, tx + 2, ty + 14);
      ctx.fillStyle = `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`;
      ctx.fillText(`${FIELD_LABELS[field]}: ${dispVal}`, tx + 2, ty + 26);
    }
  }, [field, colormap, probe, cfg, isAvailable]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const obs = new ResizeObserver(() => draw());
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [draw]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !isAvailable) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = canvas.width, H = canvas.height;
    const padLeft = 40, padRight = 100, padTop = 30, padBottom = 50;
    const plotW = W - padLeft - padRight;
    const plotH = H - padTop - padBottom;
    if (mx < padLeft || mx > padLeft + plotW || my < padTop || my > padTop + plotH) {
      setProbe(null);
      return;
    }
    const xi = (mx - padLeft) / plotW;
    const eta = (my - padTop) / plotH;
    const NX = Math.min(cfg.gridNI, 128);
    const NY = Math.min(cfg.gridNJ, 128);
    const data = generateField(cfg, field, NX, NY);
    const ii = Math.floor(xi * NX);
    const jj = Math.floor((1 - eta) * NY);
    const val = data[Math.min(jj, NY - 1) * NX + Math.min(ii, NX - 1)];
    setProbe({ x: xi, y: eta, val });
  }, [cfg, field, isAvailable]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-card/50 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mr-1">Field:</span>
          {(Object.keys(FIELD_LABELS) as Field[]).map((f) => (
            <button
              key={f}
              onClick={() => setField(f)}
              className={`font-mono text-[10px] px-2 py-1 border uppercase tracking-wider transition-all ${
                field === f
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "velocity" ? "U/U∞" : f === "pressure" ? "Cp" : f === "temperature" ? "T/T∞" : f === "turbulentKE" ? "TKE" : "τw"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mr-1">Cmap:</span>
          {(["jet", "plasma", "cool", "hot"] as ColorMap[]).map((c) => (
            <button
              key={c}
              onClick={() => setColormap(c)}
              className={`font-mono text-[10px] px-2 py-1 border uppercase tracking-wider transition-all ${
                colormap === c
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="ml-auto font-mono text-[10px] text-muted-foreground">
          XY Plane · Hover to probe
        </div>
      </div>

      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setProbe(null)}
        />
        {!isAvailable && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-card/90 border border-border px-6 py-4 text-center">
              <p className="font-mono text-sm text-muted-foreground">
                {simulationStatus === "draft" || simulationStatus === "queued"
                  ? "Run simulation to see results visualization"
                  : simulationStatus === "running"
                  ? "Results preview available — simulation running"
                  : "No results available"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
