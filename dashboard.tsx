import { Link } from "wouter";
import { useGetSimulationStats, useGetRecentSimulations } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, CheckCircle2, XCircle, Clock, Database,
  FileEdit, ArrowRight, Server, Cpu, Play, TrendingDown, Zap
} from "lucide-react";

const STATUS_CFG: Record<string, { dot: string; cls: string; label: string }> = {
  draft:     { dot: "dot-muted",   cls: "draft",     label: "DRAFT" },
  queued:    { dot: "dot-queued",  cls: "queued",    label: "QUEUED" },
  running:   { dot: "dot-running", cls: "running",   label: "RUNNING" },
  completed: { dot: "dot-done",    cls: "done",      label: "DONE" },
  failed:    { dot: "dot-failed",  cls: "failed",    label: "FAILED" },
  cancelled: { dot: "dot-muted",   cls: "cancelled", label: "CANCEL" },
};

function SimStatus({ status }: { status: string }) {
  const s = STATUS_CFG[status] ?? STATUS_CFG.draft;
  return (
    <span className={`status-badge ${s.cls}`}>
      <span className={`dot ${s.dot}`} />
      {s.label}
    </span>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading: sl } = useGetSimulationStats();
  const { data: recent, isLoading: rl } = useGetRecentSimulations();

  const kpis = [
    { label: "Total Jobs",  value: stats?.total ?? 0,     icon: Database,     accent: "hsl(var(--foreground))" },
    { label: "Running",     value: stats?.running ?? 0,   icon: Activity,     accent: "hsl(var(--primary))" },
    { label: "Completed",   value: stats?.completed ?? 0, icon: CheckCircle2, accent: "#00d084" },
    { label: "Queued",      value: stats?.queued ?? 0,    icon: Clock,        accent: "#f5a623" },
    { label: "Failed",      value: stats?.failed ?? 0,    icon: XCircle,      accent: "hsl(var(--destructive))" },
    { label: "Draft",       value: stats?.draft ?? 0,     icon: FileEdit,     accent: "hsl(var(--muted-foreground))" },
  ];

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: 6, color: "hsl(var(--primary)/0.7)" }}>
            Control Center
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.01em", lineHeight: 1 }}>Dashboard</h1>
        </div>
        <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "hsl(var(--muted-foreground))" }}>
          {new Date().toISOString().split("T")[0]}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {kpis.map(({ label, value, icon: Icon, accent }) => (
          <div key={label} className="kpi">
            <div className="flex items-center justify-between">
              <span className="kpi-label">{label}</span>
              <Icon className="w-3.5 h-3.5" style={{ color: accent, opacity: 0.55 }} />
            </div>
            {sl
              ? <Skeleton className="h-8 w-10" style={{ background: "hsl(var(--muted))" }} />
              : <span className="kpi-value" style={{ color: accent }}>{value}</span>
            }
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_272px] gap-4">

        {/* Recent simulations table */}
        <div className="panel">
          <div className="panel-header" style={{ justifyContent: "space-between" }}>
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5" style={{ color: "hsl(var(--primary))" }} />
              <span className="panel-title">Recent Simulations</span>
            </div>
            <Link
              href="/simulations"
              className="flex items-center gap-1"
              style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "hsl(var(--muted-foreground))", textDecoration: "none" }}
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Ma∞</th>
                <th>Re∞</th>
                <th>Grid</th>
                <th>Progress</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {rl
                ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j}><Skeleton className="h-3 w-full" style={{ background: "hsl(var(--muted))" }} /></td>
                    ))}
                  </tr>
                ))
                : !recent || recent.length === 0
                ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "40px 12px", color: "hsl(var(--muted-foreground))" }}>
                      No simulations yet.{" "}
                      <Link href="/simulations/new" style={{ color: "hsl(var(--primary))" }}>
                        Create one →
                      </Link>
                    </td>
                  </tr>
                )
                : recent.map((sim) => {
                    const cfg = sim.config as unknown as Record<string, unknown>;
                    const prog = sim.totalIterations
                      ? Math.round(((sim.currentIteration ?? 0) / sim.totalIterations) * 100)
                      : null;
                    return (
                      <tr key={sim.id} style={{ cursor: "pointer" }}>
                        <td>
                          <Link
                            href={`/simulations/${sim.id}`}
                            style={{ fontWeight: 700, color: "hsl(var(--foreground))", textDecoration: "none", display: "block" }}
                          >
                            {sim.name}
                          </Link>
                        </td>
                        <td><SimStatus status={sim.status} /></td>
                        <td style={{ color: "hsl(var(--muted-foreground))" }}>{String(cfg.mach ?? "—")}</td>
                        <td style={{ color: "hsl(var(--muted-foreground))" }}>
                          {cfg.reynolds ? Number(cfg.reynolds).toExponential(1) : "—"}
                        </td>
                        <td style={{ color: "hsl(var(--muted-foreground))" }}>
                          {String(cfg.gridNI ?? "?")}×{String(cfg.gridNJ ?? "?")}
                        </td>
                        <td>
                          {prog !== null ? (
                            <div className="flex items-center gap-2">
                              <div style={{ flex: 1, height: 4, background: "hsl(var(--muted))", minWidth: 40 }}>
                                <div style={{
                                  width: `${prog}%`, height: "100%",
                                  background: sim.status === "completed" ? "#00d084"
                                    : sim.status === "failed" ? "hsl(var(--destructive))"
                                    : "hsl(var(--primary))",
                                }} />
                              </div>
                              <span style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", width: 24, textAlign: "right" }}>
                                {prog}%
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: "hsl(var(--muted-foreground))" }}>—</span>
                          )}
                        </td>
                        <td style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
                          {new Date(sim.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {/* Side panels */}
        <div className="flex flex-col gap-4">

          {/* Solver status */}
          <div className="panel">
            <div className="panel-header">
              <Server className="w-3.5 h-3.5" style={{ color: "hsl(var(--primary))" }} />
              <span className="panel-title">Solver Status</span>
            </div>
            <div className="p-4 space-y-3">
              {[
                { label: "API Server", val: "localhost:8080" },
                { label: "Database",   val: "PostgreSQL" },
                { label: "Solver",     val: "CF3D v2.4.1" },
                { label: "MPI",        val: "64 ranks" },
              ].map(({ label, val }) => (
                <div key={label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2" style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
                    <span className="dot dot-online" />
                    {label}
                  </div>
                  <span style={{ fontSize: 10, color: "hsl(var(--foreground)/0.6)" }}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Compute resources */}
          <div className="panel">
            <div className="panel-header">
              <Cpu className="w-3.5 h-3.5" style={{ color: "hsl(var(--primary))" }} />
              <span className="panel-title">Compute</span>
            </div>
            <div className="p-4 space-y-3">
              {[
                { label: "CPU", used: 28 },
                { label: "Mem", used: 45 },
                { label: "I/O", used: 12 },
              ].map(({ label, used }) => (
                <div key={label} className="space-y-1">
                  <div className="flex justify-between" style={{ fontSize: 9 }}>
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>{label}</span>
                    <span style={{ color: "hsl(var(--primary))" }}>{used}%</span>
                  </div>
                  <div style={{ height: 3, background: "hsl(var(--muted))" }}>
                    <div style={{
                      width: `${used}%`, height: "100%",
                      background: used > 80 ? "hsl(var(--destructive))" : "hsl(var(--primary))",
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick launch */}
          <div className="panel">
            <div className="panel-header">
              <Zap className="w-3.5 h-3.5" style={{ color: "hsl(var(--primary))" }} />
              <span className="panel-title">Quick Launch</span>
            </div>
            <div className="p-4 space-y-2">
              <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
                Start from a validated benchmark template
              </p>
              <Link
                href="/templates"
                className="cf-btn cf-btn-primary"
                style={{ width: "100%", justifyContent: "center", textDecoration: "none" }}
              >
                <Play className="w-3 h-3" />
                Template Library
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Capabilities strip */}
      <div className="panel">
        <div className="panel-header">
          <TrendingDown className="w-3.5 h-3.5" style={{ color: "hsl(var(--primary))" }} />
          <span className="panel-title">Solver Capabilities</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4" style={{ borderTop: "none" }}>
          {[
            { label: "Max Iterations",  value: "200,000",      unit: "nsteps" },
            { label: "Disc. Schemes",   value: "E2/E4/C4/C6",  unit: "spatial" },
            { label: "Turbulence",      value: "k-Ω DES/IDDES", unit: "model" },
            { label: "Grid Capacity",   value: "1B+ nodes",    unit: "structured" },
          ].map(({ label, value, unit }, i) => (
            <div
              key={label}
              className="px-5 py-4"
              style={{ borderRight: i < 3 ? "1px solid hsl(var(--border))" : "none" }}
            >
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 4, color: "hsl(var(--muted-foreground))" }}>
                {label}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--foreground))" }}>{value}</div>
              <div style={{ fontSize: 9, marginTop: 2, color: "hsl(var(--muted-foreground)/0.6)" }}>{unit}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
