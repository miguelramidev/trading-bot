import { describe, it, expect } from "vitest";
import { buildPositioningView, type ShadowSignalLite } from "../src/api/modules/market/infrastructure/positioning.js";
import type { PosCandidate } from "../src/shadow/logic.js";

const NOW = Date.parse("2026-10-06T12:10:00Z");
const BAR = Date.parse("2026-10-06T12:00:00Z");
const cand = (symbol: string, z: number, rank: number): PosCandidate => ({ symbol, rank, z, ratio: 1.5, atr: 1, barClose: BAR, entryOpen: 10 });

function shadow(over: Partial<ShadowSignalLite>): ShadowSignalLite {
  return {
    strategy: "POS_ls_h18", symbol: "X", side: "short", status: "cerrada", signalTime: new Date(BAR - 10 * 3_600_000), signalValue: "2.5",
    entryTime: new Date(BAR - 10 * 3_600_000), entryPrice: "1", stopPrice: "1.1", exitDue: null, exitTime: new Date(BAR), exitReason: "time", netPct: "0.01",
    ...over,
  };
}

describe("buildPositioningView", () => {
  it("ordena por saturación, marca la señal de POS y el carry activo", () => {
    const funding = new Map([["B", Array.from({ length: 21 }, (_, k) => ({ time: NOW - (k + 1) * 8 * 3_600_000, rate: 0.0003 }))]]);
    const v = buildPositioningView([cand("A", 0.5, 1), cand("B", -2.4, 3), cand("C", 2.1, 2)], funding, [], NOW);
    expect(v.rows.map((r) => [r.symbol, r.posSignal])).toEqual([["B", "long"], ["C", "short"], ["A", null]]);
    const b = v.rows[0];
    expect(b.funding7dAnnual).toBeCloseTo((21 * 0.0003 * 365) / 7, 10);
    expect(b.carryActive).toBe(true);
    expect(v.rows[1].fundingLast).toBeNull();
    expect(v.barClose).toBe(new Date(BAR).toISOString());
  });

  it("resume el modo sombra por estrategia: abiertas, cerradas, ganadas y neto", () => {
    const rows = [
      shadow({ netPct: "0.02" }),
      shadow({ netPct: "-0.01" }),
      shadow({ status: "abierta", exitTime: null, netPct: null }),
      shadow({ status: "sin_cupo", exitTime: null, netPct: null }),
      shadow({ strategy: "CARRY_t15_top30", netPct: "0.004" }),
    ];
    const v = buildPositioningView([], new Map(), rows, NOW);
    const pos = v.shadow.summaries.find((s) => s.strategy === "POS_ls_h18")!;
    expect(pos).toMatchObject({ open: 1, closed: 2, wins: 1, noSlot: 1 });
    expect(pos.netPctSum).toBeCloseTo(0.01, 12);
    expect(pos.netPctAvg).toBeCloseTo(0.005, 12);
    expect(v.shadow.open).toHaveLength(1);
    expect(v.shadow.recent).toHaveLength(3);
  });
});

describe("resumen del torneo", () => {
  it("incluye las 4 candidatas; 'solo cortos' cuenta solo las filas de corto de POS", () => {
    const rows = [
      shadow({ side: "short", netPct: "0.02" }),
      shadow({ side: "long", netPct: "-0.01" }),
      shadow({ strategy: "TREND_BTC_sma200", side: "long", status: "abierta", exitTime: null, netPct: null }),
    ];
    const v = buildPositioningView([], new Map(), rows, NOW);
    expect(v.shadow.summaries.map((s) => s.strategy)).toEqual(["POS_ls_h18", "POS_ls_h18_cortos", "CARRY_t15_top30", "TREND_BTC_sma200"]);
    const shorts = v.shadow.summaries.find((s) => s.strategy === "POS_ls_h18_cortos")!;
    expect(shorts).toMatchObject({ closed: 1, wins: 1 });
    expect(v.shadow.summaries.find((s) => s.strategy === "TREND_BTC_sma200")!.open).toBe(1);
  });
});
