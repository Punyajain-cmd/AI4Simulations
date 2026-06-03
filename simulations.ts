import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, simulationsTable, residualsTable, logsTable } from "@workspace/db";
import {
  ListSimulationsQueryParams,
  CreateSimulationBody,
  GetSimulationParams,
  UpdateSimulationParams,
  UpdateSimulationBody,
  DeleteSimulationParams,
  RunSimulationParams,
  CancelSimulationParams,
  GetSimulationResidualsParams,
  GetSimulationLogsParams,
  GenerateInputFileParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// GET /simulations
router.get("/simulations", async (req, res): Promise<void> => {
  const parsed = ListSimulationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { status, limit, offset } = parsed.data;

  let query = db.select().from(simulationsTable).$dynamic();
  if (status) {
    query = query.where(eq(simulationsTable.status, status as typeof simulationsTable.status._.data));
  }
  const rows = await query
    .orderBy(desc(simulationsTable.createdAt))
    .limit(limit ?? 50)
    .offset(offset ?? 0);

  res.json(rows.map(formatSimulation));
});

// POST /simulations
router.post("/simulations", async (req, res): Promise<void> => {
  const parsed = CreateSimulationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, description, config } = parsed.data;

  const [sim] = await db
    .insert(simulationsTable)
    .values({ name, description: description ?? null, config, status: "draft" })
    .returning();

  res.status(201).json(formatSimulation(sim));
});

// GET /simulations/stats
router.get("/simulations/stats", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      status: simulationsTable.status,
      count: sql<number>`count(*)::int`,
    })
    .from(simulationsTable)
    .groupBy(simulationsTable.status);

  const stats = {
    total: 0,
    draft: 0,
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  } as Record<string, number>;

  for (const row of rows) {
    stats[row.status] = row.count;
    stats.total += row.count;
  }

  res.json(stats);
});

// GET /simulations/recent
router.get("/simulations/recent", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(simulationsTable)
    .orderBy(desc(simulationsTable.createdAt))
    .limit(10);

  res.json(rows.map(formatSimulation));
});

// GET /simulations/:id
router.get("/simulations/:id", async (req, res): Promise<void> => {
  const params = GetSimulationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [sim] = await db
    .select()
    .from(simulationsTable)
    .where(eq(simulationsTable.id, params.data.id));

  if (!sim) {
    res.status(404).json({ error: "Simulation not found" });
    return;
  }
  res.json(formatSimulation(sim));
});

// PATCH /simulations/:id
router.patch("/simulations/:id", async (req, res): Promise<void> => {
  const params = UpdateSimulationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateSimulationBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (body.data.name !== undefined) updates.name = body.data.name;
  if (body.data.description !== undefined) updates.description = body.data.description;
  if (body.data.config !== undefined) updates.config = body.data.config;

  const [sim] = await db
    .update(simulationsTable)
    .set(updates)
    .where(eq(simulationsTable.id, params.data.id))
    .returning();

  if (!sim) {
    res.status(404).json({ error: "Simulation not found" });
    return;
  }
  res.json(formatSimulation(sim));
});

// DELETE /simulations/:id
router.delete("/simulations/:id", async (req, res): Promise<void> => {
  const params = DeleteSimulationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [sim] = await db
    .delete(simulationsTable)
    .where(eq(simulationsTable.id, params.data.id))
    .returning();

  if (!sim) {
    res.status(404).json({ error: "Simulation not found" });
    return;
  }
  res.sendStatus(204);
});

// POST /simulations/:id/run
router.post("/simulations/:id/run", async (req, res): Promise<void> => {
  const params = RunSimulationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(simulationsTable)
    .where(eq(simulationsTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Simulation not found" });
    return;
  }
  if (!["draft", "failed", "cancelled"].includes(existing.status)) {
    res.status(400).json({ error: `Cannot run simulation in '${existing.status}' state` });
    return;
  }

  const cfg = existing.config as Record<string, unknown>;
  const totalIter = (cfg?.nsteps as number) ?? 1000;

  const [sim] = await db
    .update(simulationsTable)
    .set({
      status: "running",
      startedAt: new Date(),
      completedAt: null,
      errorMessage: null,
      currentIteration: 0,
      totalIterations: totalIter,
    })
    .where(eq(simulationsTable.id, params.data.id))
    .returning();

  await db.insert(logsTable).values({
    simulationId: sim.id,
    level: "info",
    message: `Simulation '${sim.name}' submitted to queue. nsteps=${totalIter}`,
  });

  // Simulate progress asynchronously (mock solver behavior)
  simulateSolverProgress(sim.id, totalIter, cfg).catch(() => {});

  res.json(formatSimulation(sim));
});

// POST /simulations/:id/cancel
router.post("/simulations/:id/cancel", async (req, res): Promise<void> => {
  const params = CancelSimulationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(simulationsTable)
    .where(eq(simulationsTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Simulation not found" });
    return;
  }
  if (!["queued", "running"].includes(existing.status)) {
    res.status(400).json({ error: `Cannot cancel simulation in '${existing.status}' state` });
    return;
  }

  const [sim] = await db
    .update(simulationsTable)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(eq(simulationsTable.id, params.data.id))
    .returning();

  await db.insert(logsTable).values({
    simulationId: sim.id,
    level: "warn",
    message: `Simulation cancelled by user at iteration ${existing.currentIteration ?? 0}`,
  });

  res.json(formatSimulation(sim));
});

// GET /simulations/:id/residuals
router.get("/simulations/:id/residuals", async (req, res): Promise<void> => {
  const params = GetSimulationResidualsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db
    .select({ id: simulationsTable.id })
    .from(simulationsTable)
    .where(eq(simulationsTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Simulation not found" });
    return;
  }

  const rows = await db
    .select()
    .from(residualsTable)
    .where(eq(residualsTable.simulationId, params.data.id))
    .orderBy(residualsTable.iteration);

  res.json(
    rows.map((r) => ({
      iteration: r.iteration,
      rhoResidual: r.rhoResidual,
      rhuResidual: r.rhuResidual,
      rhvResidual: r.rhvResidual,
      rhwResidual: r.rhwResidual,
      rheResidual: r.rheResidual,
      rhKeResidual: r.rhKeResidual,
      rhOmgResidual: r.rhOmgResidual,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

// GET /simulations/:id/logs
router.get("/simulations/:id/logs", async (req, res): Promise<void> => {
  const params = GetSimulationLogsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db
    .select({ id: simulationsTable.id })
    .from(simulationsTable)
    .where(eq(simulationsTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Simulation not found" });
    return;
  }

  const rows = await db
    .select()
    .from(logsTable)
    .where(eq(logsTable.simulationId, params.data.id))
    .orderBy(desc(logsTable.createdAt))
    .limit(200);

  res.json(
    rows.map((l) => ({
      id: l.id,
      level: l.level,
      message: l.message,
      iteration: l.iteration,
      createdAt: l.createdAt.toISOString(),
    }))
  );
});

// GET /simulations/:id/generate-input
router.get("/simulations/:id/generate-input", async (req, res): Promise<void> => {
  const params = GenerateInputFileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [sim] = await db
    .select()
    .from(simulationsTable)
    .where(eq(simulationsTable.id, params.data.id));

  if (!sim) {
    res.status(404).json({ error: "Simulation not found" });
    return;
  }

  const c = sim.config as Record<string, unknown>;
  const content = generateInputDat(c);
  res.json({ content });
});

// ── Helpers ───────────────────────────────────────────────────────────────

function formatSimulation(sim: typeof simulationsTable.$inferSelect) {
  return {
    id: sim.id,
    name: sim.name,
    description: sim.description,
    status: sim.status,
    config: sim.config,
    currentIteration: sim.currentIteration,
    totalIterations: sim.totalIterations,
    cpuTimeSeconds: sim.cpuTimeSeconds,
    errorMessage: sim.errorMessage,
    startedAt: sim.startedAt?.toISOString() ?? null,
    completedAt: sim.completedAt?.toISOString() ?? null,
    createdAt: sim.createdAt.toISOString(),
    updatedAt: sim.updatedAt.toISOString(),
  };
}

function generateInputDat(c: Record<string, unknown>): string {
  const pad = (s: string) => s.padEnd(36);
  const line = (key: string, val: unknown) => `${pad(String(val))} ! ${key}`;

  return [
    "! CF3D Solver Input File",
    `! Generated by CF3D SIM Platform on ${new Date().toISOString()}`,
    "!",
    line("flowType (0=inviscid, 1=viscous)", c.flowType),
    line("flowDimension (2=2D, 3=3D)", c.flowDimension),
    line("gamma", c.gamma),
    line("Mach number", c.mach),
    line("Reynolds number", c.reynolds),
    line("Prandtl number", c.prandtl),
    line("T_ref (K)", c.tRef),
    line("domain Lx", c.domainLx),
    line("domain Ly", c.domainLy),
    line("domain Lz", c.domainLz),
    line("nblocks", c.nblocks),
    line("NI (grid pts I)", c.gridNI),
    line("NJ (grid pts J)", c.gridNJ),
    line("NK (grid pts K)", c.gridNK),
    line("nPrimitives", c.nPrimitives),
    line("nConservative", c.nConservative),
    line("restart (0=OFF 1=ON)", c.restart),
    line("inletProfile (0=OFF 1=ON)", c.inletProfile),
    line("read2dFlow (0=OFF 1=ON)", c.read2dFlow),
    line("discSchemeIJ (1=E2 2=E4 3=C4 4=C6)", c.discSchemeIJ),
    line("discSchemeK  (1=E2 2=E4 3=C4 4=C6)", c.discSchemeK),
    line("boundaryDiscScheme1", c.boundaryDiscScheme1),
    line("boundaryDiscScheme2", c.boundaryDiscScheme2),
    line("nonPeriodicI", c.nonPeriodicI),
    line("nonPeriodicJ", c.nonPeriodicJ),
    line("nonPeriodicK", c.nonPeriodicK),
    line("BC face 1 (inlet)", c.bc1),
    line("BC face 2 (outlet)", c.bc2),
    line("BC face 3 (bottom)", c.bc3),
    line("BC face 4 (top)", c.bc4),
    line("BC face 5 (front)", c.bc5),
    line("BC face 6 (back)", c.bc6),
    line("RK steps", c.rkSteps),
    line("timestepFlag (0=Fixed 1=Var 2=Local)", c.timestepFlag),
    line("CFL number", c.cfl),
    line("nsteps", c.nsteps),
    line("filterScheme", c.filterScheme),
    line("filterOrder (IJ)", c.filterOrder),
    line("filterOrder (K)", c.kFilterOrder),
    line("alpha_f", c.alphaF),
    line("adaptiveFilter (0=OFF 1=ON)", c.adaptiveFilter),
    line("shockDir", c.shockDir),
    line("threshold", c.threshold),
    line("alpha_fa", c.alphaFa),
    line("turbulenceDES (0=None 1=k-Omega)", c.turbulenceDES),
    line("beta_star", c.betaStar),
    line("sigma_star", c.sigmaStar),
    line("sigma", c.sigma),
    line("alpha (alp)", c.alp),
    line("beta", c.beta),
    line("kappa", c.kappa),
    line("adaptiveDES (0=OFF 1=ON)", c.adaptiveDES),
    line("spatialAvg (0=OFF 1=ON)", c.spatialAvg),
    line("dynamicPrt (0=OFF 1=ON)", c.dynamicPrt),
    line("timeAvg (0=OFF 1=ON)", c.timeAvg),
    line("updateInterval", c.updateInterval),
    line("writeInterval", c.writeInterval),
  ].join("\n");
}

// Mock solver: writes residuals + logs over time
async function simulateSolverProgress(
  simId: number,
  totalSteps: number,
  cfg: Record<string, unknown>
) {
  const hasTurbulence = (cfg.turbulenceDES as number) === 1;
  const startTime = Date.now();
  const batchSize = Math.max(1, Math.floor(totalSteps / 20));

  let rho = 1e-1;
  let rhu = 8e-2;
  let rhv = 6e-2;
  let rhw = 4e-2;
  let rhe = 5e-2;
  let rhKe = hasTurbulence ? 7e-3 : null;
  let rhOmg = hasTurbulence ? 9e-3 : null;

  const decayRate = 0.92 + Math.random() * 0.04;

  for (let iter = batchSize; iter <= totalSteps; iter += batchSize) {
    await sleep(800);

    // Check if cancelled
    const [current] = await db
      .select({ status: simulationsTable.status })
      .from(simulationsTable)
      .where(eq(simulationsTable.id, simId));

    if (!current || current.status === "cancelled") return;

    const noise = () => 1 + (Math.random() - 0.5) * 0.1;
    rho *= decayRate * noise();
    rhu *= decayRate * noise();
    rhv *= decayRate * noise();
    rhw *= decayRate * noise();
    rhe *= decayRate * noise();
    if (rhKe !== null) rhKe *= (decayRate - 0.02) * noise();
    if (rhOmg !== null) rhOmg *= (decayRate - 0.02) * noise();

    await db.insert(residualsTable).values({
      simulationId: simId,
      iteration: iter,
      rhoResidual: rho,
      rhuResidual: rhu,
      rhvResidual: rhv,
      rhwResidual: rhw,
      rheResidual: rhe,
      rhKeResidual: rhKe,
      rhOmgResidual: rhOmg,
    });

    const cpuTime = (Date.now() - startTime) / 1000;

    await db
      .update(simulationsTable)
      .set({ currentIteration: iter, cpuTimeSeconds: cpuTime })
      .where(eq(simulationsTable.id, simId));

    if (iter % (batchSize * 4) === 0) {
      await db.insert(logsTable).values({
        simulationId: simId,
        level: "info",
        message: `iter=${iter}/${totalSteps}  rho=${rho.toExponential(3)}  rhu=${rhu.toExponential(3)}  rhe=${rhe.toExponential(3)}`,
        iteration: iter,
      });
    }
  }

  const cpuTime = (Date.now() - startTime) / 1000;
  await db
    .update(simulationsTable)
    .set({
      status: "completed",
      currentIteration: totalSteps,
      completedAt: new Date(),
      cpuTimeSeconds: cpuTime,
    })
    .where(eq(simulationsTable.id, simId));

  await db.insert(logsTable).values({
    simulationId: simId,
    level: "info",
    message: `Simulation completed successfully. Total CPU time: ${cpuTime.toFixed(2)}s`,
    iteration: totalSteps,
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default router;
