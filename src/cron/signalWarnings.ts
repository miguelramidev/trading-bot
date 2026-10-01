// Tipo y helpers puros de las advertencias de señal (Fase 1), separados de
// analyze.ts para poder testearlos sin mockear ccxt/Telegram/Firebase (mismo
// patrón que closeNotificationHelpers.ts).

export type SignalWarningSeverity = "info" | "warning" | "high" | "positive";

export interface SignalWarning {
  type: string;
  severity: SignalWarningSeverity;
  /** Ya sin HTML (mismo criterio que `reason` hoy: se le saca el markup antes de guardar). */
  text: string;
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "");
}

/** Agrega una advertencia a la lista solo si `rawHtmlText` no está vacío (después del trim). */
export function pushWarning(list: SignalWarning[], type: string, severity: SignalWarningSeverity, rawHtmlText: string): void {
  const trimmed = rawHtmlText.trim();
  if (!trimmed) return;
  list.push({ type, severity, text: stripHtml(trimmed) });
}
