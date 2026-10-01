import { Hono } from "hono";
import { parseIndicatorKeys, computeKlineIndicators, dropIncompleteCandle, INDICATOR_WARMUP_CANDLES } from "./klineIndicators.js";

export const marketRouter = new Hono();

// Precio EN VIVO de un símbolo — para "Último precio" en el Detalle de señal,
// que nunca debe salir del close de la última vela CERRADA (puede tener hasta
// ~15 min de atraso; para una señal recién generada, esa vela es la MISMA que
// la originó, así que el desplazamiento daba 0% y "llegás tarde" no podía
// aparecer — bug real encontrado 2026-10-01). Público en Binance, igual que
// `/klines`: pega directo a la REST de Binance, sin ccxt ni llaves de usuario.
marketRouter.get("/ticker", async (c) => {
  const rawSymbol = c.req.query('symbol') || 'SOLUSDT';
  const symbol = rawSymbol.replace(':USDT', '').replace('/', '').toUpperCase();

  try {
    const res = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
    if (!res.ok) {
      return c.json({ error: "Failed to fetch from Binance" }, 500);
    }
    const data = (await res.json()) as { symbol: string; price: string };
    return c.json({ symbol: data.symbol, price: parseFloat(data.price) });
  } catch (error) {
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

marketRouter.get("/klines", async (c) => {
  const rawSymbol = c.req.query('symbol') || 'SOLUSDT';
  const symbol = rawSymbol.replace(':USDT', '').replace('/', '').toUpperCase();
  const interval = c.req.query('interval') || '15m';
  const limitParam = c.req.query('limit') || '100';
  const limit = parseInt(limitParam, 10);
  const endTime = c.req.query('endTime'); // opcional, ms — para ver el gráfico alrededor de una señal pasada, no solo "ahora".
  const indicatorKeys = parseIndicatorKeys(c.req.query('indicators'));

  try {
    // Con indicadores: pedimos de más (calentamiento + la vela en curso que
    // se descarta) para que el indicador más lento (EMA200) ya esté
    // calculado desde la primera vela visible. Sin el parámetro, la
    // respuesta es exactamente la de siempre (array crudo de Binance).
    const fetchLimit = indicatorKeys.length > 0 ? limit + INDICATOR_WARMUP_CANDLES + 1 : limit;

    const params = new URLSearchParams({ symbol, interval, limit: String(fetchLimit) });
    if (endTime) params.set('endTime', endTime);
    const url = `https://fapi.binance.com/fapi/v1/klines?${params.toString()}`;

    const res = await fetch(url);
    if (!res.ok) {
      return c.json({ error: "Failed to fetch from Binance" }, 500);
    }
    const data = (await res.json()) as any[];

    if (indicatorKeys.length === 0) {
      return c.json(data);
    }

    const closed = dropIncompleteCandle(data);
    const visibleCandles = closed.slice(Math.max(0, closed.length - limit));
    const indicators = computeKlineIndicators(closed, indicatorKeys, limit);
    return c.json({ candles: visibleCandles, indicators });
  } catch (error) {
    return c.json({ error: "Internal Server Error" }, 500);
  }
});
