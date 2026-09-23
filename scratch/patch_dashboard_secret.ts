import fs from "fs";

let content = fs.readFileSync("src/api/modules/dashboard/infrastructure/DashboardController.ts", "utf8");

content = content.replace(
    /if \(privateKey\) \{\s*exchangeArgs\.privateKey = privateKey;\s*\} else if \(secret\) \{\s*exchangeArgs\.secret = secret;\s*\}/g,
    `if (privateKey) {
      exchangeArgs.secret = privateKey; // CCXT Binance expects the private key inside the 'secret' property
    } else if (secret) {
      exchangeArgs.secret = secret;
    }`
);

fs.writeFileSync("src/api/modules/dashboard/infrastructure/DashboardController.ts", content);
