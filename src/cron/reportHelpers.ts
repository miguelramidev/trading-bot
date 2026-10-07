// Funciones puras del reporte diario (report.ts), separadas para poder testearlas sin DB ni red.

export interface DailyCounts {
  tradesTaken: number;
  wins: number;
  losses: number;
}

/**
 * Trades del usuario cerrados en las últimas 24 h (filas de trade_executions). Ganado/perdido se
 * decide por el PnL real de Binance (>0 gana, ≤0 pierde). Un cierre sin PnL registrado cuenta como
 * tomado pero no como ganado ni perdido, para no inventar un resultado.
 */
export function countClosedTrades(rows: { closedAt: Date | null; realizedPnl: string | null }[], now: Date): DailyCounts {
  const since = now.getTime() - 24 * 60 * 60 * 1000;
  const closed = rows.filter((r) => r.closedAt && r.closedAt.getTime() >= since && r.closedAt.getTime() <= now.getTime());
  const pnls = closed.map((r) => (r.realizedPnl == null ? NaN : parseFloat(r.realizedPnl))).filter(Number.isFinite);
  return { tradesTaken: closed.length, wins: pnls.filter((p) => p > 0).length, losses: pnls.filter((p) => p <= 0).length };
}

const money = (x: number) => `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(2)} USDT`;

export function buildSnapshotMessage(liveBalance: number, netPnl: number, counts: DailyCounts): string {
  let msg = `🌙 <b>SNAPSHOT DE CAPITAL REGISTRADO</b> 🌙\n\n`;
  msg += `💼 <b>Balance Actual (Binance):</b> ${money(liveBalance)}\n`;
  msg += `📈 <b>PnL Neto (Últimas 24h):</b> ${netPnl >= 0 ? "+" : ""}${money(netPnl)}\n`;
  msg += `🔁 <b>Operaciones (Últimas 24h):</b> ${counts.tradesTaken} cerradas (${counts.wins} ganadas, ${counts.losses} perdidas)\n`;
  return msg;
}
