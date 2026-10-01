import { describe, it, expect } from "vitest";
import { pushWarning, type SignalWarning } from "../src/cron/signalWarnings.js";

describe("pushWarning", () => {
  it("agrega la advertencia sin el HTML, con el type/severity dados", () => {
    const list: SignalWarning[] = [];
    pushWarning(list, "riesgo_macro", "high", "⚠️ <b>Riesgo Macro (VETO):</b> texto\n\n");
    expect(list).toEqual([{ type: "riesgo_macro", severity: "high", text: "⚠️ Riesgo Macro (VETO): texto" }]);
  });

  it("no agrega nada si el texto queda vacío después del trim (la condición no se cumplió)", () => {
    const list: SignalWarning[] = [];
    pushWarning(list, "riesgo_macro", "high", "");
    pushWarning(list, "riesgo_macro", "high", "   \n\n  ");
    expect(list).toEqual([]);
  });

  it("saca todas las etiquetas HTML, no solo <b>", () => {
    const list: SignalWarning[] = [];
    pushWarning(list, "x", "info", "<b>Negrita</b> e <i>itálica</i> normal");
    expect(list[0].text).toBe("Negrita e itálica normal");
  });

  it("acumula varias advertencias en la misma lista, en orden", () => {
    const list: SignalWarning[] = [];
    pushWarning(list, "a", "info", "primera");
    pushWarning(list, "b", "high", "segunda");
    expect(list.map((w) => w.type)).toEqual(["a", "b"]);
  });
});
