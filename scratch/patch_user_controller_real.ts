import fs from "fs";

let content = fs.readFileSync("src/api/modules/users/infrastructure/UserController.ts", "utf8");

content = content.replace(
  'import { encrypt } from "../../../core/utils/encryption.js";',
  'import { encrypt } from "../../../core/utils/encryption.js";\nimport crypto from "crypto";'
);

const oldConfigEndpoint = `// PUT /api/users/config
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
          binanceApiKey: data.binanceApiKey ? encrypt(data.binanceApiKey) : undefined,
          binanceApiSecret: data.binanceApiSecret ? encrypt(data.binanceApiSecret) : undefined,
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
);`;

const newConfigEndpoint = `// POST /api/users/keys/generate
usersRouter.post("/keys/generate", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const firebaseUid = authHeader.split(" ")[1];

  try {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    await db.update(userConfig)
      .set({
        rsaPublicKey: publicKey,
        rsaPrivateKey: encrypt(privateKey),
      })
      .where(eq(userConfig.firebaseUid, firebaseUid));

    return c.json({ success: true, publicKey });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// PUT /api/users/config
usersRouter.put(
  "/config",
  zValidator("json", z.object({
    binanceApiKey: z.string().optional(),
    binanceApiSecret: z.string().optional(),
    montoOperacion: z.number().optional(),
    apalancamiento: z.number().optional(),
    maxTrades: z.number().optional(),
    rsaPublicKey: z.string().optional(),
    rsaPrivateKey: z.string().optional(),
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
      const setObj: any = {};
      if (data.binanceApiKey) setObj.binanceApiKey = encrypt(data.binanceApiKey);
      if (data.binanceApiSecret) setObj.binanceApiSecret = encrypt(data.binanceApiSecret);
      if (data.montoOperacion !== undefined) setObj.montoOperacion = data.montoOperacion;
      if (data.apalancamiento !== undefined) setObj.apalancamiento = data.apalancamiento;
      if (data.maxTrades !== undefined) setObj.maxTrades = data.maxTrades;
      if (data.rsaPublicKey) setObj.rsaPublicKey = data.rsaPublicKey;
      if (data.rsaPrivateKey) setObj.rsaPrivateKey = encrypt(data.rsaPrivateKey);

      const result = await db.update(userConfig)
        .set(setObj)
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
);`;

content = content.replace(oldConfigEndpoint, newConfigEndpoint);
fs.writeFileSync("src/api/modules/users/infrastructure/UserController.ts", content);
