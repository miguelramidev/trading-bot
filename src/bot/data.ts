import ccxt from "ccxt";
import { Resource } from "sst";

export class DataFetcher {
  public exchange: any;

  constructor() {
    const apiKey = process.env.BINANCE_API_KEY || ((Resource as any).BINANCE_API_KEY ? (Resource as any).BINANCE_API_KEY.value : undefined);
    const secret = process.env.BINANCE_API_SECRET || ((Resource as any).BINANCE_API_SECRET ? (Resource as any).BINANCE_API_SECRET.value : undefined);

    this.exchange = new (ccxt as any).binance({
      apiKey: apiKey,
      secret: secret,
      enableRateLimit: true,
      options: { defaultType: 'future' },
    });
  }

  async getUSDTBalance(): Promise<{ free: number, total: number }> {
    try {
      if (!this.exchange.apiKey) return { free: 0, total: 0 };
      const balance = await this.exchange.fetchBalance();
      return {
        free: parseFloat(balance['USDT']?.free || '0'),
        total: parseFloat(balance['USDT']?.total || '0')
      };
    } catch(e) {
      console.error("Error fetching balance:", e);
      return { free: 0, total: 0 };
    }
  }

  async getTop100Pairs(): Promise<{symbol: string, rank: number}[]> {
    try {
      await this.exchange.loadMarkets();
      const tickers = await this.exchange.fetchTickers();
      const usdtPairs: { symbol: string; quoteVolume: number }[] = [];

      for (const [symbol, ticker] of Object.entries(tickers)) {
        const market = this.exchange.markets[symbol];
        
        // Filtrar solo contratos perpetuos lineales de USDT
        if (market && market.linear && market.quote === 'USDT' && market.active !== false) {
          
          const base = market.base;
          
          if (["USDC", "FDUSD", "TUSD", "BUSD", "DAI", "USDP", "EUR", "XAUT", "PAXG", "DRAM", "SPY", "GOOGL", "EWY", "SOXL", "SOXS"].includes(base)) {
            continue;
          }

          // Filtrar monedas fiat, stablecoins y tokens apalancados dinámicamente
          if (
            base.endsWith("USD") || // Atrapa USDC, FDUSD, RLUSD, TUSD, BUSD, SUSD...
            base.endsWith("EUR") || // Atrapa EUR, AEUR...
            ["DAI", "USDP", "VAI", "USTC", "USDE", "EURI"].includes(base) || // Otras stables (EURI vale ~1.10 por eso escapó la heurística del $1)
            ["UP", "DOWN", "BULL", "BEAR"].some(t => base.endsWith(t)) || // Tokens apalancados
            (market.info && market.info.underlyingType && market.info.underlyingType !== 'COIN') || // Filtra EQUITIES (GOOGL, SPY), etc.
            (market.info && market.info.contractType && market.info.contractType !== 'PERPETUAL') // Filtra Delivery Contracts (vencimientos)
          ) {
            continue;
          }

          // Heurística de precio: Si vale casi exactamente $1.00 (entre 0.97 y 1.03), es casi seguro una stablecoin o fiat
          const lastPrice = (ticker as any).last || 0;
          if (lastPrice >= 0.97 && lastPrice <= 1.03) {
            continue;
          }

          usdtPairs.push({
            symbol,
            quoteVolume: (ticker as any).quoteVolume || 0,
          });
        }
      }

      usdtPairs.sort((a, b) => b.quoteVolume - a.quoteVolume);
      
      // Tomamos el top 100 y le asignamos el rango (1 a 100)
      return usdtPairs.slice(0, 100).map((p, index) => ({
        symbol: p.symbol,
        rank: index + 1
      }));
    } catch (error) {
      console.error("Error fetching top 100 pairs:", error);
      return [];
    }
  }

  async fetchOhlcv(symbol: string, timeframe = "1h", limit = 200, since?: number) {
    try {
      let allCandles: any[] = [];
      let currentSince = since;
      
      while (allCandles.length < limit) {
        const fetchLimit = Math.min(1500, limit - allCandles.length);
        const ohlcv = await this.exchange.fetchOHLCV(symbol, timeframe, currentSince, fetchLimit);
        if (!ohlcv || ohlcv.length === 0) break;
        
        allCandles = allCandles.concat(ohlcv);
        currentSince = ohlcv[ohlcv.length - 1][0] + 1; // Start from next candle
        
        if (ohlcv.length < fetchLimit) break; // Reached end of available data
      }

      return allCandles.map((candle) => ({
        timestamp: candle[0] as number,
        open: candle[1] as number,
        high: candle[2] as number,
        low: candle[3] as number,
        close: candle[4] as number,
        volume: candle[5] as number,
      }));
    } catch (error) {
      console.error(`Error fetching OHLCV for ${symbol}:`, error);
      return null;
    }
  }

  async fetchFundingRateHistory(symbol: string, limit = 1000, since?: number) {
    try {
      const history = await this.exchange.fetchFundingRateHistory(symbol, since, limit);
      // Returns array of { symbol, fundingRate, timestamp, datetime }
      return history.map((h: any) => ({
        timestamp: h.timestamp as number,
        fundingRate: h.fundingRate as number,
      }));
    } catch (error) {
      // console.error(`Error fetching funding rate history for ${symbol}:`, error.message);
      return [];
    }
  }

  async getMinNotional(symbol: string): Promise<number> {
    try {
      await this.exchange.loadMarkets();
      const market = this.exchange.markets[symbol];
      if (market && market.limits && market.limits.cost && market.limits.cost.min !== undefined) {
        return market.limits.cost.min;
      }
      return 5; // Fallback común en Binance
    } catch (e) {
      return 5;
    }
  }

  async fetchAllCandles(symbol: string, timeframe: string, since: number): Promise<any[]> {
    let allCandles: any[] = [];
    let currentSince = since;
    while (true) {
      const candles = await this.exchange.fetchOHLCV(symbol, timeframe, currentSince, 1000);
      if (!candles || candles.length === 0) break;
      
      allCandles = allCandles.concat(candles);
      
      if (candles.length < 1000) break;
      // Mover el currentSince a la última vela + 1ms para no duplicar
      currentSince = candles[candles.length - 1][0] + 1;
    }
    return allCandles;
  }

  // Utilidad para calcular Media Móvil Exponencial (EMA)
  calculateEMA(prices: number[], period: number): number[] {
    if (prices.length < period) return [];
    
    const k = 2 / (period + 1);
    const emaArray: number[] = [];
    
    // El primer valor de la EMA es un SMA simple
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += prices[i];
    }
    let previousEMA = sum / period;
    
    // Rellenamos el principio con nulls o ceros para mantener la alineación del array, 
    // pero para simplificar, calcularemos directamente alineado a los índices
    for (let i = 0; i < period - 1; i++) {
      emaArray.push(0); // placeholders
    }
    emaArray.push(previousEMA);
    
    for (let i = period; i < prices.length; i++) {
      const currentEMA = (prices[i] - previousEMA) * k + previousEMA;
      emaArray.push(currentEMA);
      previousEMA = currentEMA;
    }
    
    return emaArray;
  }

  // Utilidad para calcular el Average True Range (ATR)
  calculateATR(candles: {high: number, low: number, close: number}[], period: number = 14): number[] {
    if (candles.length < period) return [];

    const trueRanges: number[] = [];
    
    // El primer True Range es simplemente High - Low (no hay close anterior)
    trueRanges.push(candles[0].high - candles[0].low);

    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;

      const tr1 = high - low;
      const tr2 = Math.abs(high - prevClose);
      const tr3 = Math.abs(low - prevClose);

      const trueRange = Math.max(tr1, tr2, tr3);
      trueRanges.push(trueRange);
    }

    // Calcular RMA (Wilder's Smoothing) para el ATR
    const atrArray: number[] = [];
    
    // El primer ATR es la media simple de los primeros N periodos del TR
    let sumTR = 0;
    for (let i = 0; i < period; i++) {
      sumTR += trueRanges[i];
    }
    let previousATR = sumTR / period;

    // Rellenamos el array con ceros para alinear los índices con el array de velas
    for (let i = 0; i < period - 1; i++) {
      atrArray.push(0);
    }
    atrArray.push(previousATR);

    // Wilder's Smoothing Method: ATR_t = (ATR_{t-1} * (n - 1) + TR_t) / n
    for (let i = period; i < trueRanges.length; i++) {
      const currentATR = ((previousATR * (period - 1)) + trueRanges[i]) / period;
      atrArray.push(currentATR);
      previousATR = currentATR;
    }

    return atrArray;
  }

  // Utilidad para calcular la Media Móvil Simple (SMA) - útil para el Volumen
  calculateSMA(values: number[], period: number): number[] {
    if (values.length < period) return [];

    const smaArray: number[] = [];
    
    // Rellenar los primeros espacios vacíos con ceros para mantener la alineación
    for (let i = 0; i < period - 1; i++) {
      smaArray.push(0);
    }

    let currentSum = 0;
    // Suma inicial de los primeros 'period' elementos
    for (let i = 0; i < period; i++) {
      currentSum += values[i];
    }
    smaArray.push(currentSum / period);

    // Ventana deslizante para el resto
    for (let i = period; i < values.length; i++) {
      currentSum = currentSum - values[i - period] + values[i];
      smaArray.push(currentSum / period);
    }

    return smaArray;
  }

  // Utilidad para evaluar el Macro Trend usando Bitcoin (EMA 50)
  async getBtcTrend(timeframe: string): Promise<"UP" | "DOWN"> {
    try {
      const btcCandles = await this.fetchOhlcv("BTC/USDT", timeframe, 100);
      if (!btcCandles || btcCandles.length < 50) return "UP"; // fallback

      const closingPrices = btcCandles.map(c => c.close);
      const ema50 = this.calculateEMA(closingPrices, 50);
      
      const currentPrice = closingPrices[closingPrices.length - 1];
      const currentEma = ema50[ema50.length - 1];

      return currentPrice > currentEma ? "UP" : "DOWN";
    } catch (e) {
      console.error("Error fetching BTC trend:", e);
      return "UP"; // fallback
    }
  }

  calculateRSI(prices: number[], period: number = 14): number[] {
    if (prices.length < period + 1) return [];

    let rsiArray = [];
    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const difference = prices[i] - prices[i - 1];
      if (difference >= 0) gains += difference;
      else losses -= difference;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period; i < prices.length; i++) {
      if (i > period) {
        const difference = prices[i] - prices[i - 1];
        const gain = difference >= 0 ? difference : 0;
        const loss = difference < 0 ? -difference : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
      }

      if (avgLoss === 0) {
        rsiArray.push(100);
      } else {
        const rs = avgGain / avgLoss;
        rsiArray.push(100 - (100 / (1 + rs)));
      }
    }

    // Rellenamos el inicio con 50 (neutral) para que el array tenga la misma longitud
    const padding = new Array(period).fill(50);
    return padding.concat(rsiArray);
  }

  async fetchOpenInterest(symbol: string): Promise<number | null> {
    try {
      const oi = await this.exchange.fetchOpenInterest(symbol);
      return oi ? oi.openInterestValue || oi.openInterestAmount || oi.baseVolume || 0 : null;
    } catch (error) {
      return null;
    }
  }

  async fetchOpenInterestChange4h(symbol: string): Promise<string> {
    try {
      if (this.exchange.has['fetchOpenInterestHistory']) {
        const history = await this.exchange.fetchOpenInterestHistory(symbol, '4h', undefined, 2);
        if (history && history.length >= 2) {
          const past = history[0].openInterestValue || history[0].openInterestAmount || history[0].baseVolume || 0;
          const current = history[1].openInterestValue || history[1].openInterestAmount || history[1].baseVolume || 0;
          if (past > 0) {
            const pct = ((current - past) / past) * 100;
            return pct > 0 ? `+${pct.toFixed(2)}%` : `${pct.toFixed(2)}%`;
          }
        }
      }
      return "N/A";
    } catch (error) {
      return "N/A";
    }
  }

  calculateBollingerBands(prices: number[], period: number = 20, multiplier: number = 2): {upper: number[], middle: number[], lower: number[], width: number[]} {
    if (prices.length < period) return {upper: [], middle: [], lower: [], width: []};
    
    const middle = this.calculateSMA(prices, period);
    const upper: number[] = new Array(period - 1).fill(0);
    const lower: number[] = new Array(period - 1).fill(0);
    const width: number[] = new Array(period - 1).fill(0);

    for (let i = period - 1; i < prices.length; i++) {
      const slice = prices.slice(i - period + 1, i + 1);
      const mean = middle[i];
      
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
      const stdDev = Math.sqrt(variance);
      
      const up = mean + (multiplier * stdDev);
      const low = mean - (multiplier * stdDev);
      
      upper.push(up);
      lower.push(low);
      // Width as a percentage of the middle band
      width.push(mean > 0 ? (up - low) / mean : 0);
    }
    
    return { upper, middle, lower, width };
  }

  calculateADX(candles: {high: number, low: number, close: number}[], period: number = 14): {adx: number[], plusDI: number[], minusDI: number[]} {
    if (candles.length < period + 1) return {adx: [], plusDI: [], minusDI: []};

    const tr: number[] = [];
    const plusDM: number[] = [];
    const minusDM: number[] = [];

    // Primer elemento = 0 para alinear
    tr.push(0);
    plusDM.push(0);
    minusDM.push(0);

    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i-1].close;
      const prevHigh = candles[i-1].high;
      const prevLow = candles[i-1].low;

      tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
      
      const upMove = high - prevHigh;
      const downMove = prevLow - low;

      if (upMove > downMove && upMove > 0) {
        plusDM.push(upMove);
      } else {
        plusDM.push(0);
      }

      if (downMove > upMove && downMove > 0) {
        minusDM.push(downMove);
      } else {
        minusDM.push(0);
      }
    }

    // Wilder's Smoothing Function
    const smooth = (values: number[], p: number) => {
      const smoothed: number[] = new Array(p).fill(0);
      let sum = 0;
      for (let i = 1; i <= p; i++) sum += values[i];
      smoothed.push(sum);
      for (let i = p + 1; i < values.length; i++) {
        smoothed.push(smoothed[i-1] - (smoothed[i-1] / p) + values[i]);
      }
      return smoothed;
    };

    const smoothedTR = smooth(tr, period);
    const smoothedPlusDM = smooth(plusDM, period);
    const smoothedMinusDM = smooth(minusDM, period);

    const plusDI: number[] = new Array(period).fill(0);
    const minusDI: number[] = new Array(period).fill(0);
    const dx: number[] = new Array(period).fill(0);

    for (let i = period; i < candles.length; i++) {
      const pDI = smoothedTR[i] === 0 ? 0 : (smoothedPlusDM[i] / smoothedTR[i]) * 100;
      const mDI = smoothedTR[i] === 0 ? 0 : (smoothedMinusDM[i] / smoothedTR[i]) * 100;
      plusDI.push(pDI);
      minusDI.push(mDI);
      
      const diff = Math.abs(pDI - mDI);
      const sum = pDI + mDI;
      dx.push(sum === 0 ? 0 : (diff / sum) * 100);
    }

    const adx: number[] = new Array(period * 2 - 1).fill(0);
    let adxSum = 0;
    for (let i = period; i < period * 2; i++) {
      if (dx[i]) adxSum += dx[i];
    }
    let currentADX = adxSum / period;
    adx.push(currentADX);

    for (let i = period * 2; i < candles.length; i++) {
      currentADX = ((currentADX * (period - 1)) + dx[i]) / period;
      adx.push(currentADX);
    }

    return { adx, plusDI, minusDI };
  }

  calculateCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n === 0) return 0;
    
    const xSlice = x.slice(-n);
    const ySlice = y.slice(-n);
    
    let sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0, sumXY = 0;
    
    for (let i = 0; i < n; i++) {
      const vx = xSlice[i];
      const vy = ySlice[i];
      sumX += vx;
      sumY += vy;
      sumX2 += vx * vx;
      sumY2 += vy * vy;
      sumXY += vx * vy;
    }
    
    const numerator = (n * sumXY) - (sumX * sumY);
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    if (denominator === 0) return 0;
    return numerator / denominator;
  }
  calculateMACD(prices: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): {macdLine: number[], signalLine: number[], histogram: number[]} {
    if (prices.length < slowPeriod) return {macdLine: [], signalLine: [], histogram: []};
    
    const fastEma = this.calculateEMA(prices, fastPeriod);
    const slowEma = this.calculateEMA(prices, slowPeriod);
    
    const macdLine: number[] = [];
    for (let i = 0; i < prices.length; i++) {
       macdLine.push(fastEma[i] - slowEma[i]);
    }
    
    const signalLine = this.calculateEMA(macdLine, signalPeriod);
    const histogram: number[] = [];
    
    for (let i = 0; i < prices.length; i++) {
       histogram.push(macdLine[i] - signalLine[i]);
    }
    
    return { macdLine, signalLine, histogram };
  }
}
