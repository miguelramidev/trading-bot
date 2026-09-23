import fs from "fs";

const file = "src/api/modules/users/infrastructure/UserController.ts";
let content = fs.readFileSync(file, "utf8");

const newEndpoint = `
// PUT /api/users/config
usersRouter.put(
  "/config",
  zValidator("json", z.object({
    binanceApiKey: z.string().optional(),
    binanceApiSecret: z.string().optional(),
  })),
  async (c) => {
    // 1. Autenticación / Middleware casero
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const firebaseUid = authHeader.split(" ")[1];

    // 2. Validación y actualización
    const data = c.req.valid("json");
    try {
      const result = await db.update(userConfig)
        .set({
          binanceApiKey: data.binanceApiKey,
          binanceApiSecret: data.binanceApiSecret,
        })
        .where(eq(userConfig.firebaseUid, firebaseUid))
        .returning();

      if (result.length === 0) {
        return c.json({ error: "User not found" }, 404);
      }

      return c.json({ success: true, message: "Configuration updated successfully" });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  }
);
`;

content = content + "\n" + newEndpoint;
fs.writeFileSync(file, content);
