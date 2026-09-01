import crypto from "crypto";
import fs from "fs";

function generateKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  fs.writeFileSync("binance_public_key.pem", publicKey);
  fs.writeFileSync("binance_private_key.pem", privateKey);

  console.log("=========================================");
  console.log("¡CLAVES GENERADAS CON ÉXITO!");
  console.log("=========================================");
  console.log("\nESTA ES LA CLAVE PÚBLICA (Cópiala y pégala en Binance):");
  console.log(publicKey);
  console.log("=========================================");
  console.log("La clave privada se ha guardado en 'binance_private_key.pem'.");
  console.log("Por tu seguridad, no compartas la clave privada con nadie.");
}

generateKeys();
