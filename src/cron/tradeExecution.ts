// Persistencia compartida del resultado de `executeTrade`, llamada tanto desde
// src/telegram/webhook.ts (callback paper_accept_) como desde
// src/api/modules/signals/infrastructure/SignalController.ts (POST /api/signals/:id/execute).
// Antes del fix de este archivo, ambos lugares duplicaban la misma lógica y el mismo bug:
// `isActiveTrade: true` se seteaba igual para "ejecutado", "advertencia" y "crítico", sin
// distinguir el caso de "advertencia" en el que `emergencyClose` ya dejó la posición plana
// (el SL falló y se cerró a mercado) del caso en el que sigue abierta (falló el TP). Una fila
// del primer caso quedaba marcada activa para siempre: el monitor por velas nunca la iba a
// cerrar porque el precio no tiene por qué volver a tocar ese SL viejo.
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { signalHistory, tradeExecutions } from "../db/schema.js";
import type { Trader, TradeResult } from "../bot/trader.js";
import type { CloseReason } from "./closeNotificationHelpers.js";

export type ExecutionSource = "telegram" | "api";

// Mismo patrón que PNL_FETCH_MAX_ATTEMPTS/PNL_FETCH_RETRY_DELAY_MS en analyze.ts: los fills de
// un cierre recién ejecutado a veces tardan unos segundos en aparecer en fetchMyTrades.
const CLOSING_FILL_MAX_ATTEMPTS = 3;
const CLOSING_FILL_RETRY_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RecordExecutionResultInput {
  signalId: number;
  userId: number;
  source: ExecutionSource;
  signal: { symbol: string; direction: "LONG" | "SHORT" };
  configuredMargin: number;
  executionResult: TradeResult;
  trader: Trader;
  /** Para tests. Por defecto `new Date()`. */
  openedAt?: Date;
}

export interface RecordExecutionResultOutput {
  /** "Rechazada": `executeTrade` rechazó la orden (Reglas 1/2/5/6/7/8, balance, leverage,
   * etc.) — nunca hubo posición real. Distinto de "Descartada", que es el descarte MANUAL
   * del usuario (`POST /api/signals/:id/discard`, callback de Telegram) y no pasa por acá. */
  finalDecision: "Tomada" | "Rechazada";
  isActiveTrade: boolean;
  /** `true` cuando ya no queda posición abierta al terminar `executeTrade` (cierre de
   * emergencia) — la fila se cerró en este mismo llamado, no la va a tocar la conciliación. */
  closedImmediately: boolean;
  close?: { reason: CloseReason; pnl: number | null; exitPrice: number | null };
}

export async function recordExecutionResult(input: RecordExecutionResultInput): Promise<RecordExecutionResultOutput> {
  const { signalId, userId, source, signal, configuredMargin, executionResult, trader } = input;
  const openedAt = input.openedAt ?? new Date();

  // "rechazado" es el único caso sin posición real abierta en Binance. "Rechazada", no
  // "Descartada": esta última es el descarte MANUAL del usuario, no pasa por acá.
  const finalDecision: "Tomada" | "Rechazada" = executionResult.status === "rechazado" ? "Rechazada" : "Tomada";
  const reasonText = executionResult.mensaje.substring(0, 100);
  const closedImmediately = executionResult.positionOpen === false;
  const isActiveTrade = finalDecision === "Tomada" && !closedImmediately;

  let close: RecordExecutionResultOutput["close"];
  if (closedImmediately) {
    const exitSide = signal.direction === "LONG" ? "sell" : "buy";
    let fill = await trader.getClosingFill(signal.symbol, openedAt.getTime(), exitSide);
    let attempts = 1;
    while (!fill.fillsFound && attempts < CLOSING_FILL_MAX_ATTEMPTS) {
      await sleep(CLOSING_FILL_RETRY_DELAY_MS);
      fill = await trader.getClosingFill(signal.symbol, openedAt.getTime(), exitSide);
      attempts++;
    }
    close = fill.fillsFound
      ? { reason: "emergency", pnl: fill.pnl - fill.fee, exitPrice: fill.avgPrice }
      : { reason: "emergency", pnl: null, exitPrice: null };
  }

  await db.update(signalHistory)
    .set({
      decision: finalDecision,
      reason: reasonText,
      isActiveTrade,
      ...(close ? {
        realizedPnl: close.pnl !== null ? close.pnl.toFixed(4) : null,
        executedExitPrice: close.exitPrice !== null ? close.exitPrice.toString() : null,
      } : {}),
    })
    .where(eq(signalHistory.id, signalId));

  if (finalDecision === "Tomada") {
    // onConflictDoNothing: la constraint única (signal_id, user_id) ya protege contra un
    // doble insert (ej. reintento de red del propio caller) sin que haga falta un chequeo
    // previo acá.
    await db.insert(tradeExecutions).values({
      signalId,
      userId,
      source,
      marginUsd: configuredMargin.toFixed(2),
      openedAt,
      isActive: isActiveTrade,
      ...(close ? {
        closedAt: new Date(),
        closeReason: close.reason,
        realizedPnl: close.pnl !== null ? close.pnl.toFixed(4) : null,
        exitPrice: close.exitPrice !== null ? close.exitPrice.toString() : null,
      } : {}),
    }).onConflictDoNothing();
  }

  return { finalDecision, isActiveTrade, closedImmediately, close };
}
