import { describe, it, expect } from "vitest";
import { periodCutoff, filterTradesBySearch, filterTradesByType, computeHistoryStats, computeAvailableStrategies } from "../src/api/modules/history/infrastructure/historyHelpers.js";

describe("periodCutoff", () => {
  const now = new Date("2026-10-01T00:00:00Z");

  it("'all' no recorta nada", () => {
    expect(periodCutoff("all", now)).toBeNull();
  });

  it("'7d' recorta a 7 días antes de 'now'", () => {
    const cutoff = periodCutoff("7d", now)!;
    expect(cutoff.toISOString()).toBe("2026-09-24T00:00:00.000Z");
  });

  it("'30d' recorta a 30 días antes de 'now'", () => {
    const cutoff = periodCutoff("30d", now)!;
    expect(cutoff.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("filterTradesBySearch", () => {
  const trades = [
    { symbol: "ENA/USDT:USDT", strategy: "Tendencial" },
    { symbol: "BTC/USDT:USDT", strategy: "Macro Breakout" },
  ];

  it("sin filtros, devuelve todo", () => {
    expect(filterTradesBySearch(trades, {})).toHaveLength(2);
  });

  it("filtra por símbolo, case-insensitive y substring", () => {
    expect(filterTradesBySearch(trades, { symbol: "ena" })).toHaveLength(1);
  });

  it("filtra por estrategia, case-insensitive y substring", () => {
    expect(filterTradesBySearch(trades, { strategy: "breakout" })).toHaveLength(1);
  });

  it("combina símbolo y estrategia (AND)", () => {
    expect(filterTradesBySearch(trades, { symbol: "ena", strategy: "breakout" })).toHaveLength(0);
    expect(filterTradesBySearch(trades, { symbol: "ena", strategy: "tendencial" })).toHaveLength(1);
  });
});

describe("filterTradesByType", () => {
  const trades = [
    { status: "TP HIT" as const },
    { status: "SL HIT" as const },
    { status: "DESCARTADO" as const },
    { status: "RECHAZADO" as const },
  ];

  it("'Todos' no filtra", () => {
    expect(filterTradesByType(trades, "Todos")).toHaveLength(4);
  });

  it("'Tomadas' excluye descartadas Y rechazadas", () => {
    expect(filterTradesByType(trades, "Tomadas")).toHaveLength(2);
  });

  it("'Descartadas' solo descartadas (no mezcla con rechazadas)", () => {
    const result = filterTradesByType(trades, "Descartadas");
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("DESCARTADO");
  });

  it("'Rechazadas' tiene su propio filtro, separado de descartadas", () => {
    const result = filterTradesByType(trades, "Rechazadas");
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("RECHAZADO");
  });
});

describe("computeHistoryStats", () => {
  it("ignora las descartadas en todas las métricas", () => {
    const stats = computeHistoryStats([{ status: "DESCARTADO" as const, pnl: 999 }]);
    expect(stats.totalTrades).toBe(0);
    expect(stats.totalPnl).toBe(0);
  });

  it("ignora las rechazadas en todas las métricas (nunca hubo posición real)", () => {
    const stats = computeHistoryStats([{ status: "RECHAZADO" as const, pnl: null }]);
    expect(stats.totalTrades).toBe(0);
    expect(stats.totalPnl).toBe(0);
  });

  it("una descartada con pnl null (el caso real, nunca tuvo resultado) no revienta y se ignora igual", () => {
    const stats = computeHistoryStats([{ status: "DESCARTADO" as const, pnl: null }]);
    expect(stats.totalTrades).toBe(0);
    expect(stats.totalPnl).toBe(0);
  });

  it("calcula winRate, profitFactor y totales sobre TP/SL", () => {
    const trades = [
      { status: "TP HIT" as const, pnl: 10 },
      { status: "TP HIT" as const, pnl: 5 },
      { status: "SL HIT" as const, pnl: -8 },
      { status: "DESCARTADO" as const, pnl: 0 },
    ];
    const stats = computeHistoryStats(trades);
    expect(stats.totalTrades).toBe(3);
    expect(stats.winningTrades).toBe(2);
    expect(stats.losingTrades).toBe(1);
    expect(stats.totalPnl).toBe(7);
    expect(stats.grossProfit).toBe(15);
    expect(stats.grossLoss).toBe(8);
    expect(stats.winRate).toBeCloseTo((2 / 3) * 100);
    expect(stats.profitFactor).toBeCloseTo(15 / 8);
  });

  it("profit factor < 1 cuando las pérdidas superan las ganancias", () => {
    const stats = computeHistoryStats([
      { status: "TP HIT" as const, pnl: 3 },
      { status: "SL HIT" as const, pnl: -10 },
    ]);
    expect(stats.profitFactor).toBeLessThan(1);
  });

  it("sin pérdidas y con ganancias, profit factor es el centinela 999 (no Infinity)", () => {
    const stats = computeHistoryStats([{ status: "TP HIT" as const, pnl: 5 }]);
    expect(stats.profitFactor).toBe(999);
  });

  it("sin trades, todo en cero", () => {
    const stats = computeHistoryStats([]);
    expect(stats.profitFactor).toBe(0);
    expect(stats.winRate).toBe(0);
  });
});

describe("computeAvailableStrategies", () => {
  it("devuelve las estrategias distintas, ordenadas alfabéticamente", () => {
    const trades = [
      { strategy: "Tendencial" },
      { strategy: "Macro Breakout" },
      { strategy: "Tendencial" },
      { strategy: "Rango" },
    ];
    expect(computeAvailableStrategies(trades)).toEqual(["Macro Breakout", "Rango", "Tendencial"]);
  });

  it("sin trades, lista vacía", () => {
    expect(computeAvailableStrategies([])).toEqual([]);
  });
});
