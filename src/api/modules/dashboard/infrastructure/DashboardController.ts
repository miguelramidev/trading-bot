import { Hono } from "hono";
import { db } from "../../../../db/index.js";
import { userConfig } from "../../../../db/schema.js";
import { eq, desc, and } from "drizzle-orm";
import { signalHistory, dailyReports } from "../../../../db/schema.js";
import { decrypt } from "../../../core/utils/encryption.js";
import ccxt from "ccxt";

export const dashboardRouter = new Hono();

dashboardRouter.get("/", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const firebaseUid = authHeader.split(" ")[1];

  try {
    const user = await db.query.userConfig.findFirst({
      where: eq(userConfig.firebaseUid, firebaseUid),
    });

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    if (!user.binanceApiKey || (!user.binanceApiSecret && !user.rsaPrivateKey)) {
      return c.json({ 
        status: "setup_required",
        message: "API Keys no configuradas",
        balance: 0,
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0,
        openTrades: 0,
        positions: [], freeBalance: 0, usedBalance: 0, signals: [], chartData: [] });
    }

    const apiKey = decrypt(user.binanceApiKey);
    const secret = user.binanceApiSecret ? decrypt(user.binanceApiSecret) : undefined;
    const privateKey = user.rsaPrivateKey ? decrypt(user.rsaPrivateKey) : undefined;

    const exchangeArgs: any = {
      apiKey: apiKey,
      enableRateLimit: true,
      options: { defaultType: 'future' }
    };

    if (privateKey) {
      exchangeArgs.secret = privateKey; // CCXT Binance expects the private key inside the 'secret' property
    } else if (secret) {
      exchangeArgs.secret = secret;
    }

    const binance = new ccxt.binance(exchangeArgs);

    // Fetch balance
    const balance = await binance.fetchBalance({ type: 'future' });
    const totalBalance = (balance.total as any)['USDT'] || 0;
    const info = balance.info; // Binance specific info
    
    // Find unrealized PNL from the raw Binance info if available
    let unrealizedPnl = 0;
    if (info && info.assets) {
      const usdtAsset = info.assets.find((a: any) => a.asset === 'USDT');
      if (usdtAsset) {
        unrealizedPnl = parseFloat(usdtAsset.unrealizedProfit || "0");
      }
    }

    const pnlPercent = totalBalance > 0 ? (unrealizedPnl / (totalBalance - unrealizedPnl)) * 100 : 0;
    
    const freeBalance = (balance.free as any)['USDT'] || 0;
    const usedBalance = (balance.used as any)['USDT'] || 0;
    
    // Fetch recent signals
    const signals = await db.query.signalHistory.findMany({
      limit: 5,
      orderBy: [desc(signalHistory.evaluatedAt)]
    });
    
    // Fetch up to 30 days of performance chart data
    const snapshots = await db.query.dailyReports.findMany({
      where: eq(dailyReports.firebaseUid, firebaseUid),
      orderBy: [desc(dailyReports.reportDate)],
      limit: 30
    });
    
    // If no snapshots exist yet, initialize with current balance
    const chartData = snapshots.length > 0 ? snapshots.reverse().map(s => ({
      date: s.reportDate.toISOString(),
      balance: parseFloat(s.balance)
    })) : [{ date: new Date().toISOString(), balance: totalBalance }];

    // Fetch open positions
    const positions = await binance.fetchPositions();
    const activeDbTrades = await db.query.signalHistory.findMany({ where: and(eq(signalHistory.isActiveTrade, true)) });

    const openPositions = positions.filter(p => p.contracts && p.contracts > 0).map(p => {
      const dbTrade = activeDbTrades.find(t => t.symbol === p.symbol);
      return {
      symbol: p.symbol,
      side: p.side, // 'long' or 'short'
      leverage: p.leverage,
      size: p.contracts,
      entryPrice: p.entryPrice,
      unrealizedPnl: p.unrealizedPnl,
      percentage: p.percentage,
      markPrice: p.markPrice,
      liquidationPrice: p.liquidationPrice,
      initialMargin: p.initialMargin,
      marginMode: p.marginMode, // cross / isolated
      stopLoss: dbTrade?.stopLoss,
      takeProfit: dbTrade?.takeProfit,
      strategy: dbTrade?.strategy || dbTrade?.regime || 'Motor Momentum Cuántico',
      fundingRate: '0.0042', // Stub for now or fetch from ticker
    };
    });

    return c.json({
      status: "active",
      balance: totalBalance,
      unrealizedPnl: unrealizedPnl,
      unrealizedPnlPercent: pnlPercent,
      openTrades: openPositions.length,
      positions: openPositions,
      userName: user.name || "Usuario",
      freeBalance,
      usedBalance,
      signals: signals.map(s => ({
        ...s
      })),
      chartData,
    });

  } catch (error: any) {
    console.error("Dashboard error:", error);
    return c.json({ 
      status: "error",
      message: error.message,
      balance: 0,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      openTrades: 0,
      positions: [], freeBalance: 0, usedBalance: 0, signals: [] }, 500);
  }
});
