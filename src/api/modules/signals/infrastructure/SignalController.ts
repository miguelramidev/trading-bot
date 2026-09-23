import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../../../../db/index.js";
import { signalHistory } from "../../../../db/schema.js";
import { desc, eq } from "drizzle-orm";

export const signalsRouter = new Hono();

// GET /api/signals
// Retorna las últimas señales con páginación básica
signalsRouter.get(
  "/",
  zValidator("query", z.object({
    limit: z.string().optional().default("50"),
  })),
  async (c) => {
    const { limit: queryLimit } = c.req.valid("query");
    
    // Aquí idealmente llamaríamos al Application Service, pero 
    // para empezar conectamos el Repository/DB directo.
    const signals = await db.query.signalHistory.findMany({
      orderBy: [desc(signalHistory.evaluatedAt)],
      limit: parseInt(queryLimit)
    });
    
    return c.json({ data: signals });
  }
);

// GET /api/signals/:id
signalsRouter.get(
  "/:id",
  zValidator("param", z.object({
    id: z.string().transform((val) => parseInt(val, 10)),
  })),
  async (c) => {
    const { id } = c.req.valid("param");
    
    const signal = await db.query.signalHistory.findFirst({
      where: eq(signalHistory.id, id)
    });
    
    if (!signal) {
      return c.json({ error: "Signal not found" }, 404);
    }
    
    return c.json({ data: signal });
  }
);
