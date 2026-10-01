// Funciones puras del historial, separadas del controller para testearlas
// sin mockear Drizzle (mismo patrón que dashboardHelpers.ts).

export function periodCutoff(period: string, now: Date = new Date()): Date | null {
  if (period === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (period === "30d") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return null;
}

interface SearchableTrade {
  symbol: string;
  strategy: string;
}

/**
 * Búsqueda por activo/estrategia (substring, case-insensitive). Se aplica
 * ANTES de calcular las métricas: a diferencia del filtro de tipo
 * (Todas/Ejecutadas/Descartadas), que solo acota la lista, la búsqueda y el
 * período sí mueven las métricas.
 */
export function filterTradesBySearch<T extends SearchableTrade>(
  trades: T[],
  { symbol, strategy }: { symbol?: string; strategy?: string }
): T[] {
  const symbolQuery = symbol?.trim().toLowerCase();
  const strategyQuery = strategy?.trim().toLowerCase();
  if (!symbolQuery && !strategyQuery) return trades;
  return trades.filter((t) => {
    if (symbolQuery && !t.symbol.toLowerCase().includes(symbolQuery)) return false;
    if (strategyQuery && !t.strategy.toLowerCase().includes(strategyQuery)) return false;
    return true;
  });
}

interface StatusedTrade {
  status: "DESCARTADO" | "TP HIT" | "SL HIT";
  pnl: number;
}

export interface HistoryStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnl: number;
  grossProfit: number;
  grossLoss: number;
  winRate: number;
  profitFactor: number;
}

export function computeHistoryStats<T extends StatusedTrade>(trades: T[]): HistoryStats {
  let totalTrades = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  let totalPnl = 0;
  let grossProfit = 0;
  let grossLoss = 0;

  for (const t of trades) {
    if (t.status === "DESCARTADO") continue;
    totalTrades++;
    totalPnl += t.pnl;
    if (t.status === "TP HIT") {
      winningTrades++;
      grossProfit += t.pnl;
    } else {
      losingTrades++;
      grossLoss += Math.abs(t.pnl);
    }
  }

  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  // Sin pérdidas y con ganancias: no hay "profit factor" real (sería dividir por
  // cero); 999 es un valor centinela alto, nunca el resultado de un cálculo real.
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

  return { totalTrades, winningTrades, losingTrades, totalPnl, grossProfit, grossLoss, winRate, profitFactor };
}

/** Filtro de tipo (Todas/Ejecutadas/Descartadas): solo la lista, nunca las métricas. */
export function filterTradesByType<T extends { status: "DESCARTADO" | "TP HIT" | "SL HIT" }>(trades: T[], filter: string): T[] {
  if (filter === "Tomadas") return trades.filter((t) => t.status !== "DESCARTADO");
  if (filter === "Descartadas") return trades.filter((t) => t.status === "DESCARTADO");
  return trades;
}
