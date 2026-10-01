import { describe, it, expect } from "vitest";
import {
  mapDecisionToStatus,
  filterPendingSignals,
  buildRecentActivity,
  computeMarginWarning,
  PENDING_SIGNALS_LIMIT,
  RECENT_ACTIVITY_LIMIT,
} from "../src/api/modules/dashboard/infrastructure/dashboardHelpers.js";

describe("mapDecisionToStatus", () => {
  it("sin decisión -> pendiente", () => {
    expect(mapDecisionToStatus(null, false)).toBe("pendiente");
  });

  it("Descartada sin cierre -> descartada", () => {
    expect(mapDecisionToStatus("Descartada", false)).toBe("descartada");
  });

  it("Tomada todavía activa -> enCurso", () => {
    expect(mapDecisionToStatus("Tomada", true)).toBe("enCurso");
  });

  it('Tomada -> Cerrada (TP Tocado) -> objetivo', () => {
    expect(mapDecisionToStatus("Tomada -> Cerrada (TP Tocado)", false)).toBe("objetivo");
  });

  it('Tomada -> Cerrada (SL Tocado) -> stop', () => {
    expect(mapDecisionToStatus("Tomada -> Cerrada (SL Tocado)", false)).toBe("stop");
  });

  it('Descartada -> Cerrada (TP Tocado) -> descartada (la decisión manda, no el resultado simulado)', () => {
    expect(mapDecisionToStatus("Descartada -> Cerrada (TP Tocado)", false)).toBe("descartada");
  });

  it('Descartada -> Cerrada (SL Tocado) -> descartada (la decisión manda, no el resultado simulado)', () => {
    expect(mapDecisionToStatus("Descartada -> Cerrada (SL Tocado)", false)).toBe("descartada");
  });

  it("Tomada sin isActiveTrade (caso raro / dato inconsistente) -> descartada, nunca enCurso fantasma", () => {
    expect(mapDecisionToStatus("Tomada", false)).toBe("descartada");
  });
});

describe("filterPendingSignals", () => {
  const now = new Date("2026-09-30T12:00:00Z");

  it("descarta señales con decisión ya tomada", () => {
    const signals = [{ decision: "Tomada", evaluatedAt: now }];
    expect(filterPendingSignals(signals, now)).toEqual([]);
  });

  it("mantiene una señal pendiente reciente", () => {
    const signals = [{ decision: null, evaluatedAt: new Date(now.getTime() - 5 * 60 * 1000) }];
    expect(filterPendingSignals(signals, now)).toHaveLength(1);
  });

  it("descarta una señal pendiente vencida (más de 60 min)", () => {
    const signals = [{ decision: null, evaluatedAt: new Date(now.getTime() - 61 * 60 * 1000) }];
    expect(filterPendingSignals(signals, now)).toEqual([]);
  });

  it("al límite de 60 min exactos ya no cuenta (estrictamente menor)", () => {
    const signals = [{ decision: null, evaluatedAt: new Date(now.getTime() - 60 * 60 * 1000) }];
    expect(filterPendingSignals(signals, now)).toEqual([]);
  });

  it(`nunca devuelve más de ${PENDING_SIGNALS_LIMIT}`, () => {
    const signals = Array.from({ length: 30 }, (_, i) => ({
      decision: null,
      evaluatedAt: new Date(now.getTime() - i * 1000),
    }));
    expect(filterPendingSignals(signals, now)).toHaveLength(PENDING_SIGNALS_LIMIT);
  });
});

describe("buildRecentActivity", () => {
  const now = new Date("2026-09-30T12:00:00Z");

  it("descarta señales sin decisión (siguen pendientes)", () => {
    const signals = [{ decision: null, evaluatedAt: now, isActiveTrade: false }];
    expect(buildRecentActivity(signals)).toEqual([]);
  });

  it("ordena de más reciente a más antigua y adjunta el status", () => {
    const older = { decision: "Descartada", evaluatedAt: new Date(now.getTime() - 60000), isActiveTrade: false };
    const newer = { decision: "Tomada -> Cerrada (TP Tocado)", evaluatedAt: now, isActiveTrade: false };
    const result = buildRecentActivity([older, newer]);
    expect(result.map((r) => r.status)).toEqual(["objetivo", "descartada"]);
  });

  it(`corta en las últimas ${RECENT_ACTIVITY_LIMIT}`, () => {
    const signals = Array.from({ length: 12 }, (_, i) => ({
      decision: "Descartada",
      evaluatedAt: new Date(now.getTime() - i * 1000),
      isActiveTrade: false,
    }));
    expect(buildRecentActivity(signals)).toHaveLength(RECENT_ACTIVITY_LIMIT);
  });
});

describe("computeMarginWarning", () => {
  it("disponible menor al monto por operación -> insuficiente", () => {
    expect(computeMarginWarning(10, 25)).toEqual({ insufficient: true, availableUsd: 10, requiredUsd: 25 });
  });

  it("disponible mayor o igual -> no insuficiente", () => {
    expect(computeMarginWarning(25, 25).insufficient).toBe(false);
    expect(computeMarginWarning(30, 25).insufficient).toBe(false);
  });
});
