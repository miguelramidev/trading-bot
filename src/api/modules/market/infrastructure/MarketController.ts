import { Hono } from "hono";
import { parseIndicatorKeys, computeKlineIndicators, dropIncompleteCandle, INDICATOR_WARMUP_CANDLES } from "./klineIndicators.js";

export const marketRouter = new Hono();

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
