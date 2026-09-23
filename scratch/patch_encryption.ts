import fs from "fs";

const file = "src/api/modules/users/infrastructure/UserController.ts";
let content = fs.readFileSync(file, "utf8");

// Agregar el import
const importStr = `import { encrypt } from "../../../core/utils/encryption.js";\n`;
if (!content.includes('encryption.js')) {
    content = importStr + content;
}

// Encriptar data
const searchStr = `
        .set({
          binanceApiKey: data.binanceApiKey,
          binanceApiSecret: data.binanceApiSecret,
        })
`;
const replaceStr = `
        .set({
          binanceApiKey: data.binanceApiKey ? encrypt(data.binanceApiKey) : undefined,
          binanceApiSecret: data.binanceApiSecret ? encrypt(data.binanceApiSecret) : undefined,
        })
`;

content = content.replace(searchStr, replaceStr);
fs.writeFileSync(file, content);
