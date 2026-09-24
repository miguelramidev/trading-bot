import { Hono } from "hono";

export const marketRouter = new Hono();

marketRouter.get("/klines", async (c) => {
  const symbol = c.req.query('symbol') || 'SOLUSDT';
  const interval = c.req.query('interval') || '15m';
  const limit = c.req.query('limit') || '100';

  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) {
      return c.json({ error: "Failed to fetch from Binance" }, 500);
    }
    const data = await res.json();
    return c.json(data);
  } catch (error) {
    return c.json({ error: "Internal Server Error" }, 500);
  }
});
