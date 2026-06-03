import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useCreateSimulation,
  useRunSimulation,
  useListTemplates,
  getListSimulationsQueryKey,
  getGetSimulationStatsQueryKey,
  getGetRecentSimulationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Save, Play, Check } from "lucide-react";

const DEFAULT_CONFIG = {
  flowType: 1,
  flowDimension: 3,
  gamma: 1.4,
  mach: 0.2,
  reynolds: 5000000,
  prandtl: 0.71,
  tRef: 273.11,
  domainLx: 2.33,
  domainLy: 1.0,
  domainLz: 0.5,
  nblocks: 1,
  gridNI: 257,
  gridNJ: 193,
  gridNK: 5,
  nPrimitives: 8,
  nConservative: 7,
  restart: 0,
  inletProfile: 0,
  read2dFlow: 0,
  // Mesh generation parameters
  meshTopology: 0,            // 0=H-type, 1=C-type, 2=O-type, 3=Cartesian
  clusteringType: 2,          // 0=Uniform, 1=Geometric, 2=Hyperbolic tanh, 3=Exponential
  meshStretchJ: 3.8,          // Wall-normal stretching factor
  meshStretchI: 1.0,          // Streamwise clustering
  wallSpacingJ: 5e-6,         // First cell height at wall (Δy₁)
  yPlusTarget: 1.0,           // Target y+
  stretchRatioJ: 1.18,        // Cell-to-cell growth ratio (J direction)
  stretchRatioI: 1.0,         // Streamwise growth ratio
  leadingEdgeRef: 1,          // Refine near leading edge
  trailingEdgeRef: 1,         // Refine near trailing edge
  shockRegionRef: 0,          // Shock region refinement
  nBLayers: 40,               // Number of boundary layer cells
  blThickness: 0.15,          // BL region thickness (fraction of Ly)
  meshSmoothingIter: 5,       // Mesh smoothing iterations
  meshQualityCheck: 1,        // Enable mesh quality checks
  // Discretization
  discSchemeIJ: 3,
  discSchemeK: 1,
  boundaryDiscScheme1: 4,
  boundaryDiscScheme2: 2,
  nonPeriodicI: 1,
  nonPeriodicJ: 1,
  nonPeriodicK: 0,
  // BCs
  bc1: 11,
  bc2: 21,
  bc3: 31,
  bc4: 42,
  bc5: 51,
  bc6: 61,
  // Numerics
  rkSteps: 4,
  timestepFlag: 0,
  cfl: 0.5,
  nsteps: 20000,
  filterScheme: 4,
  filterOrder: 4,
  kFilterOrder: 2,
  alphaF: 0.45,
  adaptiveFilter: 0,
  shockDir: 1,
  threshold: 1e-7,
  alphaFa: 0.4,
  // Turbulence
  turbulenceDES: 0,
  betaStar: 0.09,
  sigmaStar: 0.5,
  sigma: 0.5,
  alp: 0.5556,
  beta: 0.075,
  kappa: 0.41,
  adaptiveDES: 0,
  spatialAvg: 0,
  dynamicPrt: 0,
  timeAvg: 0,
  // Output
  updateInterval: 100,
  writeInterval: 1000,
  convergenceTolerance: 1e-10,
};

const simSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  flowType: z.coerce.number().int().min(0).max(1),
  flowDimension: z.coerce.number().int().min(2).max(3),
  gamma: z.coerce.number().positive(),
  mach: z.coerce.number().nonnegative(),
  reynolds: z.coerce.number().nonnegative(),
  prandtl: z.coerce.number().positive(),
  tRef: z.coerce.number().positive(),
  domainLx: z.coerce.number().positive(),
  domainLy: z.coerce.number().positive(),
  domainLz: z.coerce.number().positive(),
  nblocks: z.coerce.number().int().min(1),
  gridNI: z.coerce.number().int().min(2),
  gridNJ: z.coerce.number().int().min(2),
  gridNK: z.coerce.number().int().min(2),
  nPrimitives: z.coerce.number().int().min(1),
  nConservative: z.coerce.number().int().min(1),
  restart: z.coerce.number().int().min(0).max(1),
  inletProfile: z.coerce.number().int().min(0).max(1),
  read2dFlow: z.coerce.number().int().min(0).max(1),
  // Mesh
  meshTopology: z.coerce.number().int().min(0).max(3),
  clusteringType: z.coerce.number().int().min(0).max(3),
  meshStretchJ: z.coerce.number().min(1),
  meshStretchI: z.coerce.number().min(1),
  wallSpacingJ: z.coerce.number().positive(),
  yPlusTarget: z.coerce.number().positive(),
  stretchRatioJ: z.coerce.number().min(1),
  stretchRatioI: z.coerce.number().min(1),
  leadingEdgeRef: z.coerce.number().int().min(0).max(1),
  trailingEdgeRef: z.coerce.number().int().min(0).max(1),
  shockRegionRef: z.coerce.number().int().min(0).max(1),
  nBLayers: z.coerce.number().int().min(1),
  blThickness: z.coerce.number().min(0).max(1),
  meshSmoothingIter: z.coerce.number().int().min(0),
  meshQualityCheck: z.coerce.number().int().min(0).max(1),
  // Disc
  discSchemeIJ: z.coerce.number().int().min(1).max(4),
  discSchemeK: z.coerce.number().int().min(1).max(4),
  boundaryDiscScheme1: z.coerce.number().int(),
  boundaryDiscScheme2: z.coerce.number().int(),
  nonPeriodicI: z.coerce.number().int().min(0).max(1),
  nonPeriodicJ: z.coerce.number().int().min(0).max(1),
  nonPeriodicK: z.coerce.number().int().min(0).max(1),
  bc1: z.coerce.number().int(),
  bc2: z.coerce.number().int(),
  bc3: z.coerce.number().int(),
  bc4: z.coerce.number().int(),
  bc5: z.coerce.number().int(),
  bc6: z.coerce.number().int(),
  rkSteps: z.coerce.number().int().min(1).max(4),
  timestepFlag: z.coerce.number().int().min(0).max(2),
  cfl: z.coerce.number().positive(),
  nsteps: z.coerce.number().int().min(1),
  filterScheme: z.coerce.number().int(),
  filterOrder: z.coerce.number().int(),
  kFilterOrder: z.coerce.number().int(),
  alphaF: z.coerce.number().min(0).max(0.5),
  adaptiveFilter: z.coerce.number().int().min(0).max(1),
  shockDir: z.coerce.number().int(),
  threshold: z.coerce.number().positive(),
  alphaFa: z.coerce.number(),
  turbulenceDES: z.coerce.number().int().min(0).max(1),
  betaStar: z.coerce.number(),
  sigmaStar: z.coerce.number(),
  sigma: z.coerce.number(),
  alp: z.coerce.number(),
  beta: z.coerce.number(),
  kappa: z.coerce.number(),
  adaptiveDES: z.coerce.number().int().min(0).max(1),
  spatialAvg: z.coerce.number().int().min(0).max(1),
  dynamicPrt: z.coerce.number().int().min(0).max(1),
  timeAvg: z.coerce.number().int().min(0).max(1),
  updateInterval: z.coerce.number().int().min(1),
  writeInterval: z.coerce.number().int().min(1),
  convergenceTolerance: z.coerce.number().positive(),
});

type FormValues = z.infer<typeof simSchema>;

const STEPS = [
  { id: 1, label: "Flow Physics",   short: "Physics" },
  { id: 2, label: "Domain & Grid",  short: "Grid" },
  { id: 3, label: "Mesh Gen",       short: "Mesh" },
  { id: 4, label: "Disc. & Num.",   short: "Disc." },
  { id: 5, label: "Turbulence",     short: "Turb." },
  { id: 6, label: "Bound. Cond.",   short: "BCs" },
  { id: 7, label: "Output & Ctrl",  short: "Output" },
];

function SectionHeader({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-4 mt-2">
      <div className="h-px flex-1 bg-border" />
      <div className="text-center">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
        {sub && <span className="font-mono text-[9px] text-muted-foreground/50 ml-2">— {sub}</span>}
      </div>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function NumericField({ name, label, control, step, description, unit }: {
  name: keyof FormValues;
  label: string;
  control: ReturnType<typeof useForm<FormValues>>["control"];
  step?: number;
  description?: string;
  unit?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider flex items-baseline gap-1">
            {label}
            {unit && <span className="text-primary/60 font-normal normal-case tracking-normal">[{unit}]</span>}
            {description && <span className="normal-case tracking-normal text-muted-foreground/50 font-normal">— {description}</span>}
          </FormLabel>
          <FormControl>
            <Input
              type="number"
              step={step ?? "any"}
              {...field}
              className="font-mono text-sm bg-input border-border h-9"
            />
          </FormControl>
          <FormMessage className="font-mono text-xs" />
        </FormItem>
      )}
    />
  );
}

function SelectField({ name, label, control, options, description }: {
  name: keyof FormValues;
  label: string;
  control: ReturnType<typeof useForm<FormValues>>["control"];
  options: { value: string; label: string }[];
  description?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
            {label}
            {description && <span className="normal-case tracking-normal ml-2 text-muted-foreground/50 font-normal">— {description}</span>}
          </FormLabel>
          <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
            <FormControl>
              <SelectTrigger className="font-mono text-sm bg-input border-border h-9">
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent className="bg-popover border-border">
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value} className="font-mono text-sm">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage className="font-mono text-xs" />
        </FormItem>
      )}
    />
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-primary/5 border border-primary/20 px-4 py-3 mb-2">
      <p className="font-mono text-[11px] text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}

const DISC_OPTS = [
  { value: "1", label: "E2 — 2nd Order Explicit" },
  { value: "2", label: "E4 — 4th Order Explicit" },
  { value: "3", label: "C4 — 4th Order Compact" },
  { value: "4", label: "C6 — 6th Order Compact" },
];
const BC_INLET_OPTS  = [
  { value: "11", label: "11 — Subsonic Inlet" },
  { value: "12", label: "12 — Supersonic Inlet" },
  { value: "13", label: "13 — Supersonic Profile" },
  { value: "14", label: "14 — Zero Gradient" },
];
const BC_OUTLET_OPTS = [
  { value: "21", label: "21 — Subsonic Outlet" },
  { value: "22", label: "22 — Supersonic Outlet" },
];
const BC_BOTTOM_OPTS = [
  { value: "31", label: "31 — No-Slip Wall" },
  { value: "32", label: "32 — Symmetry" },
  { value: "33", label: "33 — Symmetry + Wall" },
  { value: "34", label: "34 — Periodic" },
];
const BC_TOP_OPTS = [
  { value: "41", label: "41 — No-Slip Wall" },
  { value: "42", label: "42 — Freestream" },
  { value: "43", label: "43 — Symmetry" },
  { value: "44", label: "44 — Periodic" },
];
const BC_SPAN_OPTS_5 = [{ value: "51", label: "51 — Periodic" }];
const BC_SPAN_OPTS_6 = [{ value: "61", label: "61 — Periodic" }];

export default function NewSimulation() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(simSchema),
    defaultValues: { name: "", description: "", ...DEFAULT_CONFIG },
    mode: "onChange",
  });

  const createMutation = useCreateSimulation();
  const runMutation = useRunSimulation();

  async function handleSubmit(values: FormValues, andRun: boolean) {
    const { name, description, ...rest } = values;
    try {
      const sim = await createMutation.mutateAsync({
        data: { name, description: description || undefined, config: rest },
      });
      queryClient.invalidateQueries({ queryKey: getListSimulationsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetSimulationStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetRecentSimulationsQueryKey() });
      if (andRun) {
        await runMutation.mutateAsync({ id: sim.id });
        toast({ title: "Simulation queued", description: `'${sim.name}' — ${values.nsteps.toLocaleString()} iterations` });
      } else {
        toast({ title: "Draft saved" });
      }
      setLocation(`/simulations/${sim.id}`);
    } catch {
      toast({ title: "Failed to create simulation", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-baseline gap-3">
        <div>
          <p className="font-mono text-[9px] text-primary uppercase tracking-[0.2em] mb-1">Configure Solver</p>
          <h1 className="font-mono text-2xl font-black tracking-tight text-foreground">New Simulation</h1>
        </div>
        <div className="ml-auto font-mono text-[10px] text-muted-foreground hidden md:block">
          Step {step} of {STEPS.length}
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-stretch">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-stretch flex-1 last:flex-none">
            <button
              onClick={() => setStep(s.id)}
              className={`flex items-center gap-1.5 px-2 py-2.5 border-y border-l last:border-r text-left transition-all w-full ${
                s.id === step
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : s.id < step
                  ? "bg-green-500/5 border-green-500/20 text-green-400"
                  : "bg-card border-border text-muted-foreground hover:bg-muted/30"
              }`}
            >
              <span className={`w-5 h-5 flex items-center justify-center shrink-0 font-mono text-[10px] font-bold border ${
                s.id < step ? "border-green-500/40 bg-green-500/10 text-green-400" :
                s.id === step ? "border-primary/40 bg-primary/10 text-primary" :
                "border-border text-muted-foreground"
              }`}>
                {s.id < step ? <Check className="w-2.5 h-2.5" /> : s.id}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wider hidden lg:block">{s.label}</span>
              <span className="font-mono text-[10px] uppercase tracking-wider lg:hidden">{s.short}</span>
            </button>
          </div>
        ))}
      </div>

      <Form {...form}>
        <form onSubmit={(e) => e.preventDefault()}>
          <div className="cfd-panel">
            <div className="p-6 space-y-6">

              {/* ── STEP 1: Flow Physics ── */}
              {step === 1 && (
                <div className="space-y-6">
                  <SectionHeader label="Identification" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Simulation Name *</FormLabel>
                        <FormControl>
                          <Input {...field} className="font-mono text-sm bg-input border-border h-9" placeholder="e.g. Flat Plate BL Re5M Ma0.2 DES" />
                        </FormControl>
                        <FormMessage className="font-mono text-xs" />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="description" render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Description</FormLabel>
                        <FormControl>
                          <Input {...field} className="font-mono text-sm bg-input border-border h-9" placeholder="Notes, case origin, objective…" />
                        </FormControl>
                      </FormItem>
                    )} />
                  </div>

                  <SectionHeader label="Flow Physics" />
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <SelectField name="flowType" label="Flow Type" control={form.control}
                      options={[{ value: "0", label: "0 — Inviscid (Euler)" }, { value: "1", label: "1 — Viscous (N-S)" }]} />
                    <SelectField name="flowDimension" label="Dimension" control={form.control}
                      options={[{ value: "2", label: "2D" }, { value: "3", label: "3D" }]} />
                    <NumericField name="gamma" label="γ" unit="—" control={form.control} description="specific heat ratio" step={0.001} />
                    <NumericField name="mach" label="Ma∞" unit="—" control={form.control} description="freestream Mach" step={0.001} />
                    <NumericField name="reynolds" label="Re∞" unit="—" control={form.control} description="Reynolds number" step={1} />
                    <NumericField name="prandtl" label="Pr" unit="—" control={form.control} description="Prandtl number" step={0.001} />
                    <NumericField name="tRef" label="T∞" unit="K" control={form.control} description="reference temperature" step={0.01} />
                    <NumericField name="nPrimitives" label="nPrimitives" unit="—" control={form.control} step={1} />
                    <NumericField name="nConservative" label="nConservative" unit="—" control={form.control} step={1} />
                  </div>

                  <SectionHeader label="Initialization" />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <SelectField name="restart" label="Restart" control={form.control}
                      options={[{ value: "0", label: "0 — Cold Start" }, { value: "1", label: "1 — Restart from file" }]} />
                    <SelectField name="inletProfile" label="Inlet Profile" control={form.control}
                      options={[{ value: "0", label: "0 — Uniform" }, { value: "1", label: "1 — From file" }]} />
                    <SelectField name="read2dFlow" label="Read 2D Flow" control={form.control}
                      options={[{ value: "0", label: "0 — OFF" }, { value: "1", label: "1 — ON (extrude)" }]} />
                  </div>
                </div>
              )}

              {/* ── STEP 2: Domain & Grid ── */}
              {step === 2 && (
                <div className="space-y-6">
                  <SectionHeader label="Computational Domain" />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <NumericField name="domainLx" label="Lx" unit="m" control={form.control} description="streamwise length" step={0.01} />
                    <NumericField name="domainLy" label="Ly" unit="m" control={form.control} description="wall-normal height" step={0.01} />
                    <NumericField name="domainLz" label="Lz" unit="m" control={form.control} description="spanwise width" step={0.01} />
                  </div>

                  <SectionHeader label="Grid Resolution" sub="total nodes = NI × NJ × NK" />
                  <InfoBox>
                    Grid points determine resolution. For DNS: NI≥512, NJ≥256, NK≥128. For RANS/DES: NI=257, NJ=193 is typical for Re≈5×10⁶. NK≥3 for quasi-2D; NK≥64 for full 3D spanwise resolution.
                  </InfoBox>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <NumericField name="nblocks" label="nblocks" unit="—" control={form.control} step={1} />
                    <NumericField name="gridNI" label="NI" unit="pts" control={form.control} description="streamwise" step={1} />
                    <NumericField name="gridNJ" label="NJ" unit="pts" control={form.control} description="wall-normal" step={1} />
                    <NumericField name="gridNK" label="NK" unit="pts" control={form.control} description="spanwise" step={1} />
                  </div>

                  <SectionHeader label="Periodicity" />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <SelectField name="nonPeriodicI" label="I direction" control={form.control}
                      options={[{ value: "0", label: "0 — Periodic" }, { value: "1", label: "1 — Non-Periodic" }]} />
                    <SelectField name="nonPeriodicJ" label="J direction" control={form.control}
                      options={[{ value: "0", label: "0 — Periodic" }, { value: "1", label: "1 — Non-Periodic" }]} />
                    <SelectField name="nonPeriodicK" label="K direction" control={form.control}
                      options={[{ value: "0", label: "0 — Periodic" }, { value: "1", label: "1 — Non-Periodic" }]} />
                  </div>
                </div>
              )}

              {/* ── STEP 3: Mesh Generation ── */}
              {step === 3 && (
                <div className="space-y-6">
                  <SectionHeader label="Mesh Topology" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SelectField name="meshTopology" label="Topology" control={form.control}
                      options={[
                        { value: "0", label: "H-type — Parallel body-fitted" },
                        { value: "1", label: "C-type — Wrapped around LE/TE" },
                        { value: "2", label: "O-type — Full wrap (cylinders)" },
                        { value: "3", label: "Cartesian — Axis-aligned" },
                      ]}
                      description="Grid topology determines cell distribution" />
                    <SelectField name="clusteringType" label="Clustering Algorithm" control={form.control}
                      options={[
                        { value: "0", label: "0 — Uniform (no clustering)" },
                        { value: "1", label: "1 — Geometric progression" },
                        { value: "2", label: "2 — Hyperbolic tangent (Vinokur)" },
                        { value: "3", label: "3 — Exponential (one-sided)" },
                      ]}
                      description="Distribution function for wall-normal points" />
                  </div>

                  <SectionHeader label="Wall-Normal Clustering (J direction)" sub="boundary layer resolution" />
                  <InfoBox>
                    For y+ ≈ 1 (required for RANS k-ω): Δy₁ = y+ × μ / (ρ × u_τ). Typical values for Re=5×10⁶: Δy₁ ≈ 5×10⁻⁶ m. Growth ratio should be 1.10–1.25 for smooth clustering.
                  </InfoBox>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <NumericField name="wallSpacingJ" label="Δy₁ (wall)" unit="m" control={form.control} description="first cell height" step={1e-7} />
                    <NumericField name="yPlusTarget" label="y⁺ target" unit="—" control={form.control} description="dimensionless wall dist." step={0.1} />
                    <NumericField name="stretchRatioJ" label="Growth ratio J" unit="—" control={form.control} description="cell-to-cell ratio (1.1–1.25)" step={0.01} />
                    <NumericField name="meshStretchJ" label="Stretch factor J" unit="—" control={form.control} description="tanh/exp parameter" step={0.1} />
                    <NumericField name="nBLayers" label="BL cells" unit="pts" control={form.control} description="cells in BL region" step={1} />
                    <NumericField name="blThickness" label="BL thickness" unit="%" control={form.control} description="fraction of Ly for BL" step={0.01} />
                  </div>

                  <SectionHeader label="Streamwise Clustering (I direction)" />
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <NumericField name="meshStretchI" label="Stretch factor I" unit="—" control={form.control} description="LE/TE clustering" step={0.1} />
                    <NumericField name="stretchRatioI" label="Growth ratio I" unit="—" control={form.control} description="streamwise growth" step={0.01} />
                    <SelectField name="leadingEdgeRef" label="LE Refinement" control={form.control}
                      options={[{ value: "0", label: "0 — OFF" }, { value: "1", label: "1 — ON (cluster at x=0)" }]} />
                    <SelectField name="trailingEdgeRef" label="TE Refinement" control={form.control}
                      options={[{ value: "0", label: "0 — OFF" }, { value: "1", label: "1 — ON (cluster at x=Lx)" }]} />
                    <SelectField name="shockRegionRef" label="Shock Refinement" control={form.control}
                      options={[{ value: "0", label: "0 — OFF" }, { value: "1", label: "1 — ON (for Ma>1)" }]} />
                  </div>

                  <SectionHeader label="Mesh Quality" />
                  <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
                    <NumericField name="meshSmoothingIter" label="Smoothing iters" unit="—" control={form.control} description="Laplacian smoothing" step={1} />
                    <SelectField name="meshQualityCheck" label="Quality check" control={form.control}
                      options={[{ value: "0", label: "0 — Skip" }, { value: "1", label: "1 — Check & warn" }]}
                      description="Validate min angle, aspect ratio" />
                  </div>
                </div>
              )}

              {/* ── STEP 4: Disc. & Numerics ── */}
              {step === 4 && (
                <div className="space-y-6">
                  <SectionHeader label="Spatial Discretization" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SelectField name="discSchemeIJ" label="Scheme I,J" control={form.control} options={DISC_OPTS} description="interior faces" />
                    <SelectField name="discSchemeK" label="Scheme K" control={form.control} options={DISC_OPTS} description="spanwise" />
                    <NumericField name="boundaryDiscScheme1" label="Boundary Disc. 1" unit="—" control={form.control} step={1} />
                    <NumericField name="boundaryDiscScheme2" label="Boundary Disc. 2" unit="—" control={form.control} step={1} />
                  </div>

                  <SectionHeader label="Time Integration" />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <SelectField name="rkSteps" label="RK stages" control={form.control}
                      options={[1,2,3,4].map(v => ({ value: String(v), label: `RK${v}` }))}
                      description="Runge-Kutta order" />
                    <SelectField name="timestepFlag" label="Δt mode" control={form.control}
                      options={[
                        { value: "0", label: "0 — Fixed (CFL)" },
                        { value: "1", label: "1 — Variable global" },
                        { value: "2", label: "2 — Local (best conv.)" },
                      ]} />
                    <NumericField name="cfl" label="CFL" unit="—" control={form.control} description="Courant number" step={0.01} />
                    <NumericField name="nsteps" label="nsteps" unit="iters" control={form.control} description="total iterations" step={1000} />
                  </div>
                  <InfoBox>
                    nsteps=20,000 is the recommended minimum for turbulent BL simulations. DNS cases may require 50,000–200,000. RANS cases typically converge in 5,000–15,000.
                  </InfoBox>

                  <SectionHeader label="Spatial Filtering" />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <NumericField name="filterScheme" label="Filter scheme" unit="—" control={form.control} step={1} />
                    <NumericField name="filterOrder" label="Order IJ" unit="—" control={form.control} step={1} />
                    <NumericField name="kFilterOrder" label="Order K" unit="—" control={form.control} step={1} />
                    <NumericField name="alphaF" label="α_f" unit="—" control={form.control} description="0.40–0.499 (higher=more dissipation)" step={0.01} />
                  </div>

                  <SectionHeader label="Shock Capturing" />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <SelectField name="adaptiveFilter" label="Adaptive filter" control={form.control}
                      options={[{ value: "0", label: "0 — OFF" }, { value: "1", label: "1 — ON" }]} />
                    <NumericField name="shockDir" label="Shock direction" unit="—" control={form.control} step={1} />
                    <NumericField name="threshold" label="Threshold" unit="—" control={form.control} step={1e-9} />
                    <NumericField name="alphaFa" label="α_fa" unit="—" control={form.control} step={0.01} />
                  </div>
                </div>
              )}

              {/* ── STEP 5: Turbulence ── */}
              {step === 5 && (
                <div className="space-y-6">
                  <SectionHeader label="Turbulence Model" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SelectField name="turbulenceDES" label="Model" control={form.control}
                      options={[
                        { value: "0", label: "0 — Laminar / DNS (no model)" },
                        { value: "1", label: "1 — k-Omega SST DES" },
                      ]} />
                  </div>
                  <InfoBox>
                    k-Omega SST DES: RANS near walls (RANS→DES switch based on Δ/LRANS). Requires y⁺≈1 near wall. Suitable for separated flows, BL transition, and high-Re external aerodynamics.
                  </InfoBox>

                  <SectionHeader label="k-Ω SST Coefficients" sub="Wilcox 2006 defaults" />
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <NumericField name="betaStar" label="β*" unit="—" control={form.control} description="0.09" step={0.001} />
                    <NumericField name="sigmaStar" label="σ*" unit="—" control={form.control} description="0.5" step={0.001} />
                    <NumericField name="sigma" label="σ" unit="—" control={form.control} description="0.5" step={0.001} />
                    <NumericField name="alp" label="α" unit="—" control={form.control} description="5/9 ≈ 0.5556" step={0.0001} />
                    <NumericField name="beta" label="β" unit="—" control={form.control} description="0.075" step={0.001} />
                    <NumericField name="kappa" label="κ" unit="—" control={form.control} description="Von Kármán const." step={0.001} />
                  </div>

                  <SectionHeader label="Advanced DES / LES Options" />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <SelectField name="adaptiveDES" label="Adaptive DES" control={form.control}
                      options={[{ value: "0", label: "0 — OFF" }, { value: "1", label: "1 — ON (IDDES)" }]} />
                    <SelectField name="spatialAvg" label="Spatial avg." control={form.control}
                      options={[{ value: "0", label: "0 — OFF" }, { value: "1", label: "1 — ON (span avg.)" }]} />
                    <SelectField name="dynamicPrt" label="Dynamic Prt" control={form.control}
                      options={[{ value: "0", label: "0 — OFF" }, { value: "1", label: "1 — ON (Germano)" }]} />
                    <SelectField name="timeAvg" label="Time averaging" control={form.control}
                      options={[{ value: "0", label: "0 — OFF" }, { value: "1", label: "1 — ON (mean flow)" }]} />
                  </div>
                </div>
              )}

              {/* ── STEP 6: BCs ── */}
              {step === 6 && (
                <div className="space-y-6">
                  <InfoBox>
                    Face numbering: 1=I-min (Inlet), 2=I-max (Outlet), 3=J-min (Bottom/Wall), 4=J-max (Top/Freestream), 5=K-min (Front span), 6=K-max (Back span). Color-coded in the Mesh viewer.
                  </InfoBox>
                  <SectionHeader label="Boundary Conditions" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SelectField name="bc1" label="Face 1 — Inlet (I-min)" control={form.control} options={BC_INLET_OPTS} />
                    <SelectField name="bc2" label="Face 2 — Outlet (I-max)" control={form.control} options={BC_OUTLET_OPTS} />
                    <SelectField name="bc3" label="Face 3 — Bottom (J-min)" control={form.control} options={BC_BOTTOM_OPTS} />
                    <SelectField name="bc4" label="Face 4 — Top (J-max)" control={form.control} options={BC_TOP_OPTS} />
                    <SelectField name="bc5" label="Face 5 — Front (K-min)" control={form.control} options={BC_SPAN_OPTS_5} />
                    <SelectField name="bc6" label="Face 6 — Back (K-max)" control={form.control} options={BC_SPAN_OPTS_6} />
                  </div>
                </div>
              )}

              {/* ── STEP 7: Output & Control ── */}
              {step === 7 && (
                <div className="space-y-6">
                  <SectionHeader label="Output Control" />
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <NumericField name="updateInterval" label="Update interval" unit="iters" control={form.control} description="residual print freq." step={10} />
                    <NumericField name="writeInterval" label="Write interval" unit="iters" control={form.control} description="field file output freq." step={100} />
                    <NumericField name="convergenceTolerance" label="Conv. tolerance" unit="—" control={form.control} description="stop when residual < tol" step={1e-12} />
                  </div>
                  <InfoBox>
                    For 20,000 iteration runs: updateInterval=100, writeInterval=1000 is recommended to keep log output manageable. Lower writeInterval produces more field snapshots for post-processing.
                  </InfoBox>

                  {/* Summary */}
                  <SectionHeader label="Configuration Summary" />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: "Total Nodes", value: `${(form.watch("gridNI") * form.watch("gridNJ") * form.watch("gridNK")).toLocaleString()}` },
                      { label: "Iterations", value: form.watch("nsteps").toLocaleString() },
                      { label: "Mach", value: String(form.watch("mach")) },
                      { label: "Re", value: Number(form.watch("reynolds")).toExponential(2) },
                      { label: "Turbulence", value: form.watch("turbulenceDES") === 1 ? "k-ω DES" : "Laminar" },
                      { label: "y⁺ target", value: String(form.watch("yPlusTarget")) },
                      { label: "CFL", value: String(form.watch("cfl")) },
                      { label: "Disc.", value: ["—","E2","E4","C4","C6"][form.watch("discSchemeIJ")] ?? "?" },
                    ].map(({ label, value }) => (
                      <div key={label} className="cfd-kpi">
                        <span className="cfd-kpi-label">{label}</span>
                        <span className="font-mono text-sm font-bold text-foreground">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer nav */}
            <div className="px-6 py-4 border-t border-border bg-muted/20 flex items-center justify-between gap-3">
              <Button
                variant="outline"
                size="sm"
                className="font-mono text-xs gap-2"
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                disabled={step === 1}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Back
              </Button>

              <div className="flex gap-2">
                {step < STEPS.length ? (
                  <Button
                    size="sm"
                    className="font-mono text-xs gap-2"
                    onClick={() => setStep((s) => Math.min(STEPS.length, s + 1))}
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="font-mono text-xs gap-2"
                      onClick={() => form.handleSubmit((v) => handleSubmit(v, false))()}
                      disabled={createMutation.isPending}
                    >
                      <Save className="w-3.5 h-3.5" /> Save Draft
                    </Button>
                    <Button
                      size="sm"
                      className="font-mono text-xs gap-2"
                      onClick={() => form.handleSubmit((v) => handleSubmit(v, true))()}
                      disabled={createMutation.isPending || runMutation.isPending}
                    >
                      <Play className="w-3.5 h-3.5" />
                      Save &amp; Run
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
