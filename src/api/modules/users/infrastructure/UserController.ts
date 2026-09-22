import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../../../../db/index.js";
import { userConfig } from "../../../../db/schema.js";
import { eq } from "drizzle-orm";

export const usersRouter = new Hono();

// GET /api/users
usersRouter.get("/", async (c) => {
    const users = await db.query.userConfig.findMany();
    return c.json({ data: users });
});

// PATCH /api/users/:chatId/pause
usersRouter.patch(
  "/:chatId/pause",
  zValidator("param", z.object({
    chatId: z.string(),
  })),
  zValidator("json", z.object({
    isPaused: z.boolean(),
  })),
  async (c) => {
    const { chatId } = c.req.valid("param");
    const { isPaused } = c.req.valid("json");
    
    await db.update(userConfig)
      .set({ isPaused })
      .where(eq(userConfig.chatId, chatId));
      
    return c.json({ success: true, isPaused });
  }
);
