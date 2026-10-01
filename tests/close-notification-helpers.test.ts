import { describe, it, expect } from "vitest";
import {
  buildCloseTelegramMessage,
  buildClosePushMessage,
  estimatePnlFromOpeningFill,
  estimatePnlFromConfig,
  type CloseNotificationInput,
} from "../src/cron/closeNotificationHelpers.js";

function baseInput(overrides: Partial<CloseNotificationInput> = {}): CloseNotificationInput {
  return {
    symbol: "BTC/USDT:USDT",
    direction: "LONG",
    closeReason: "tp",
    pnl: 12.3456,
    isEstimated: false,
    entryPrice: 65000.12,
    exitPrice: 65800.5,
    ...overrides,
  };
}

describe("buildCloseTelegramMessage", () => {
  it("ganancia real: signo +, 'con comisiones', objetivo tocado", () => {
    const msg = buildCloseTelegramMessage(baseInput());
    expect(msg).toContain("✅");
    expect(msg).toContain("Objetivo tocado");
    expect(msg).toContain("+12.35 USDT");
    expect(msg).toContain("(con comisiones)");
    expect(msg).toContain("Entrada: 65000.12");
    expect(msg).toContain("Salida: 65800.50");
    expect(msg).not.toContain("%"); // sin porcentaje sobre el margen
  });

  it("pérdida real: signo -, stop tocado", () => {
    const msg = buildCloseTelegramMessage(baseInput({ pnl: -8.2, closeReason: "sl" }));
    expect(msg).toContain("❌");
    expect(msg).toContain("Stop tocado");
    expect(msg).toContain("-8.20 USDT");
  });

  it("cero (breakeven real): sin signo, emoji neutro", () => {
    const msg = baseInput({ pnl: 0 });
    const result = buildCloseTelegramMessage(msg);
    expect(result).toContain("➖");
    expect(result).toContain("0.00 USDT");
    expect(result).not.toContain("+0.00");
    expect(result).not.toContain("-0.00");
  });

  it("monto estimado: lo marca claramente, nunca como real", () => {
    const msg = buildCloseTelegramMessage(baseInput({ pnl: 5.5, isEstimated: true }));
    expect(msg).toContain("+5.50 USDT");
    expect(msg).toContain("estimado");
    expect(msg).not.toContain("(con comisiones)");
  });

  it("sin dato (ni real ni estimado): lo dice explícitamente, nunca en silencio", () => {
    const msg = buildCloseTelegramMessage(baseInput({ pnl: null, isEstimated: false }));
    expect(msg).toContain("no disponible");
    expect(msg).toContain("ℹ️");
  });

  it("cierre de emergencia: la etiqueta existe aunque analyze.ts no lo produzca todavía", () => {
    const msg = buildCloseTelegramMessage(baseInput({ closeReason: "emergency", pnl: -3 }));
    expect(msg).toContain("Cierre de emergencia");
  });

  it("escapa HTML del símbolo (nunca inyecta markup crudo en el mensaje)", () => {
    const msg = buildCloseTelegramMessage(baseInput({ symbol: "<script>BTC</script>" }));
    expect(msg).not.toContain("<script>");
    expect(msg).toContain("&lt;script&gt;");
  });

  it("precios faltantes se muestran como '—', nunca null/undefined crudo", () => {
    const msg = buildCloseTelegramMessage(baseInput({ entryPrice: null, exitPrice: null }));
    expect(msg).toContain("Entrada: — → Salida: —");
  });
});

describe("buildClosePushMessage", () => {
  it("texto plano, sin HTML, con el resultado y los precios", () => {
    const { title, body } = buildClosePushMessage(baseInput());
    expect(title).toBe("Trade cerrado: BTC/USDT:USDT");
    expect(body).not.toMatch(/<[^>]+>/);
    expect(body).toContain("LONG");
    expect(body).toContain("Objetivo tocado");
    expect(body).toContain("+12.35 USDT");
    expect(body).toContain("(con comisiones)");
  });

  it("monto estimado también se marca en el push", () => {
    const { body } = buildClosePushMessage(baseInput({ pnl: 2, isEstimated: true }));
    expect(body).toContain("(estimado)");
  });

  it("sin dato: lo dice en el cuerpo del push también", () => {
    const { body } = buildClosePushMessage(baseInput({ pnl: null }));
    expect(body).toContain("resultado no disponible");
  });
});

describe("estimatePnlFromOpeningFill — usa cantidad y precio REALES de los fills de apertura", () => {
  it("LONG ganador: cantidad * (salida - entrada) menos el doble de la comisión de apertura", () => {
    const pnl = estimatePnlFromOpeningFill({
      direction: "LONG",
      openingFill: { quantity: 2, avgPrice: 100, fee: 0.1 },
      exitPrice: 110,
    });
    // 2 * (110-100) = 20, menos 0.1*2 = 0.2 => 19.8
    expect(pnl).toBeCloseTo(19.8);
  });

  it("SHORT ganador: la resta se invierte (gana cuando el precio baja)", () => {
    const pnl = estimatePnlFromOpeningFill({
      direction: "SHORT",
      openingFill: { quantity: 1, avgPrice: 100, fee: 0.05 },
      exitPrice: 90,
    });
    // 1 * (100-90) = 10, menos 0.05*2 = 0.1 => 9.9
    expect(pnl).toBeCloseTo(9.9);
  });

  it("LONG perdedor: el precio bajó, da negativo", () => {
    const pnl = estimatePnlFromOpeningFill({
      direction: "LONG",
      openingFill: { quantity: 1, avgPrice: 100, fee: 0.05 },
      exitPrice: 95,
    });
    expect(pnl).toBeCloseTo(-5.1); // -5 - 0.1
    expect(pnl).toBeLessThan(0);
  });
});

describe("estimatePnlFromConfig — último recurso, con margen/apalancamiento configurados", () => {
  it("LONG ganador: notional = margen*apalancamiento, aplicado al % de movimiento de precio", () => {
    const pnl = estimatePnlFromConfig({
      direction: "LONG",
      entryPrice: 100,
      exitPrice: 105,
      marginUsd: 25,
      leverage: 2,
    });
    // notional = 50, movimiento = +5% => 2.5 bruto, menos fee estimado (50*0.0005*2=0.05)
    expect(pnl).toBeCloseTo(2.45);
  });

  it("SHORT perdedor: el precio subió en contra", () => {
    const pnl = estimatePnlFromConfig({
      direction: "SHORT",
      entryPrice: 100,
      exitPrice: 105,
      marginUsd: 25,
      leverage: 2,
    });
    expect(pnl).toBeLessThan(0);
  });

  it("sin movimiento de precio: da negativo solo por la comisión estimada, nunca exactamente 0", () => {
    const pnl = estimatePnlFromConfig({
      direction: "LONG",
      entryPrice: 100,
      exitPrice: 100,
      marginUsd: 25,
      leverage: 2,
    });
    expect(pnl).toBeCloseTo(-0.05);
  });
});
