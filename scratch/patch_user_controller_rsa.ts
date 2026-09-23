import fs from "fs";

let content = fs.readFileSync("src/api/modules/users/infrastructure/UserController.ts", "utf8");

if (!content.includes("/keys/generate")) {
    const importCrypto = `import { encrypt, decrypt } from '../../core/utils/encryption.js';\nimport crypto from 'crypto';`;
    content = content.replace(`import { encrypt, decrypt } from '../../core/utils/encryption.js';`, importCrypto);

    const newEndpoint = `
  // Generar llaves RSA
  router.post('/keys/generate', authMiddleware, async (c) => {
    const userUid = c.get('userUid');

    try {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      });

      const existing = await db.query.userConfig.findFirst({
        where: eq(userConfig.firebaseUid, userUid)
      });

      if (existing) {
        await db.update(userConfig)
          .set({
            rsaPublicKey: publicKey,
            rsaPrivateKey: encrypt(privateKey),
            updatedAt: new Date()
          })
          .where(eq(userConfig.firebaseUid, userUid));
      }

      return c.json({ success: true, publicKey });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  // Actualizar configuración`;
    
    content = content.replace("  // Actualizar configuración", newEndpoint);
    fs.writeFileSync("src/api/modules/users/infrastructure/UserController.ts", content);
}
