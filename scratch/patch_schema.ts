import fs from "fs";

let content = fs.readFileSync("src/db/schema.ts", "utf8");

const oldSchema = `  binanceApiKey: text("binance_api_key"),
  binanceApiSecret: text("binance_api_secret"),`;

const newSchema = `  binanceApiKey: text("binance_api_key"),
  binanceApiSecret: text("binance_api_secret"),
  montoOperacion: integer("monto_operacion").default(25),
  apalancamiento: integer("apalancamiento").default(10),
  maxTrades: integer("max_trades").default(5),
  rsaPublicKey: text("rsa_public_key"),
  rsaPrivateKey: text("rsa_private_key"),`; // Encriptada al igual que el API Key

content = content.replace(oldSchema, newSchema);
fs.writeFileSync("src/db/schema.ts", content);
