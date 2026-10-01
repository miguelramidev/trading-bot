import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { readFileSync } from "fs";
import { join } from "path";
import { DataFetcher } from "../src/bot/data.js";
import {
  parseIndicatorKeys,
  computeKlineIndicators,
  dropIncompleteCandle,
} from "../src/api/modules/market/infrastructure/klineIndicators.js";

describe("parseIndicatorKeys", () => {
  it("separa por comas y descarta claves desconocidas", () => {
    expect(parseIndicatorKeys("ema200, macd, nope")).toEqual(["ema200", "macd"]);
  });

  it("sin parámetro -> array vacío", () => {
    expect(parseIndicatorKeys(undefined)).toEqual([]);
    expect(parseIndicatorKeys("")).toEqual([]);
  });
});

describe("dropIncompleteCandle", () => {
  it("descarta la última vela (la que está en curso), igual que analyze.ts", () => {
    expect(dropIncompleteCandle([1, 2, 3])).toEqual([1, 2]);
  });
});

// Serie de velas fija y determinística (no viene de la red) para el
// requisito de "misma serie que el pipeline real": calculamos con
// `DataFetcher` directo (las mismas funciones que usa analyze.ts) y
// comparamos contra lo que arma `computeKlineIndicators` — tienen que
// coincidir exactamente, porque es la MISMA función, no una copia.
function buildSyntheticKlines(n: number): Array<Array<string | number>> {
  const out: Array<Array<string | number>> = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    price += Math.sin(i / 5) * 0.8 + 0.05;
    const open = price - 0.1;
    const close = price;
    const high = Math.max(open, close) + 0.2;
    const low = Math.min(open, close) - 0.2;
    out.push([i * 900000, open.toFixed(4), high.toFixed(4), low.toFixed(4), close.toFixed(4), "1000", 0, "0", 0, "0", "0", "0"]);
  }
  return out;
}

describe("computeKlineIndicators — misma función que analyze.ts, no una copia", () => {
  it("ema200/macd/adx recortados coinciden exactamente con DataFetcher llamado directo", () => {
    const klines = buildSyntheticKlines(260);
    const limit = 60;

    const result = computeKlineIndicators(klines, ["ema200", "macd", "adx"], limit);

    const fetcher = new DataFetcher();
    const candles = klines.map((k) => ({ high: parseFloat(String(k[2])), low: parseFloat(String(k[3])), close: parseFloat(String(k[4])) }));
    const closes = candles.map((c) => c.close);

    const expectedEma200 = fetcher.calculateEMA(closes, 200).slice(-limit);
    const expectedMacd = fetcher.calculateMACD(closes, 12, 26, 9);
    const expectedAdx = fetcher.calculateADX(candles, 14);

    expect(result.ema200).toEqual(expectedEma200);
    expect(result.macd!.histogram).toEqual(expectedMacd.histogram.slice(-limit));
    expect(result.adx!.adx).toEqual(expectedAdx.adx.slice(-limit));
  });

  it("cada serie queda alineada 1:1 con las velas visibles (mismo largo)", () => {
    const klines = buildSyntheticKlines(260);
    const limit = 60;
    const result = computeKlineIndicators(klines, ["ema200", "macd", "adx"], limit);
    expect(result.ema200).toHaveLength(limit);
    expect(result.macd!.histogram).toHaveLength(limit);
    expect(result.adx!.adx).toHaveLength(limit);
  });

  it("sin indicadores pedidos, no calcula nada", () => {
    expect(computeKlineIndicators(buildSyntheticKlines(10), [], 5)).toEqual({});
  });
});

describe("computeKlineIndicators — historia insuficiente manda null, nunca un array vacío", () => {
  // Símbolo recién listado en Binance (pocas velas de 15m): EMA200 necesita
  // 200, ADX(14) solo 15 — con 50 velas, ADX sí alcanza a calcularse pero
  // EMA200/MACD(slowPeriod=26) no. Antes del fix, `DataFetcher.calculateEMA`
  // devolvía `[]` (no `null`) y eso llegaba crudo hasta acá; un array vacío
  // no es `null`, así que Flutter igual intentaba dibujar la línea (sin
  // datos, en silencio) en vez de mostrar que faltaba historia.
  const klines = buildSyntheticKlines(50);

  it("EMA200 sin historia suficiente -> null, no []", () => {
    const result = computeKlineIndicators(klines, ["ema200"], 30);
    expect(result.ema200).toBeNull();
  });

  it("MACD sin historia suficiente (slowPeriod 26 > 50 no alcanza para el EMA lento) -> null", () => {
    // 50 velas alcanza para el EMA rápido(12)/lento(26) de MACD en sí, así
    // que para forzar el caso insuficiente se prueba con menos velas que el slowPeriod.
    const result = computeKlineIndicators(buildSyntheticKlines(20), ["macd"], 10);
    expect(result.macd).toBeNull();
  });

  it("ADX(14) SÍ alcanza a calcularse con 50 velas aunque EMA200 no: cada indicador es independiente", () => {
    const result = computeKlineIndicators(klines, ["ema200", "adx"], 30);
    expect(result.ema200).toBeNull();
    expect(result.adx).not.toBeNull();
    expect(result.adx!.adx.length).toBeGreaterThan(0);
  });
});

describe("validación contra una señal real (fixture) — el ADX coincide con triggerAdx guardado", () => {
  const fixture = JSON.parse(readFileSync(join(__dirname, "fixtures/real-signal-adx.json"), "utf-8"));

  it(`la señal #${fixture.signalId} (${fixture.symbol}) calcula el mismo ADX que analyze.ts guardó`, () => {
    // Mismo pipeline que analyze.ts: descartar la vela en curso antes de calcular.
    const closed = dropIncompleteCandle(fixture.klines as Array<Array<string | number>>);
    const result = computeKlineIndicators(closed, ["adx"], 1);
    expect(result.adx!.adx[0]).toBeCloseTo(fixture.triggerAdx, 2);
  });
});

describe("GET /api/market/klines — endpoint completo contra la señal real", () => {
  const fixture = JSON.parse(readFileSync(join(__dirname, "fixtures/real-signal-adx.json"), "utf-8"));

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => fixture.klines }))
    );
  });

  async function makeApp() {
    const { marketRouter } = await import("../src/api/modules/market/infrastructure/MarketController.js");
    const app = new Hono();
    app.route("/api/market", marketRouter);
    return app;
  }

  it("sin 'indicators', la respuesta es el array crudo de siempre (sin cambios)", async () => {
    const app = await makeApp();
    const res = await app.request("/api/market/klines?symbol=NILUSDT&interval=15m&limit=100");
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual(fixture.klines);
  });

  it("con indicators=adx, el último valor coincide con el triggerAdx real de la señal", async () => {
    const app = await makeApp();
    const res = await app.request("/api/market/klines?symbol=NILUSDT&interval=15m&limit=1&indicators=adx");
    const body = await res.json();
    expect(body.candles).toHaveLength(1);
    expect(body.indicators.adx.adx[0]).toBeCloseTo(fixture.triggerAdx, 2);
  });
});

describe("GET /api/market/ticker — precio en vivo, nunca el close de la última vela cerrada", () => {
  async function makeApp() {
    const { marketRouter } = await import("../src/api/modules/market/infrastructure/MarketController.js");
    const app = new Hono();
    app.route("/api/market", marketRouter);
    return app;
  }

  it("limpia el símbolo (ccxt 'BTC/USDT:USDT' -> 'BTCUSDT') y devuelve el precio como número", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toContain("symbol=BTCUSDT");
        return { ok: true, json: async () => ({ symbol: "BTCUSDT", price: "65800.50" }) };
      })
    );
    const app = await makeApp();
    const res = await app.request("/api/market/ticker?symbol=BTC/USDT:USDT");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ symbol: "BTCUSDT", price: 65800.5 });
  });

  it("si Binance responde con error, devuelve 500 sin reventar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    const app = await makeApp();
    const res = await app.request("/api/market/ticker?symbol=BTCUSDT");
    expect(res.status).toBe(500);
  });

  it("si fetch lanza (red caída), devuelve 500 sin reventar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("timeout de red");
      })
    );
    const app = await makeApp();
    const res = await app.request("/api/market/ticker?symbol=BTCUSDT");
    expect(res.status).toBe(500);
  });
});
