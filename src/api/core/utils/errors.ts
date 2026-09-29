import crypto from "crypto";
import type { Context } from "hono";

export function newErrorId(): string {
  return crypto.randomUUID().slice(0, 8);
}

// Respuesta 500 genérica: el detalle del error queda solo en el log, asociado al id que ve el cliente.
export function internalError(c: Context, error: unknown, contexto: string) {
  const errorId = newErrorId();
  console.error(`[${errorId}] ${contexto}`, error);
  return c.json({ error: "Error interno", errorId }, 500);
}
