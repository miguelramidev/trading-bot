import fs from "fs";

let content = fs.readFileSync("src/api/modules/users/infrastructure/UserController.ts", "utf8");

content = content.replace(
    /crypto\.generateKeyPairSync\('rsa', \{\s*modulusLength: 2048,\s*publicKeyEncoding: \{ type: 'spki', format: 'pem' \},\s*privateKeyEncoding: \{ type: 'pkcs8', format: 'pem' \}\s*\}\)/g,
    `crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    })`
);

fs.writeFileSync("src/api/modules/users/infrastructure/UserController.ts", content);
