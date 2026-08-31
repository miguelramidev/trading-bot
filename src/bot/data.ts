import ccxt from "ccxt";

export class DataFetcher {
  private exchange: ccxt.binance;
  private excludedCoins = [
    "BTC/USDT", "ETH/USDT", "BNB/USDT", 
    "USDC/USDT", "FDUSD/USDT", "TUSD/USDT", "BUSD/USDT", "DAI/USDT", "USDP/USDT", "EUR/USDT"
  ];

  constructor() {
    this.exchange = new ccxt.binance({
      enableRateLimit: true,
    });
  }

  async getTop100Pairs(): Promise<string[]> {
    try {
      const tickers = await this.exchange.fetchTickers();
      const usdtPairs: { symbol: string; quoteVolume: number }[] = [];

      for (const [symbol, ticker] of Object.entries(tickers)) {
        if (symbol.endsWith("/USDT") && !this.excludedCoins.includes(symbol)) {
          
          const base = symbol.split("/")[0];
          
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
}
