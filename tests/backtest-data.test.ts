import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import { extractSingleFile } from "../src/backtest/data/zip.js";
import { parseKlinesCsv, parseFundingCsv, resample, splitSegments, HOUR_MS, DAY_MS, type Candle } from "../src/backtest/data/candles.js";
import { isEligibleSymbol, baseOf } from "../src/backtest/data/symbols.js";
import { buildUniverse, universeAt } from "../src/backtest/universe.js";

// Arma un zip mínimo de un solo archivo (deflate), con la misma estructura que los de Binance.
function makeZip(name: string, content: string): Buffer {
  const data = deflateRawSync(Buffer.from(content));
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8); // método deflate
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42); // offset del header local
  const centralOffset = local.length + nameBuf.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + nameBuf.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, nameBuf, data, central, nameBuf, eocd]);
}

function candle(openTime: number, close: number, quoteVolume = 1000, extra: Partial<Candle> = {}): Candle {
  return { openTime, open: close, high: close, low: close, close, volume: 1, quoteVolume, trades: 1, takerBuyVolume: 0.5, ...extra };
}

describe("extractSingleFile", () => {
  it("descomprime el único archivo del zip", () => {
    const csv = "1577836800000,1,2,0.5,1.5,10,1577840399999,15,3,4,6,0\n";
    expect(extractSingleFile(makeZip("BTCUSDT-1h-2020-01.csv", csv)).toString()).toBe(csv);
  });

  it("rechaza un buffer que no es zip", () => {
    expect(() => extractSingleFile(Buffer.alloc(100))).toThrow(/ZIP inválido/);
  });
});

describe("parseKlinesCsv", () => {
  const row = (t: number) => `${t},100,110,90,105,7,${t + HOUR_MS - 1},700,12,3,300,0`;

  it("ignora el encabezado, ordena y deduplica", () => {
    const text = ["open_time,open,high,low,close,volume,close_time,quote_volume,count,taker_buy_volume,taker_buy_quote_volume,ignore", row(2 * HOUR_MS), row(HOUR_MS), row(HOUR_MS)].join("\n");
    const out = parseKlinesCsv(text);
    expect(out.map((c) => c.openTime)).toEqual([HOUR_MS, 2 * HOUR_MS]);
    expect(out[0]).toMatchObject({ open: 100, high: 110, low: 90, close: 105, volume: 7, quoteVolume: 700, trades: 12, takerBuyVolume: 3 });
  });

  it("normaliza timestamps en microsegundos a milisegundos", () => {
    const t = 1785542400000;
    expect(parseKlinesCsv(row(t * 1000))[0].openTime).toBe(t);
  });
});

describe("parseFundingCsv", () => {
  it("lee calc_time, intervalo y tasa", () => {
    const out = parseFundingCsv("calc_time,funding_interval_hours,last_funding_rate\n1577836800000,8,-0.00012359\n");
    expect(out).toEqual([{ calcTime: 1577836800000, intervalHours: 8, rate: -0.00012359 }]);
  });
});

describe("resample", () => {
  it("agrega 1h en bloques alineados a 00:00 UTC", () => {
    const base = 10 * DAY_MS;
    const hours = [0, 1, 2, 3].map((h) =>
      candle(base + h * HOUR_MS, 10 + h, 100, { open: 10 + h, high: 20 + h, low: 5 - h, volume: 1, trades: 2, takerBuyVolume: 0.5 })
    );
    const [bar] = resample(hours, 4);
    expect(bar).toEqual({ openTime: base, open: 10, high: 23, low: 2, close: 13, volume: 4, quoteVolume: 400, trades: 8, takerBuyVolume: 2 });
  });

  it("descarta bloques con menos de la mitad de sus velas (hueco)", () => {
    const base = 10 * DAY_MS;
    const out = resample([candle(base, 1), candle(base + 4 * HOUR_MS, 1), candle(base + 5 * HOUR_MS, 1)], 4);
    expect(out.map((c) => c.openTime)).toEqual([base + 4 * HOUR_MS]);
  });
});

describe("splitSegments", () => {
  it("corta la serie ante un hueco de más de 7 días (ticker relistado)", () => {
    const a = [candle(0, 1), candle(HOUR_MS, 1)];
    const b = [candle(HOUR_MS + 8 * DAY_MS, 50)];
    expect(splitSegments([...a, ...b])).toEqual([a, b]);
  });
});

describe("isEligibleSymbol", () => {
  it("acepta perpetuos USDT de cripto, incluidos los 1000x", () => {
    expect(isEligibleSymbol("BTCUSDT", "COIN")).toBe(true);
    expect(isEligibleSymbol("1000PEPEUSDT")).toBe(true);
    expect(baseOf("1000PEPEUSDT")).toBe("1000PEPE");
  });

  it("rechaza stablecoins, delivery, otros quotes y subyacentes no cripto", () => {
    expect(isEligibleSymbol("USDCUSDT")).toBe(false);
    expect(isEligibleSymbol("BTCUSDT_230331")).toBe(false);
    expect(isEligibleSymbol("BTCUSDC")).toBe(false);
    expect(isEligibleSymbol("TSLAUSDT", "EQUITY")).toBe(false);
    expect(isEligibleSymbol("BTCUPUSDT")).toBe(false);
  });
});

describe("buildUniverse", () => {
  const days = (n: number, close: number, qv: number, startDay = 0) =>
    Array.from({ length: n }, (_, i) => candle((startDay + i) * DAY_MS, close, qv));
  const opts = { topN: 2, volumeWindowDays: 3, minHistoryDays: 3 };

  it("rankea por volumen mediano usando solo días ya cerrados", () => {
    const snaps = buildUniverse(new Map([["A", days(5, 10, 100)], ["B", days(5, 20, 500)], ["C", days(5, 30, 300)]]), opts);
    // Primera decisión posible: al cierre del 3er día (velas 0..2) → date = día 3.
    expect(snaps[0].date).toBe(3 * DAY_MS);
    expect(snaps[0].ranked).toEqual(["B", "C"]);
  });

  it("no usa la vela del propio día de decisión (sin look-ahead)", () => {
    const a = days(5, 10, 100);
    a[3] = candle(3 * DAY_MS, 10, 1_000_000); // explota el volumen el día 3
    const snaps = buildUniverse(new Map([["A", a], ["B", days(5, 20, 500)]]), { ...opts, topN: 1 });
    expect(universeAt(snaps, 3 * DAY_MS)!.ranked).toEqual(["B"]); // decisión del día 3: todavía no lo ve
  });

  it("exige historia mínima y deja de incluir un instrumento deslistado", () => {
    const snaps = buildUniverse(new Map([["OLD", days(4, 10, 900)], ["NEW", days(3, 10, 100, 2)]]), opts);
    expect(universeAt(snaps, 3 * DAY_MS)!.ranked).toEqual(["OLD"]); // NEW aún sin 3 días
    expect(universeAt(snaps, 5 * DAY_MS)!.ranked).toEqual(["NEW"]); // OLD ya no cotiza
  });

  it("excluye lo que cotiza ≈ $1 (stablecoin)", () => {
    const snaps = buildUniverse(new Map([["STABLE", days(4, 1.0, 9999)], ["A", days(4, 10, 1)]]), opts);
    expect(snaps.every((s) => !s.ranked.includes("STABLE"))).toBe(true);
  });
});

describe("universeAt", () => {
  it("devuelve el último snapshot con date ≤ t", () => {
    const snaps = [{ date: 10, ranked: ["A"] }, { date: 20, ranked: ["B"] }];
    expect(universeAt(snaps, 5)).toBeNull();
    expect(universeAt(snaps, 15)!.ranked).toEqual(["A"]);
    expect(universeAt(snaps, 20)!.ranked).toEqual(["B"]);
  });
});
