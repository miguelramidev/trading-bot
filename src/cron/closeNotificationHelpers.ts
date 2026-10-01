// Funciones puras de la notificación de cierre de una operación, separadas de
// analyze.ts para poder testearlas sin mockear Telegram/Firebase/ccxt (mismo
// patrón que dashboardHelpers.ts/historyHelpers.ts).

/** Mismo valor que ya usan los otros 3 valores posibles al cerrar el monitor de
 * analyze.ts ("Cerrada (TP Tocado)"/"Cerrada (SL Tocado)") — `"emergency"` está
 * en el tipo para que la función quede completa, pero HOY analyze.ts nunca lo
 * produce: el monitor de 15m solo distingue TP/SL por vela, nunca detecta un
 * cierre de emergencia (ver ROADMAP.md, hallazgo de prioridad alta). */
export type CloseReason = "tp" | "sl" | "emergency";

export interface CloseNotificationInput {
  symbol: string;
  direction: "LONG" | "SHORT";
  closeReason: CloseReason;
  /** `null` cuando ni el real ni el estimado se pudieron calcular. */
  pnl: number | null;
  /** `true` si `pnl` viene de una aproximación (fills de apertura o config), no de los fills reales de cierre. */
  isEstimated: boolean;
  entryPrice: number | null;
  exitPrice: number | null;
}

// Misma precisión dinámica que `fmt()` en analyze.ts (inserción de señales):
// duplicada a propósito acá, es una función de 6 líneas, no amerita un módulo
// compartido para evitar un acoplamiento innecesario entre los dos archivos.
function formatPrice(n: number): string {
  if (n < 0.001) return n.toFixed(8);
  if (n < 0.1) return n.toFixed(6);
  if (n < 1) return n.toFixed(6);
  if (n < 10) return n.toFixed(5);
  if (n < 100) return n.toFixed(4);
  return n.toFixed(2);
}

function formatSignedUsd(pnl: number): string {
  const sign = pnl > 0 ? "+" : "";
  return `${sign}${pnl.toFixed(2)}`;
}

function closeReasonLabel(reason: CloseReason): string {
  switch (reason) {
    case "tp":
      return "Objetivo tocado";
    case "sl":
      return "Stop tocado";
    case "emergency":
      return "Cierre de emergencia";
  }
}

/** ✅/❌ según el signo del PnL, no según TP/SL: a veces un "TP tocado" puede
 * terminar en pérdida neta por comisiones, y viceversa cerca del breakeven. */
function closeEmoji(pnl: number | null): string {
  if (pnl === null) return "ℹ️";
  if (pnl > 0) return "✅🤑";
  if (pnl < 0) return "❌🩸";
  return "➖";
}

/** Línea de resultado compartida entre Telegram y push — sin HTML, el llamador
 * de Telegram la envuelve en `<b>`. */
function resultLine(input: CloseNotificationInput): string {
  if (input.pnl === null) return "Resultado: no disponible (no se pudo calcular ni estimar)";
  const suffix = input.isEstimated
    ? "(estimado, no confirmado todavía con los fills reales de Binance)"
    : "(con comisiones)";
  return `Resultado: ${formatSignedUsd(input.pnl)} USDT ${suffix}`;
}

function priceRangeLine(input: CloseNotificationInput): string {
  const entry = input.entryPrice !== null ? formatPrice(input.entryPrice) : "—";
  const exit = input.exitPrice !== null ? formatPrice(input.exitPrice) : "—";
  return `Entrada: ${entry} → Salida: ${exit}`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Mensaje de Telegram (HTML, `parse_mode: "HTML"`) para el cierre de una
 * operación REALMENTE ejecutada (nunca para una señal descartada que se
 * siguió hasta el cierre solo para estadística — esa sigue con su propio
 * mensaje de "qué hubiera pasado" en analyze.ts, sin tocar). */
export function buildCloseTelegramMessage(input: CloseNotificationInput): string {
  const symbol = escapeHtml(input.symbol);
  const emoji = closeEmoji(input.pnl);
  return (
    `${emoji} <b>Trade cerrado:</b> ${symbol} (${input.direction})\n` +
    `Cómo se cerró: ${closeReasonLabel(input.closeReason)}\n` +
    `${resultLine(input)}\n` +
    `${priceRangeLine(input)}`
  );
}

/** Push (FCM): texto plano, sin HTML — título corto + cuerpo de una línea. */
export function buildClosePushMessage(input: CloseNotificationInput): { title: string; body: string } {
  const title = `Trade cerrado: ${input.symbol}`;
  const resultPlain =
    input.pnl === null
      ? "resultado no disponible"
      : `${formatSignedUsd(input.pnl)} USDT${input.isEstimated ? " (estimado)" : " (con comisiones)"}`;
  const body = `${input.direction} · ${closeReasonLabel(input.closeReason)} · ${resultPlain} · ${priceRangeLine(input)}`;
  return { title, body };
}

/**
 * Estimación cuando los fills de CIERRE todavía no llegaron a `fetchMyTrades`
 * pero los de APERTURA sí (lo normal: la apertura pasó hace rato, la base de
 * datos de fills de Binance tarda en reflejar recién el cierre) — usa la
 * cantidad y el precio de entrada REALES de esos fills, no una suposición.
 * Resta una comisión estimada (la de apertura, duplicada: se asume la misma
 * en la salida) porque la comisión real de cierre tampoco está disponible
 * todavía.
 */
export function estimatePnlFromOpeningFill(input: {
  direction: "LONG" | "SHORT";
  openingFill: { quantity: number; avgPrice: number; fee: number };
  exitPrice: number;
}): number {
  const { direction, openingFill, exitPrice } = input;
  const priceDiff = direction === "LONG" ? exitPrice - openingFill.avgPrice : openingFill.avgPrice - exitPrice;
  const estimatedTotalFee = openingFill.fee * 2;
  return openingFill.quantity * priceDiff - estimatedTotalFee;
}

/**
 * Último recurso: ni los fills de cierre NI los de apertura están disponibles
 * todavía. Aproxima el tamaño de la posición con el margen y apalancamiento
 * CONFIGURADOS del usuario (`montoOperacion`/`leverageMin`) — no son
 * necesariamente el apalancamiento real si la Regla 1 escaló más alto para
 * cumplir el minNotional, así que esto es una aproximación de una
 * aproximación (ver ROADMAP.md). Comisión asumida: 0.05% por lado, el mismo
 * supuesto que ya documenta `MIN_SL_DISTANCE_PCT` en trader.ts.
 */
export function estimatePnlFromConfig(input: {
  direction: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number;
  marginUsd: number;
  leverage: number;
}): number {
  const { direction, entryPrice, exitPrice, marginUsd, leverage } = input;
  const priceChangePct = direction === "LONG" ? (exitPrice - entryPrice) / entryPrice : (entryPrice - exitPrice) / entryPrice;
  const notional = marginUsd * leverage;
  const ASSUMED_TAKER_FEE_RATE = 0.0005;
  const estimatedFee = notional * ASSUMED_TAKER_FEE_RATE * 2;
  return notional * priceChangePct - estimatedFee;
}
