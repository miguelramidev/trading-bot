import { describe, it, expect } from "vitest";
import { countClosedTrades, buildSnapshotMessage } from "../src/cron/reportHelpers.js";

const NOW = Date.parse("2026-10-07T02:00:00Z");
const h = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000);

describe("countClosedTrades", () => {
  it("cuenta solo los trades cerrados en las últimas 24 h, separando ganados y perdidos por PnL real", () => {
    const rows = [
      { closedAt: h(2), realizedPnl: "1.5" },
      { closedAt: h(10), realizedPnl: "-0.4" },
      { closedAt: h(23), realizedPnl: "0" }, // sin ganancia: cuenta como perdido
      { closedAt: h(25), realizedPnl: "3" }, // fuera de la ventana
      { closedAt: null, realizedPnl: null }, // sigue abierta
      { closedAt: h(5), realizedPnl: null }, // cerrada sin PnL registrado: cuenta como tomada, no como ganada ni perdida
    ];
    expect(countClosedTrades(rows, new Date(NOW))).toEqual({ tradesTaken: 4, wins: 1, losses: 2 });
  });
});

describe("buildSnapshotMessage", () => {
  it("muestra los números reales (no el texto del template)", () => {
    const msg = buildSnapshotMessage(40.12, -1.5, { tradesTaken: 3, wins: 1, losses: 2 });
    expect(msg).toContain("$40.12 USDT");
    expect(msg).toContain("-$1.50 USDT");
    expect(msg).toContain("3 cerradas (1 ganadas, 2 perdidas)");
    expect(msg).not.toContain("${");
  });
});
