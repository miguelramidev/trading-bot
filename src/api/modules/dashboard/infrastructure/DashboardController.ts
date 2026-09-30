import { Hono } from "hono";
import { db } from "../../../../db/index.js";
import { userConfig } from "../../../../db/schema.js";
import { eq, desc, and, isNull, isNotNull } from "drizzle-orm";
import { signalHistory, dailyReports } from "../../../../db/schema.js";
import { decrypt } from "../../../core/utils/encryption.js";
import ccxt from "ccxt";
import { newErrorId } from "../../../core/utils/errors.js";
import type { AuthEnv } from "../../../core/middleware/auth.js";
import {
  filterPendingSignals,
  buildRecentActivity,
  computeMarginWarning,
  PENDING_SIGNALS_LIMIT,
  RECENT_ACTIVITY_LIMIT,
} from "./dashboardHelpers.js";

export const dashboardRouter = new Hono<AuthEnv>();

dashboardRouter.get("/", async (c) => {
  const firebaseUid = c.get("uid");

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
        positions: [], freeBalance: 0, usedBalance: 0, signals: [], chartData: [],
        pendingSignals: [], recentActivity: [], marginWarning: null, binanceConnected: false,
      });
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
    const openPositionsRaw = positions.filter(p => p.contracts && p.contracts > 0);

    // Funding rate real en una sola llamada batched para los símbolos con posición abierta.
    // Si ccxt falla (símbolo no soportado, rate limit, etc.) se manda null: nunca un valor fijo.
    let fundingRates: Record<string, number | null> = {};
    if (openPositionsRaw.length > 0) {
      try {
        const rates = await binance.fetchFundingRates(openPositionsRaw.map(p => p.symbol!));
        for (const [sym, r] of Object.entries(rates)) {
          fundingRates[sym] = (r as any)?.fundingRate ?? null;
        }
      } catch (e) {
        console.error("No se pudo obtener funding rates:", e);
      }
    }

    const openPositions = openPositionsRaw.map(p => {
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
      fundingRate: fundingRates[p.symbol!] ?? null,
    };
    });

    // Señales pendientes (sin decisión, no vencidas) y actividad reciente (con decisión).
    const pendingSignalsRaw = await db.query.signalHistory.findMany({
      where: isNull(signalHistory.decision),
      orderBy: [desc(signalHistory.evaluatedAt)],
      limit: PENDING_SIGNALS_LIMIT,
    });
    const recentActivityRaw = await db.query.signalHistory.findMany({
      where: isNotNull(signalHistory.decision),
      orderBy: [desc(signalHistory.evaluatedAt)],
      limit: RECENT_ACTIVITY_LIMIT,
    });
    const pendingSignals = filterPendingSignals(pendingSignalsRaw);
    const recentActivity = buildRecentActivity(recentActivityRaw);

    // Precio actual batched para señales pendientes + posiciones, una sola llamada fetchTickers.
    const priceSymbols = [...new Set([...pendingSignals.map(s => s.symbol), ...openPositionsRaw.map(p => p.symbol!)])];
    let currentPrices: Record<string, number | null> = {};
    if (priceSymbols.length > 0) {
      try {
        const tickers = await binance.fetchTickers(priceSymbols);
        for (const sym of priceSymbols) {
          currentPrices[sym] = (tickers as any)[sym]?.last ?? null;
        }
      } catch (e) {
        console.error("No se pudo obtener precios actuales:", e);
      }
    }

    const marginWarning = computeMarginWarning(freeBalance, user.montoOperacion ?? 25);

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
      pendingSignals: pendingSignals.map(s => ({
        ...s,
        currentPrice: currentPrices[s.symbol] ?? null,
      })),
      recentActivity,
      marginWarning,
      maxTrades: user.maxTrades ?? 5,
      binanceConnected: true,
    });

  } catch (error: any) {
    // El detalle queda solo en el log; la app muestra este mensaje en su modal de configuración.
    const errorId = newErrorId();
    console.error(`[${errorId}] Dashboard error:`, error);
    return c.json({
      status: "error",
      message: `No se pudo consultar Binance. Revisa tus API Keys o reintenta (ref ${errorId}).`,
      errorId,
      balance: 0,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      openTrades: 0,
      positions: [], freeBalance: 0, usedBalance: 0, signals: [],
      pendingSignals: [], recentActivity: [], marginWarning: null, binanceConnected: false,
    }, 500);
  }
});
