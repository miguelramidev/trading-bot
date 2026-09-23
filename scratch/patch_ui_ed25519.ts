import fs from "fs";

function fixFile(filePath: string) {
    let content = fs.readFileSync(filePath, "utf8");

    content = content.replace(/Generador de Llaves RSA/g, "Generador de Llaves Ed25519");
    content = content.replace(/llaves RSA/g, "llaves Ed25519");

    fs.writeFileSync(filePath, content);
}

fixFile("app/lib/screens/dashboard/desktop_settings.dart");
fixFile("app/lib/screens/dashboard/mobile_settings.dart");
