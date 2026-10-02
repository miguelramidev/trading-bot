// Lógica de decisión de la conciliación con Binance, como función pura (sin ccxt ni DB): toma
// el estado ya consultado (posición real, órdenes de protección vivas, fill de cierre si lo
// hay) y devuelve QUÉ hacer. La orquestación (src/cron/reconciliation.ts) es la que hace las
// llamadas de red y aplica esta decisión (update + notificación, o solo log en modo de solo
// registro).
import { classifyProtectionOrders, type NormalizedOrder } from "../api/modules/dashboard/infrastructure/protectionOrders.js";
import type { CloseReason } from "./closeNotificationHelpers.js";

// No repetir una alerta crítica en cada ciclo de cron (cada 15m) para lo mismo — como máximo
// una vez cada 4 horas. Mismo throttle para "sin SL" (trade_executions.last_missing_sl_alert_at)
// y para "posición huérfana" (orphan_position_alerts.last_alert_at).
export const MISSING_SL_ALERT_THROTTLE_MS = 4 * 60 * 60 * 1000;

export function shouldAlertAgain(lastAlertAt: Date | null, now: Date): boolean {
  return lastAlertAt === null || now.getTime() - lastAlertAt.getTime() >= MISSING_SL_ALERT_THROTTLE_MS;
}

export type ReconciliationAction =
  | { kind: "still_open" }
  | { kind: "missing_stop_loss"; shouldAlert: boolean }
  | { kind: "stop_mismatch"; expectedPrice: number; actualPrice: number }
  | {
      kind: "closed";
      reason: CloseReason;
      /** Cómo se identificó el motivo del cierre: por el `clientOrderId` de la orden que generó
       * el fill (preciso), por el respaldo de precio (aproximado, sin tag reconocible), o
       * "unknown" cuando ninguno de los dos pudo determinarlo (cae en "manual" sin certeza). */
      identifiedBy: "clientOrderId" | "price" | "unknown";
      pnl: number | null;
      exitPrice: number | null;
      quantity: number | null;
    };

export interface DecideReconciliationActionInput {
  direction: "LONG" | "SHORT";
  /** Precio real de entrada (no el de la señal): el que usa `classifyProtectionOrders` para
   * saber de qué lado de la entrada dispara cada orden (SL del lado adverso, TP del favorable). */
  entryPrice: number;
  gridSL: number;
  gridTP: number;
  /** `true` si `fetchAllPositions` todavía muestra una posición con `contracts > 0` para este símbolo. */
  positionOpen: boolean;
  /** Órdenes de protección (algo orders) vivas para este símbolo, ya filtradas por símbolo. */
  protectionOrders: NormalizedOrder[];
  /** `market.precision.price` de ccxt (ver `extractTickSize` en protectionOrders.ts). `null` si no se pudo determinar. */
  tickSize: number | null;
  /** Resultado de `trader.getClosingFill` cuando `positionOpen` es `false`. `undefined` si no aplica. */
  closingFill?: { fillsFound: boolean; avgPrice?: number; quantity?: number; pnl?: number; fee?: number };
  /** `clientOrderId` real de la orden que generó el fill de cierre (de `trader.getOrderClientId`),
   * o `undefined` si no se pudo determinar (orden vieja sin tag, o de verdad no hay ninguna). */
  closingClientOrderId?: string;
  now: Date;
  lastMissingSlAlertAt: Date | null;
}

// Respaldo cuando no hay `clientOrderId` que identifique la orden de cierre: el fill cerca del
// SL es stop, cerca del TP es objetivo. Tolerancia = 2 ticks de precio (o, sin tick size
// conocido, 0.2% del nivel — generoso a propósito, un respaldo no necesita ser exacto).
function classifyByPrice(fillPrice: number, gridSL: number, gridTP: number, tickSize: number | null): CloseReason | null {
  const tolerance = tickSize ? tickSize * 2 : Math.max(gridSL, gridTP) * 0.002;
  const slDistance = Math.abs(fillPrice - gridSL);
  const tpDistance = Math.abs(fillPrice - gridTP);
  if (slDistance <= tolerance && slDistance <= tpDistance) return "sl";
  if (tpDistance <= tolerance && tpDistance < slDistance) return "tp";
  return null;
}

export function decideReconciliationAction(input: DecideReconciliationActionInput): ReconciliationAction {
  const {
    direction, entryPrice, gridSL, gridTP, positionOpen, protectionOrders, tickSize,
    closingFill, closingClientOrderId, now, lastMissingSlAlertAt,
  } = input;

  if (!positionOpen) {
    const fillPrice = closingFill?.fillsFound ? closingFill.avgPrice ?? null : null;
    const pnl = closingFill?.fillsFound ? (closingFill.pnl ?? 0) - (closingFill.fee ?? 0) : null;
    const quantity = closingFill?.fillsFound ? closingFill.quantity ?? null : null;

    let reason: CloseReason;
    let identifiedBy: "clientOrderId" | "price" | "unknown";
    if (closingClientOrderId?.startsWith("sl_")) { reason = "sl"; identifiedBy = "clientOrderId"; }
    else if (closingClientOrderId?.startsWith("tp_")) { reason = "tp"; identifiedBy = "clientOrderId"; }
    else if (closingClientOrderId?.startsWith("emrg_")) { reason = "emergency"; identifiedBy = "clientOrderId"; }
    else {
      const byPrice = fillPrice !== null ? classifyByPrice(fillPrice, gridSL, gridTP, tickSize) : null;
      reason = byPrice ?? "manual";
      identifiedBy = byPrice ? "price" : "unknown";
    }

    return { kind: "closed", reason, identifiedBy, pnl, exitPrice: fillPrice, quantity };
  }

  const classification = classifyProtectionOrders({ orders: protectionOrders, isLong: direction === "LONG", entryPrice });

  if (!classification.hasStopLoss) {
    return { kind: "missing_stop_loss", shouldAlert: shouldAlertAgain(lastMissingSlAlertAt, now) };
  }

  // "más allá del tick size": sin tick size conocido, cualquier diferencia cuenta (no hay forma
  // de distinguir ruido de un desvío real).
  const tolerance = tickSize ?? 0;
  if (Math.abs(classification.stopLoss!.price - gridSL) > tolerance) {
    return { kind: "stop_mismatch", expectedPrice: gridSL, actualPrice: classification.stopLoss!.price };
  }

  return { kind: "still_open" };
}
