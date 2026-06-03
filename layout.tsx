import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Wind, Sun, Moon, Plus, Activity } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

const NAV = [
  { href: "/",                label: "Dashboard",   match: (p: string) => p === "/" },
  { href: "/simulations",     label: "Simulations", match: (p: string) => p === "/simulations" || (p.startsWith("/simulations") && !p.startsWith("/simulations/new")) },
  { href: "/simulations/new", label: "New Sim",     match: (p: string) => p === "/simulations/new" },
  { href: "/templates",       label: "Templates",   match: (p: string) => p === "/templates" },
];

function Clock() {
  const [time, setTime] = useState(() => new Date().toISOString().replace("T", " ").slice(0, 19));
  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toISOString().replace("T", " ").slice(0, 19)), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums">{time} UTC</span>;
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") { root.classList.add("dark"); root.classList.remove("light"); }
    else { root.classList.add("light"); root.classList.remove("dark"); }
  }, [theme]);

  return (
    <div className="flex flex-col min-h-[100dvh] bg-background text-foreground">

      {/* ── System status bar ── */}
      <div
        className="h-7 flex items-center px-5 gap-6 border-b border-[hsl(var(--sidebar-border))] flex-shrink-0"
        style={{ background: "hsl(var(--sidebar))" }}
      >
        <div className="flex items-center gap-1.5" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 700, color: "hsl(var(--primary))" }}>
          <span className="dot dot-online" />
          System Online
        </div>
        <div className="h-3 w-px" style={{ background: "hsl(var(--sidebar-border))" }} />
        <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "hsl(220 15% 40%)" }}>
          CF3D Fortran Solver v2.4.1 · Float64 · MPI-Ready
        </span>
        <div className="ml-auto" style={{ fontSize: 9, letterSpacing: "0.05em", color: "hsl(220 15% 38%)" }}>
          <Clock />
        </div>
      </div>

      {/* ── Main nav bar ── */}
      <nav
        className="h-12 flex-none flex items-stretch border-b border-[hsl(var(--border))] sticky top-0 z-50"
        style={{ background: "hsl(222 47% 5% / 0.96)", backdropFilter: "blur(12px)" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 border-r border-[hsl(var(--border))]">
          <div
            className="w-7 h-7 flex items-center justify-center relative"
            style={{ background: "hsl(var(--primary)/0.1)", border: "1px solid hsl(var(--primary)/0.3)" }}
          >
            <Wind className="w-3.5 h-3.5" style={{ color: "hsl(var(--primary))" }} />
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2" style={{ background: "hsl(var(--primary))" }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.25em", textTransform: "uppercase", lineHeight: 1, color: "hsl(var(--primary))" }}>
              CF3D
            </div>
            <div style={{ fontSize: 7, letterSpacing: "0.2em", textTransform: "uppercase", lineHeight: 1, marginTop: 2, color: "hsl(220 15% 38%)" }}>
              Sim Platform
            </div>
          </div>
        </div>

        {/* Nav items */}
        <div className="flex items-stretch">
          {NAV.map(({ href, label, match }) => {
            const isActive = match(location);
            return (
              <Link
                key={href}
                href={href}
                className="nav-item"
                style={isActive ? { color: "hsl(var(--primary))", borderBottomColor: "hsl(var(--primary))" } : {}}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-2 pr-4">
          <Link
            href="/simulations/new"
            className="cf-btn cf-btn-primary"
            style={{ padding: "5px 12px", fontSize: "9px", textDecoration: "none" }}
          >
            <Plus className="w-3 h-3" />
            New Simulation
          </Link>

          <div className="h-6 w-px mx-1" style={{ background: "hsl(var(--border))" }} />

          <button
            onClick={toggle}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28,
              border: "1px solid hsl(var(--border))",
              background: "transparent",
              color: "hsl(var(--muted-foreground))",
              cursor: "pointer",
            }}
          >
            {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </nav>

      {/* ── Page content ── */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[1440px] px-6 py-7">
          {children}
        </div>
      </main>

      {/* ── Bottom status bar ── */}
      <div
        className="h-6 flex items-center px-5 gap-5 border-t border-[hsl(var(--sidebar-border))] flex-shrink-0"
        style={{ background: "hsl(var(--sidebar))" }}
      >
        {[
          ["CF3D", "v2.4.1"],
          ["Build", "Fortran 2018"],
          ["Precision", "Float64"],
          ["MPI", "Enabled"],
          ["OpenMP", "64 threads"],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center gap-1" style={{ fontSize: 9, color: "hsl(220 15% 38%)" }}>
            <span style={{ color: "hsl(220 15% 28%)" }}>{label}:</span>
            <span>{value}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-1.5" style={{ fontSize: 9, color: "hsl(var(--primary)/0.6)" }}>
          <Activity className="w-2.5 h-2.5" />
          <span>API 8080 · UI 18229</span>
        </div>
      </div>
    </div>
  );
}
