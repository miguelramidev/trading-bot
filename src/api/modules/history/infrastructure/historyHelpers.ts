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
  status: "DESCARTADO" | "RECHAZADO" | "TP HIT" | "SL HIT";
  // null en las descartadas/rechazadas (nunca tuvieron resultado) — siempre se
  // excluyen antes de sumarse, pero el tipo lo refleja para no mentir con un 0.
  pnl: number | null;
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
    if (t.status === "DESCARTADO" || t.status === "RECHAZADO") continue;
    // No descartada ni rechazada: siempre tiene pnl real (ver mapeo del controller).
    const pnl = t.pnl ?? 0;
    totalTrades++;
    totalPnl += pnl;
    if (t.status === "TP HIT") {
      winningTrades++;
      grossProfit += pnl;
    } else {
      losingTrades++;
      grossLoss += Math.abs(pnl);
    }
  }

  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  // Sin pérdidas y con ganancias: no hay "profit factor" real (sería dividir por
  // cero); 999 es un valor centinela alto, nunca el resultado de un cálculo real.
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

  return { totalTrades, winningTrades, losingTrades, totalPnl, grossProfit, grossLoss, winRate, profitFactor };
}

/**
 * Estrategias distintas presentes en el historial (ya acotado por período,
 * pero ANTES de aplicar la búsqueda por estrategia): alimenta el selector de
 * Historial, que no debe ofrecer opciones inexistentes para el período visto.
 */
export function computeAvailableStrategies<T extends { strategy: string }>(trades: T[]): string[] {
  return [...new Set(trades.map((t) => t.strategy))].sort((a, b) => a.localeCompare(b));
}

/**
 * Filtro de tipo (Todas/Ejecutadas/Descartadas/Rechazadas): solo la lista, nunca las
 * métricas. "Rechazadas" (protección de `executeTrade`, Reglas 5/6/7/8 de RULES.md) tiene su
 * propio filtro — no se mezcla con "Descartadas" (decisión manual del usuario).
 */
export function filterTradesByType<T extends { status: "DESCARTADO" | "RECHAZADO" | "TP HIT" | "SL HIT" }>(trades: T[], filter: string): T[] {
  if (filter === "Tomadas") return trades.filter((t) => t.status !== "DESCARTADO" && t.status !== "RECHAZADO");
  if (filter === "Descartadas") return trades.filter((t) => t.status === "DESCARTADO");
  if (filter === "Rechazadas") return trades.filter((t) => t.status === "RECHAZADO");
  return trades;
}
