import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, templatesTable } from "@workspace/db";
import {
  CreateTemplateBody,
  GetTemplateParams,
  DeleteTemplateParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/templates", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(templatesTable)
    .orderBy(templatesTable.createdAt);

  res.json(rows.map(formatTemplate));
});

router.post("/templates", async (req, res): Promise<void> => {
  const parsed = CreateTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, description, category, config } = parsed.data;
  const [tmpl] = await db
    .insert(templatesTable)
    .values({ name, description: description ?? null, category, config })
    .returning();

  res.status(201).json(formatTemplate(tmpl));
});

router.get("/templates/:id", async (req, res): Promise<void> => {
  const params = GetTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [tmpl] = await db
    .select()
    .from(templatesTable)
    .where(eq(templatesTable.id, params.data.id));

  if (!tmpl) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  res.json(formatTemplate(tmpl));
});

router.delete("/templates/:id", async (req, res): Promise<void> => {
  const params = DeleteTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [tmpl] = await db
    .delete(templatesTable)
    .where(eq(templatesTable.id, params.data.id))
    .returning();

  if (!tmpl) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  res.sendStatus(204);
});

function formatTemplate(tmpl: typeof templatesTable.$inferSelect) {
  return {
    id: tmpl.id,
    name: tmpl.name,
    description: tmpl.description,
    category: tmpl.category,
    config: tmpl.config,
    createdAt: tmpl.createdAt.toISOString(),
  };
}

export default router;
