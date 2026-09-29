import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

// Sin red ni SST real. Las llaves de prueba se arman en runtime (no hay hex de 64 escrito en el archivo).
const mocks = vi.hoisted(() => ({ resource: {} as any }));
vi.mock("sst", () => ({ Resource: mocks.resource }));

const KEY_A = "ab".repeat(32);
const KEY_B = "cd".repeat(32);

// encryption.ts valida la llave al importarse: cada carga con una llave distinta necesita un módulo nuevo.
async function loadWithKey(key: string) {
  vi.resetModules();
  vi.stubEnv("ENCRYPTION_KEY", key);
  return await import("../src/api/core/utils/encryption.js");
}

describe("llave de cifrado", () => {
  beforeEach(() => {
    mocks.resource.ENCRYPTION_KEY = undefined;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falla al importar si la llave está ausente, con un mensaje claro", async () => {
    await expect(loadWithKey("")).rejects.toThrow("ENCRYPTION_KEY no está configurada");
  });

  it("falla al importar si la llave tiene formato inválido, sin mostrar su valor", async () => {
    const valorSecreto = "valor-secreto-no-hex";
    const error = await loadWithKey(valorSecreto).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("ENCRYPTION_KEY inválida");
    expect((error as Error).message).toContain("64 caracteres hexadecimales");
    expect((error as Error).message).not.toContain(valorSecreto);
  });

  it("rechaza una llave con el largo incorrecto o caracteres que no son hex", async () => {
    const { loadEncryptionKey } = await loadWithKey(KEY_A);
    for (const raw of ["ab".repeat(31), "ab".repeat(33), "zz".repeat(32), "ab".repeat(31) + "g1"]) {
      expect(() => loadEncryptionKey(raw)).toThrow("ENCRYPTION_KEY inválida");
    }
    for (const raw of [undefined, "", "   "]) {
      expect(() => loadEncryptionKey(raw)).toThrow("ENCRYPTION_KEY no está configurada");
    }
  });

  it("acepta una llave válida (mayúsculas y espacios alrededor incluidos) y devuelve 32 bytes", async () => {
    const { loadEncryptionKey } = await loadWithKey(KEY_A);
    expect(loadEncryptionKey(KEY_A).length).toBe(32);
    expect(loadEncryptionKey(`  ${KEY_A.toUpperCase()}  `).length).toBe(32);
  });

  it("toma la llave del Secret de SST si no hay variable de entorno", async () => {
    mocks.resource.ENCRYPTION_KEY = { value: KEY_A };
    const modulo = await loadWithKey("");
    expect(modulo.decrypt(modulo.encrypt("hola"))).toBe("hola");
  });
});

describe("cifrado ida y vuelta", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("descifra lo que cifró, con el formato iv:authTag:ciphertext", async () => {
    const { encrypt, decrypt } = await loadWithKey(KEY_A);
    const cifrado = encrypt("mi-api-key-de-binance");
    expect(cifrado).toMatch(/^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/);
    expect(cifrado).not.toContain("mi-api-key-de-binance");
    expect(decrypt(cifrado)).toBe("mi-api-key-de-binance");
  });

  it("soporta un PEM multilínea, como la clave privada Ed25519 real", async () => {
    const { encrypt, decrypt } = await loadWithKey(KEY_A);
    const cuerpo = crypto.randomBytes(48).toString("base64");
    const pem = ["-----BEGIN PRIVATE KEY-----", cuerpo, "-----END PRIVATE KEY-----"].join("\n");
    expect(decrypt(encrypt(pem))).toBe(pem);
  });

  it("usa un iv distinto cada vez: el mismo texto cifra distinto", async () => {
    const { encrypt, decrypt } = await loadWithKey(KEY_A);
    const uno = encrypt("igual");
    const dos = encrypt("igual");
    expect(uno).not.toBe(dos);
    expect(decrypt(uno)).toBe(decrypt(dos));
  });

  it("no descifra con otra llave", async () => {
    const cifrado = (await loadWithKey(KEY_A)).encrypt("secreto");
    const conOtraLlave = await loadWithKey(KEY_B);
    expect(() => conOtraLlave.decrypt(cifrado)).toThrow("No se pudo descifrar");
  });

  it("detecta un dato adulterado", async () => {
    const { encrypt, decrypt } = await loadWithKey(KEY_A);
    const [iv, tag, datos] = encrypt("secreto").split(":");
    const adulterado = `${iv}:${tag}:${datos.slice(0, -1)}${datos.endsWith("0") ? "1" : "0"}`;
    expect(() => decrypt(adulterado)).toThrow("No se pudo descifrar");
  });

  it("encrypt lanza con un valor vacío", async () => {
    const { encrypt } = await loadWithKey(KEY_A);
    expect(() => encrypt("")).toThrow("No se puede cifrar un valor vacío");
  });
});

describe("decrypt estricto (L5)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const IV = "00".repeat(16);
  const TAG = "00".repeat(16);

  it("falla con cualquier valor que no tenga el formato iv:authTag:ciphertext, sin devolverlo", async () => {
    const { decrypt } = await loadWithKey(KEY_A);
    const invalidos: any[] = [
      "texto-en-claro-sin-formato",
      "a:b",
      `${IV}:${TAG}`,
      `${IV}:${TAG}:00:00`,
      `${"zz".repeat(16)}:${TAG}:00`,
      `${IV}:${TAG}:`,
      `${IV}:${TAG}:0`,
      `${"00".repeat(15)}:${TAG}:00`,
      "",
      undefined,
      null,
      12345,
    ];
    for (const valor of invalidos) {
      expect(() => decrypt(valor)).toThrow("Valor cifrado con formato inválido");
    }
  });

  it("el mensaje de error no incluye el valor recibido", async () => {
    const { decrypt } = await loadWithKey(KEY_A);
    const valor = "mi-clave-en-texto-plano-123";
    const error = (() => {
      try {
        decrypt(valor);
      } catch (e) {
        return e as Error;
      }
    })();
    expect(error?.message).toBeDefined();
    expect(error?.message).not.toContain(valor);
  });
});
