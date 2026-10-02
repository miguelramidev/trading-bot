// Persistencia compartida del resultado de `executeTrade`, llamada tanto desde
// src/telegram/webhook.ts (callback paper_accept_) como desde
// src/api/modules/signals/infrastructure/SignalController.ts (POST /api/signals/:id/execute).
// Antes del fix de este archivo, ambos lugares duplicaban la misma lógica y el mismo bug:
// `isActiveTrade: true` se seteaba igual para "ejecutado", "advertencia" y "crítico", sin
// distinguir el caso de "advertencia" en el que `emergencyClose` ya dejó la posición plana
// (el SL falló y se cerró a mercado) del caso en el que sigue abierta (falló el TP). Una fila
// del primer caso quedaba marcada activa para siempre: el monitor por velas nunca la iba a
// cerrar porque el precio no tiene por qué volver a tocar ese SL viejo.
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { signalHistory, tradeExecutions } from "../db/schema.js";
import type { Trader, TradeResult } from "../bot/trader.js";
import type { CloseReason } from "./closeNotificationHelpers.js";

export type ExecutionSource = "telegram" | "api";

// Mismo patrón que PNL_FETCH_MAX_ATTEMPTS/PNL_FETCH_RETRY_DELAY_MS en analyze.ts: los fills de
// un cierre recién ejecutado a veces tardan unos segundos en aparecer en fetchMyTrades.
const CLOSING_FILL_MAX_ATTEMPTS = 3;
const CLOSING_FILL_RETRY_DELAY_MS = 1500;
// Mismos números para el fill de ENTRADA (ver captureEntryFill): es el mismo tipo de demora de
// Binance, del otro lado de la operación.
const ENTRY_FILL_MAX_ATTEMPTS = 3;
const ENTRY_FILL_RETRY_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reserva atómica de la señal antes de llamar a `executeTrade` (ROADMAP.md hallazgo A1).
 * `UPDATE ... WHERE decision IS NULL` — solo gana la reserva el primer pedido que llega; si dos
 * pedidos llegan casi juntos (reintento de red, doble toque, o Telegram + app casi a la vez),
 * el segundo ve 0 filas afectadas y nunca debe llamar a `executeTrade`. Idéntico para los dos
 * caminos de ejecución (Telegram y la app).
 */
export async function reserveSignalForExecution(signalId: number, userId: number): Promise<boolean> {
  const updated = await db
    .update(signalHistory)
    .set({ decision: "Ejecutando", reservedByUserId: userId, reservedAt: new Date() })
    .where(and(eq(signalHistory.id, signalId), isNull(signalHistory.decision)))
    .returning({ id: signalHistory.id });
  return updated.length > 0;
}

/**
 * Si `executeTrade` lanza una excepción no controlada DESPUÉS de reservar la señal (ej. el
 * proceso se cae a mitad de camino), la fila quedaría en "Ejecutando" para siempre, bloqueando
 * cualquier reintento futuro — a propósito: no la liberamos solos, porque no sabemos si la orden
 * sí llegó a abrirse en Binance. Mejor que un reintento automático abra una segunda posición real
 * sin que nadie se dé cuenta. Requiere revisión manual antes de reintentar.
 */
export async function markReservationFailed(signalId: number, errorMessage: string): Promise<void> {
  await db
    .update(signalHistory)
    .set({ decision: "Ejecutando -> Error", reason: `Revisar Binance manualmente antes de reintentar: ${errorMessage}`.substring(0, 250) })
    .where(eq(signalHistory.id, signalId));
}

// `fetchMyTrades` necesita una ventana para buscar — a diferencia del `entryOrderId` (que
// identifica la orden con certeza, no por tiempo), esto es solo para que la respuesta de Binance
// incluya el fill: el fill real queda un poco ANTES de `openedAt` (que se captura con `new Date()`
// DESPUÉS de que `executeTrade` ya puso la orden — confirmado contra una ejecución real,
// 2026-10-02: 648ms antes), así que se amplía el margen hacia atrás por las dudas.
const ENTRY_FILL_SEARCH_WINDOW_MS = 60_000;

/**
 * Fill de ENTRADA real (cantidad y precio), para `signal_history.executedEntryPrice` y
 * `trade_executions.entryPrice`/`quantity`. `executeTrade` no lo calcula (solo usa el precio del
 * ticker para dimensionar la orden) pero SÍ devuelve el id real de la orden a mercado
 * (`entryOrderId`) — se filtra por esa orden puntual, no por ventana de tiempo ni por lado: así no
 * depende de ningún margen y no puede confundirse con un fill de otra operación del mismo símbolo
 * (como sí podía pasar buscando solo por tiempo+lado). Reintento corto por si el fill todavía no
 * aparece en `fetchMyTrades` (mismo patrón que los fills de cierre). Si nunca aparece, se sigue
 * igual: la fila queda sin entry price real en vez de bloquear la respuesta al usuario por esto.
 */
async function captureEntryFill(
  trader: Trader,
  symbol: string,
  openedAtMs: number,
  entryOrderId: string | undefined
): Promise<{ entryPrice: number | null; quantity: number | null }> {
  if (!entryOrderId) return { entryPrice: null, quantity: null };

  const since = openedAtMs - ENTRY_FILL_SEARCH_WINDOW_MS;
  let fill = await trader.getFillsForOrder(symbol, entryOrderId, since);
  let attempts = 1;
  while (fill === null && attempts < ENTRY_FILL_MAX_ATTEMPTS) {
    await sleep(ENTRY_FILL_RETRY_DELAY_MS);
    fill = await trader.getFillsForOrder(symbol, entryOrderId, since);
    attempts++;
  }
  return {
    entryPrice: fill?.avgPrice ?? null,
    quantity: fill?.quantity ?? null,
  };
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

  // Incidente QNT (2026-10-02): `executeTrade` nunca devolvía el fill real de entrada (solo usa
  // el precio del ticker para dimensionar la orden), así que `executedEntryPrice` quedaba NULL
  // para siempre en toda operación que cerrara por la conciliación (en vez del monitor por velas
  // viejo, que sí lo completaba) — y `HistoryController` trata un "Cerrada" sin
  // `executedEntryPrice` como descartada, aunque la posición haya sido real. Se captura acá, una
  // sola vez, al ejecutar.
  let entryPrice: number | null = null;
  let entryQuantity: number | null = null;
  if (finalDecision === "Tomada") {
    const captured = await captureEntryFill(trader, signal.symbol, openedAt.getTime(), executionResult.entryOrderId);
    entryPrice = captured.entryPrice;
    entryQuantity = captured.quantity;
  }

  await db.update(signalHistory)
    .set({
      decision: finalDecision,
      reason: reasonText,
      isActiveTrade,
      ...(entryPrice !== null ? { executedEntryPrice: entryPrice.toString() } : {}),
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
      entryPrice: entryPrice !== null ? entryPrice.toString() : null,
      quantity: entryQuantity !== null ? entryQuantity.toString() : null,
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
