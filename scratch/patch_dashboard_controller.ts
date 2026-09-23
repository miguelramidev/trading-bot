import fs from "fs";

let content = fs.readFileSync("src/api/modules/dashboard/infrastructure/DashboardController.ts", "utf8");

content = content.replace(
    `import { decrypt } from "../../../../core/crypto/cryptoService.js";`,
    `import { decrypt } from "../../../core/utils/encryption.js";`
);

content = content.replace(
    `const totalBalance = balance.total['USDT'] || 0;`,
    `const totalBalance = (balance.total as any)['USDT'] || 0;`
);

fs.writeFileSync("src/api/modules/dashboard/infrastructure/DashboardController.ts", content);
