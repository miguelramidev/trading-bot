import ccxt from "ccxt";

export class DataFetcher {
  private exchange: ccxt.binance;
  private excludedCoins = [
    "USDC/USDT", "FDUSD/USDT", "TUSD/USDT", "BUSD/USDT", "DAI/USDT", "USDP/USDT", "EUR/USDT"
  ];

  constructor() {
    this.exchange = new ccxt.binance({
      enableRateLimit: true,
      options: { defaultType: 'future' },
    });
  }

  async getTop100Pairs(): Promise<string[]> {
    try {
      await this.exchange.loadMarkets();
      const tickers = await this.exchange.fetchTickers();
      const usdtPairs: { symbol: string; quoteVolume: number }[] = [];

      for (const [symbol, ticker] of Object.entries(tickers)) {
        const market = this.exchange.markets[symbol];
        
        // Filtrar solo contratos perpetuos lineales de USDT
        if (market && market.linear && market.quote === 'USDT' && market.active !== false && !this.excludedCoins.includes(symbol)) {
          
          const base = market.base;
          
          // Filtrar monedas fiat, stablecoins y tokens apalancados dinámicamente
          if (
            base.endsWith("USD") || // Atrapa USDC, FDUSD, RLUSD, TUSD, BUSD, SUSD...
            base.endsWith("EUR") || // Atrapa EUR, AEUR...
            ["DAI", "USDP", "VAI", "USTC", "USDE", "EURI"].includes(base) || // Otras stables (EURI vale ~1.10 por eso escapó la heurística del $1)
            ["UP", "DOWN", "BULL", "BEAR"].some(t => base.endsWith(t)) // Tokens apalancados
          ) {
            continue;
          }

          // Heurística de precio: Si vale casi exactamente $1.00 (entre 0.97 y 1.03), es casi seguro una stablecoin o fiat
          const lastPrice = ticker.last || 0;
          if (lastPrice >= 0.97 && lastPrice <= 1.03) {
            continue;
          }

          const quoteVolume = ticker.quoteVolume || 0;
          // Filtro estricto de liquidez: Mínimo 15 millones de USDT de volumen en 24h
          if (quoteVolume > 15000000) {
            usdtPairs.push({ symbol, quoteVolume });
          }
        }
      }

      usdtPairs.sort((a, b) => b.quoteVolume - a.quoteVolume);
      return usdtPairs.slice(0, 100).map((p) => p.symbol);
    } catch (error) {
      console.error("Error fetching top 100 pairs:", error);
      return [];
    }
  }

  async fetchOhlcv(symbol: string, timeframe = "1h", limit = 200) {
    try {
      const ohlcv = await this.exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
      // ccxt returns [timestamp, open, high, low, close, volume]
      return ohlcv.map((candle) => ({
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
      const btcCandles = await this.fetchOHLCV("BTC/USDT", timeframe, 100);
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
}
