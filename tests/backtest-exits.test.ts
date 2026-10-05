import { describe, it, expect } from "vitest";
import { processBar, initExitState, clampCallbackRate } from "../src/backtest/engine/exits.js";

const bar = (open: number, high: number, low: number, close: number) => ({ open, high, low, close });

describe("processBar: stop duro y TP (long)", () => {
  it("sale en el stop si el low lo perfora", () => {
    const s = initExitState("long", 100, 95, 110);
    expect(processBar(s, bar(99, 100, 94, 96))).toEqual({ reason: "stop", price: 95, ambiguous: false });
  });

  it("gap por debajo del stop: el fill es el open, no el nivel", () => {
    const s = initExitState("long", 100, 95, 110);
    expect(processBar(s, bar(90, 92, 88, 91))).toEqual({ reason: "stop", price: 90, ambiguous: false });
  });

  it("toca el TP", () => {
    const s = initExitState("long", 100, 95, 110);
    expect(processBar(s, bar(105, 111, 104, 109))).toEqual({ reason: "take_profit", price: 110, ambiguous: false });
  });

  it("stop y TP en la misma vela: asume el stop (pesimista) y lo marca ambiguo", () => {
    const s = initExitState("long", 100, 95, 110);
    expect(processBar(s, bar(100, 111, 94, 100))).toEqual({ reason: "stop", price: 95, ambiguous: true });
  });

  it("gap a favor por encima del TP: el fill es el open", () => {
    const s = initExitState("long", 100, 95, 110);
    expect(processBar(s, bar(115, 116, 94, 100))).toEqual({ reason: "take_profit", price: 115, ambiguous: false });
  });

  it("no sale si nada se toca", () => {
    const s = initExitState("long", 100, 95, 110);
    expect(processBar(s, bar(100, 105, 97, 103))).toBeNull();
  });
});

describe("processBar: short (espejo)", () => {
  it("stop arriba y TP abajo", () => {
    const s = initExitState("short", 100, 105, 90);
    expect(processBar(s, bar(101, 106, 100, 104))).toEqual({ reason: "stop", price: 105, ambiguous: false });
    const t = initExitState("short", 100, 105, 90);
    expect(processBar(t, bar(95, 96, 89, 92))).toEqual({ reason: "take_profit", price: 90, ambiguous: false });
  });
});

describe("processBar: trailing nativo", () => {
  it("sigue el pico y sale cuando el cierre retrocede el callback desde el pico nuevo", () => {
    const s = initExitState("long", 100, 80, undefined, { callbackRate: 0.05 });
    expect(processBar(s, bar(100, 120, 99, 119))).toBeNull(); // pico 120 → stop 114
    expect(s.trailingPeak).toBe(120);
    expect(processBar(s, bar(119, 119.5, 113, 113.5))).toEqual({ reason: "trailing", price: 114, ambiguous: false });
  });

  it("dentro de la misma vela: pico nuevo y cierre por debajo del stop nuevo → sale al stop nuevo", () => {
    const s = initExitState("long", 100, 80, undefined, { callbackRate: 0.05 });
    const fill = processBar(s, bar(100, 120, 99, 113));
    expect(fill).toEqual({ reason: "trailing", price: 114, ambiguous: false });
  });

  it("si solo el low cruza el stop nuevo pero el cierre no, asume que el low fue antes y no dispara", () => {
    const s = initExitState("long", 100, 80, undefined, { callbackRate: 0.05 });
    expect(processBar(s, bar(100, 120, 99, 118))).toBeNull(); // low 99 < 114 pero cierre 118 > 114
  });

  it("con precio de activación, no trailea hasta alcanzarlo", () => {
    const s = initExitState("long", 100, 90, undefined, { callbackRate: 0.05, activatePrice: 110 });
    expect(processBar(s, bar(100, 108, 95, 96))).toBeNull(); // sin activar: la caída no dispara nada
    expect(s.trailingActive).toBe(false);
    expect(processBar(s, bar(100, 112, 99, 111))).toBeNull(); // activa en 112 → stop 106.4
    expect(s.trailingActive).toBe(true);
    expect(processBar(s, bar(111, 111, 105, 106))?.price).toBeCloseTo(106.4, 10);
  });

  it("el stop duro sigue vigente con el trailing: se toma el peor nivel tocado", () => {
    const s = initExitState("long", 100, 97, undefined, { callbackRate: 0.02 }); // trailing en 98
    expect(processBar(s, bar(100, 100, 96, 96.5))).toEqual({ reason: "stop", price: 97, ambiguous: false });
  });
});

describe("clampCallbackRate", () => {
  it("respeta el rango 0.1 %–10 % de Binance", () => {
    expect(clampCallbackRate(0.0001)).toBe(0.001);
    expect(clampCallbackRate(0.25)).toBe(0.1);
    expect(clampCallbackRate(0.03)).toBe(0.03);
  });
});
