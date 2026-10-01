import { describe, it, expect } from "vitest";
import { decideReconciliationAction, MISSING_SL_ALERT_THROTTLE_MS } from "../src/cron/reconciliationDecision.js";
import type { NormalizedOrder } from "../src/api/modules/dashboard/infrastructure/protectionOrders.js";

// Caso base: LONG, entrada 100, SL 95, TP 110. Órdenes de protección vivas con la forma
// mínima que exige `classifyProtectionOrders` (ver tests/protection-orders.test.ts).
function sl(triggerPrice: number): NormalizedOrder {
  return { side: "sell", reduceOnly: true, triggerPrice, status: "open" };
}
function tp(triggerPrice: number): NormalizedOrder {
  return { side: "sell", reduceOnly: true, triggerPrice, status: "open" };
}

const base = {
  direction: "LONG" as const,
  entryPrice: 100,
  gridSL: 95,
  gridTP: 110,
  tickSize: 0.1,
  now: new Date("2026-10-01T12:00:00.000Z"),
  lastMissingSlAlertAt: null,
};

describe("decideReconciliationAction — sigue abierta", () => {
  it("posición abierta, SL y TP vivos y el SL coincide con el de la señal: still_open", () => {
    const result = decideReconciliationAction({
      ...base,
      positionOpen: true,
      protectionOrders: [sl(95), tp(110)],
    });

    expect(result).toEqual({ kind: "still_open" });
  });
});

describe("decideReconciliationAction — cerró en TP", () => {
  it("identificado por el prefijo del clientOrderId (tp_)", () => {
    const result = decideReconciliationAction({
      ...base,
      positionOpen: false,
      protectionOrders: [],
      closingFill: { fillsFound: true, avgPrice: 110, quantity: 2, pnl: 20, fee: 1 },
      closingClientOrderId: "tp_BTCUSDTUSDT_abc123",
    });

    expect(result).toEqual({ kind: "closed", reason: "tp", identifiedBy: "clientOrderId", pnl: 19, exitPrice: 110, quantity: 2 });
  });

  it("respaldo por precio cuando no hay clientOrderId: fill cerca del TP", () => {
    const result = decideReconciliationAction({
      ...base,
      positionOpen: false,
      protectionOrders: [],
      closingFill: { fillsFound: true, avgPrice: 110.05, quantity: 1, pnl: 10, fee: 0.5 },
      closingClientOrderId: undefined,
    });

    expect(result).toEqual({ kind: "closed", reason: "tp", identifiedBy: "price", pnl: 9.5, exitPrice: 110.05, quantity: 1 });
  });
});

describe("decideReconciliationAction — cerró en SL", () => {
  it("identificado por el prefijo del clientOrderId (sl_)", () => {
    const result = decideReconciliationAction({
      ...base,
      positionOpen: false,
      protectionOrders: [],
      closingFill: { fillsFound: true, avgPrice: 95, quantity: 2, pnl: -10, fee: 1 },
      closingClientOrderId: "sl_BTCUSDTUSDT_abc123",
    });

    expect(result).toEqual({ kind: "closed", reason: "sl", identifiedBy: "clientOrderId", pnl: -11, exitPrice: 95, quantity: 2 });
  });

  it("respaldo por precio cuando no hay clientOrderId: fill cerca del SL", () => {
    const result = decideReconciliationAction({
      ...base,
      positionOpen: false,
      protectionOrders: [],
      closingFill: { fillsFound: true, avgPrice: 94.98, quantity: 1, pnl: -5, fee: 0.2 },
      closingClientOrderId: undefined,
    });

    expect(result).toEqual({ kind: "closed", reason: "sl", identifiedBy: "price", pnl: -5.2, exitPrice: 94.98, quantity: 1 });
  });
});

describe("decideReconciliationAction — cierre de emergencia", () => {
  it("identificado por el prefijo del clientOrderId (emrg_)", () => {
    const result = decideReconciliationAction({
      ...base,
      positionOpen: false,
      protectionOrders: [],
      closingFill: { fillsFound: true, avgPrice: 97, quantity: 1, pnl: -3, fee: 0.1 },
      closingClientOrderId: "emrg_BTCUSDTUSDT_abc123",
    });

    expect(result).toEqual({ kind: "closed", reason: "emergency", identifiedBy: "clientOrderId", pnl: -3.1, exitPrice: 97, quantity: 1 });
  });
});

describe("decideReconciliationAction — cierre manual", () => {
  it("sin clientOrderId y el precio no calza con SL ni TP: manual", () => {
    const result = decideReconciliationAction({
      ...base,
      positionOpen: false,
      protectionOrders: [],
      closingFill: { fillsFound: true, avgPrice: 102, quantity: 1, pnl: 2, fee: 0.1 },
      closingClientOrderId: undefined,
    });

    expect(result).toEqual({ kind: "closed", reason: "manual", identifiedBy: "unknown", pnl: 1.9, exitPrice: 102, quantity: 1 });
  });

  it("clientOrderId presente pero sin ninguno de los prefijos conocidos: cae al respaldo por precio igual que sin clientOrderId", () => {
    const result = decideReconciliationAction({
      ...base,
      positionOpen: false,
      protectionOrders: [],
      closingFill: { fillsFound: true, avgPrice: 95, quantity: 1, pnl: -5, fee: 0.1 }, // justo en el SL
      closingClientOrderId: "x-algo-externo-123",
    });

    expect(result.kind).toBe("closed");
    expect((result as any).reason).toBe("sl"); // el respaldo por precio igual lo identifica
    expect((result as any).identifiedBy).toBe("price");
  });

  it("sin ningún fill encontrado (ni con reintentos): manual/unknown, con pnl/exitPrice/quantity en null", () => {
    const result = decideReconciliationAction({
      ...base,
      positionOpen: false,
      protectionOrders: [],
      closingFill: { fillsFound: false },
      closingClientOrderId: undefined,
    });

    expect(result).toEqual({ kind: "closed", reason: "manual", identifiedBy: "unknown", pnl: null, exitPrice: null, quantity: null });
  });
});

describe("decideReconciliationAction — sin Stop Loss", () => {
  it("posición abierta sin ninguna orden de protección: missing_stop_loss, shouldAlert=true la primera vez", () => {
    const result = decideReconciliationAction({
      ...base,
      positionOpen: true,
      protectionOrders: [tp(110)], // solo el TP, sin SL
      lastMissingSlAlertAt: null,
    });

    expect(result).toEqual({ kind: "missing_stop_loss", shouldAlert: true });
  });

  it("ya se alertó hace menos del umbral: shouldAlert=false (no repetir la alerta cada ciclo)", () => {
    const result = decideReconciliationAction({
      ...base,
      positionOpen: true,
      protectionOrders: [],
      lastMissingSlAlertAt: new Date(base.now.getTime() - 60 * 60 * 1000), // hace 1h
    });

    expect(result).toEqual({ kind: "missing_stop_loss", shouldAlert: false });
  });

  it("ya pasó el umbral desde la última alerta: shouldAlert=true de nuevo", () => {
    const result = decideReconciliationAction({
      ...base,
      positionOpen: true,
      protectionOrders: [],
      lastMissingSlAlertAt: new Date(base.now.getTime() - MISSING_SL_ALERT_THROTTLE_MS - 1),
    });

    expect(result).toEqual({ kind: "missing_stop_loss", shouldAlert: true });
  });
});

describe("decideReconciliationAction — SL que no coincide con el de la señal", () => {
  it("el SL real está más allá del tick size de distancia del SL de la señal: stop_mismatch", () => {
    const result = decideReconciliationAction({
      ...base,
      positionOpen: true,
      protectionOrders: [sl(96), tp(110)], // señal pedía 95, Binance tiene 96
    });

    expect(result).toEqual({ kind: "stop_mismatch", expectedPrice: 95, actualPrice: 96 });
  });

  it("la diferencia es menor o igual al tick size: no es mismatch, still_open", () => {
    const result = decideReconciliationAction({
      ...base,
      positionOpen: true,
      protectionOrders: [sl(95.1), tp(110)], // 0.1 de diferencia = exactamente el tickSize
    });

    expect(result).toEqual({ kind: "still_open" });
  });
});

describe("decideReconciliationAction — SHORT (simétrico)", () => {
  it("still_open con SL/TP del lado correcto para SHORT", () => {
    const result = decideReconciliationAction({
      direction: "SHORT",
      entryPrice: 100,
      gridSL: 105,
      gridTP: 90,
      tickSize: 0.1,
      now: base.now,
      lastMissingSlAlertAt: null,
      positionOpen: true,
      protectionOrders: [
        { side: "buy", reduceOnly: true, triggerPrice: 105, status: "open" },
        { side: "buy", reduceOnly: true, triggerPrice: 90, status: "open" },
      ],
    });

    expect(result).toEqual({ kind: "still_open" });
  });
});
