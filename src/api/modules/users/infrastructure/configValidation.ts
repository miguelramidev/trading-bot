import { z } from "zod";

// Hallazgo M6 de la auditoría: el PUT de /api/users/config aceptaba valores
// inválidos (montoOperacion negativo, leverageMin > leverageMax, etc.) porque
// solo se validaba la forma del body, nunca el resultado combinado con lo que
// ya estaba guardado. Este schema valida el objeto YA FUSIONADO (lo guardado
// + los cambios del PUT), para que un PUT que solo toca un campo (ej. manda
// `leverageMax` nada más) siga rechazándose si queda inconsistente con el
// `leverageMin` que ya estaba en la base.
export const CapitalRiskSchema = z
  .object({
    montoOperacion: z
      .number()
      .positive("montoOperacion debe ser mayor a 0")
      .refine((v) => Math.abs(v - Math.round(v * 100) / 100) < 1e-9, {
        message: "montoOperacion admite como máximo 2 decimales",
      }),
    maxTrades: z.number().int("maxTrades debe ser un entero").min(1).max(10, "maxTrades admite como máximo 10"),
    leverageMin: z.number().int("leverageMin debe ser un entero").min(1).max(10, "leverageMin admite como máximo 10"),
    leverageMax: z.number().int("leverageMax debe ser un entero").min(1).max(10, "leverageMax admite como máximo 10"),
  })
  .refine((v) => v.leverageMin <= v.leverageMax, {
    message: "leverageMin no puede ser mayor que leverageMax",
    path: ["leverageMin"],
  });

export type CapitalRiskInput = z.infer<typeof CapitalRiskSchema>;

/** `null` si es válido; si no, el primer mensaje de error para devolver en el 400. */
export function validateCapitalRisk(merged: {
  montoOperacion: number;
  maxTrades: number;
  leverageMin: number;
  leverageMax: number;
}): string | null {
  const result = CapitalRiskSchema.safeParse(merged);
  if (result.success) return null;
  return result.error.issues[0]?.message ?? "Configuración de capital y riesgo inválida";
}
