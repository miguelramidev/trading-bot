// Funciones puras del dashboard, separadas del controller para poder testearlas
// sin mockear ccxt ni Drizzle (ver DashboardController.ts).

export type StatusVariant = "objetivo" | "stop" | "enCurso" | "pendiente" | "descartada";

/**
 * `decision` en signal_history pasa por: null (pendiente) -> "Tomada" | "Descartada"
 * -> (al cerrar el monitor de analyze.ts) "Tomada -> Cerrada (TP Tocado)" / "... (SL Tocado)".
 * Ver src/cron/analyze.ts línea 60 para el formato exacto del string compuesto.
 */
export function mapDecisionToStatus(decision: string | null, isActiveTrade: boolean): StatusVariant {
  if (decision === null) return "pendiente";
  if (decision.includes("TP Tocado")) return "objetivo";
  if (decision.includes("SL Tocado")) return "stop";
  if (decision === "Descartada") return "descartada";
  if (decision === "Tomada") return isActiveTrade ? "enCurso" : "descartada";
  return "descartada";
}

export const PENDING_SIGNAL_WINDOW_MS = 60 * 60 * 1000;
export const PENDING_SIGNALS_LIMIT = 20;

interface PendingSignalFilterInput {
  decision: string | null;
  evaluatedAt: Date;
}

/**
 * Filtra señales pendientes reales: sin decisión y no vencidas (60 min desde
 * `evaluatedAt`, el mismo umbral que la app recalcula para el aviso de
 * "vence en N min"). El backend no debe mandar señales ya vencidas hace
 * rato aunque la query SQL que las trae no filtre por tiempo.
 */
export function filterPendingSignals<T extends PendingSignalFilterInput>(signals: T[], now: Date = new Date()): T[] {
  return signals
    .filter((s) => s.decision === null && now.getTime() - s.evaluatedAt.getTime() < PENDING_SIGNAL_WINDOW_MS)
    .slice(0, PENDING_SIGNALS_LIMIT);
}

export const RECENT_ACTIVITY_LIMIT = 5;

interface RecentActivityInput {
  decision: string | null;
  evaluatedAt: Date;
  isActiveTrade: boolean;
}

/** Últimas señales con una decisión (tomada o descartada), con su StatusVariant ya resuelta. */
export function buildRecentActivity<T extends RecentActivityInput>(signals: T[]): (T & { status: StatusVariant })[] {
  return signals
    .filter((s) => s.decision !== null)
    .sort((a, b) => b.evaluatedAt.getTime() - a.evaluatedAt.getTime())
    .slice(0, RECENT_ACTIVITY_LIMIT)
    .map((s) => ({ ...s, status: mapDecisionToStatus(s.decision, s.isActiveTrade) }));
}

export interface MarginWarning {
  insufficient: boolean;
  availableUsd: number;
  requiredUsd: number;
}

/** Aviso de margen insuficiente: el disponible no alcanza para el monto por operación configurado. */
export function computeMarginWarning(freeBalance: number, montoOperacion: number): MarginWarning {
  return {
    insufficient: freeBalance < montoOperacion,
    availableUsd: freeBalance,
    requiredUsd: montoOperacion,
  };
}
