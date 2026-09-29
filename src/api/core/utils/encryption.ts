import crypto from "crypto";
import { Resource } from "sst";

const ALGORITHM = "aes-256-gcm";

// La llave son 32 bytes (256 bits) escritos como 64 caracteres hexadecimales.
const KEY_FORMAT = /^[0-9a-fA-F]{64}$/;

// Formato de un valor cifrado: iv (16 bytes) : authTag (16 bytes) : ciphertext (al menos 1 byte), todo en hex.
const ENCRYPTED_FORMAT = /^([0-9a-fA-F]{32}):([0-9a-fA-F]{32}):((?:[0-9a-fA-F]{2})+)$/;

// Valida y convierte la llave. Los mensajes de error nunca incluyen el valor.
export function loadEncryptionKey(raw: string | undefined): Buffer {
  const value = raw?.trim();
  if (!value) {
    throw new Error("ENCRYPTION_KEY no está configurada");
  }
  if (!KEY_FORMAT.test(value)) {
    throw new Error(
      `ENCRYPTION_KEY inválida: se esperan 64 caracteres hexadecimales (32 bytes); recibidos ${value.length} caracteres`
    );
  }
  return Buffer.from(value, "hex");
}

// Variable de entorno en local, Secret de SST en Lambda. Sin valor por defecto.
function readRawKey(): string | undefined {
  try {
    return process.env.ENCRYPTION_KEY || (Resource as any).ENCRYPTION_KEY?.value;
  } catch {
    return undefined;
  }
}

// Falla cerrado al iniciar: si la llave falta o es inválida, el proceso no arranca.
const KEY = loadEncryptionKey(readRawKey());

export function encrypt(text: string): string {
  if (!text) {
    throw new Error("No se puede cifrar un valor vacío");
  }
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  // Formato: iv:authTag:encryptedText
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

// Falla de forma explícita ante cualquier valor que no tenga el formato iv:authTag:ciphertext
// (nunca lo devuelve tal cual). Los mensajes de error no incluyen el valor.
export function decrypt(hash: string): string {
  const match = typeof hash === "string" ? ENCRYPTED_FORMAT.exec(hash) : null;
  if (!match) {
    throw new Error("Valor cifrado con formato inválido (se esperaba iv:authTag:ciphertext)");
  }

  const [, ivHex, authTagHex, encryptedHex] = match;
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

    let decrypted = decipher.update(Buffer.from(encryptedHex, "hex"), undefined, "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    throw new Error("No se pudo descifrar el valor (llave incorrecta o dato adulterado)");
  }
}
