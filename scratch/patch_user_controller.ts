import fs from "fs";

let content = fs.readFileSync("src/api/modules/users/infrastructure/UserController.ts", "utf8");

const oldEndpoint = `  // Actualizar configuración (ej. Llave de Binance y su Secret)
  router.put('/config', authMiddleware, async (c) => {
    const userUid = c.get('userUid');
    const body = await c.req.json();

    const { binanceApiKey, binanceApiSecret } = body;

    // TODO: Aquí deberíamos insertar/actualizar en Drizzle
    const existing = await db.query.userConfig.findFirst({
      where: eq(userConfig.firebaseUid, userUid)
    });

    if (existing) {
      await db.update(userConfig)
        .set({
          binanceApiKey: binanceApiKey ? encrypt(binanceApiKey) : existing.binanceApiKey,
          binanceApiSecret: binanceApiSecret ? encrypt(binanceApiSecret) : existing.binanceApiSecret,
          updatedAt: new Date()
        })
        .where(eq(userConfig.firebaseUid, userUid));
    }

    return c.json({ success: true, message: 'Configuración actualizada' });
  });`;

const newEndpoint = `  // Actualizar configuración
  router.put('/config', authMiddleware, async (c) => {
    const userUid = c.get('userUid');
    const body = await c.req.json();

    const { 
      binanceApiKey, 
      binanceApiSecret,
      montoOperacion,
      apalancamiento,
      maxTrades,
      rsaPublicKey,
      rsaPrivateKey
    } = body;

    const existing = await db.query.userConfig.findFirst({
      where: eq(userConfig.firebaseUid, userUid)
    });

    if (existing) {
      await db.update(userConfig)
        .set({
          binanceApiKey: binanceApiKey ? encrypt(binanceApiKey) : existing.binanceApiKey,
          binanceApiSecret: binanceApiSecret ? encrypt(binanceApiSecret) : existing.binanceApiSecret,
          montoOperacion: montoOperacion ?? existing.montoOperacion,
          apalancamiento: apalancamiento ?? existing.apalancamiento,
          maxTrades: maxTrades ?? existing.maxTrades,
          rsaPublicKey: rsaPublicKey ?? existing.rsaPublicKey,
          rsaPrivateKey: rsaPrivateKey ? encrypt(rsaPrivateKey) : existing.rsaPrivateKey,
          updatedAt: new Date()
        })
        .where(eq(userConfig.firebaseUid, userUid));
    }

    return c.json({ success: true, message: 'Configuración actualizada' });
  });`;

content = content.replace(oldEndpoint, newEndpoint);
fs.writeFileSync("src/api/modules/users/infrastructure/UserController.ts", content);
