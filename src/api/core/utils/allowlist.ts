// Parsea una lista de permitidos separada por comas (ej: "abc, def"). Vacía o ausente => Set vacío.
// Quien la use debe tratar el Set vacío como "nadie permitido" (falla cerrado).
export function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}
