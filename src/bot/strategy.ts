import { DataFetcher } from "./data.js";

type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Signal = {
  strategyName: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  expirationCandles: number;
  minNotional: number;
  supportLevel: number;
  currentPrice: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  breakevenTarget: number;
  distancePct: number;
  score: number;
};

export class PullbackStrategy {
  private rrRatio: number;
  private atrMultiplier: number;
  private maxDistancePercent: number;
  private emaPeriod: number;

  constructor(riskRewardRatio = 1.0, atrMultiplier = 2.0, maxDistancePercent = 5.0, emaPeriod = 200) {
    this.rrRatio = riskRewardRatio;
    this.atrMultiplier = atrMultiplier;
    this.maxDistancePercent = maxDistancePercent / 100.0;
    this.emaPeriod = emaPeriod;
  }

  getHigherTimeframe(ltf: string): string {
    if (ltf === "15m") return "1h";
    if (ltf === "1h") return "4h";
    if (ltf === "4h") return "1d";
    return "1d"; // default fallback
  }

  analyze(ltfCandles: Candle[], htfCandles: Candle[], fetcher: DataFetcher, btcTrend: "UP" | "DOWN"): Omit<Signal, "symbol" | "minNotional"> | null {
    if (!ltfCandles || ltfCandles.length < this.emaPeriod) return null;
    if (!htfCandles || htfCandles.length < 10) return null;

    // 1. FILTRO DE TENDENCIA (EMA 200 en la gráfica operativa LTF)
    const closingPrices = ltfCandles.map(c => c.close);
    const emaArray = fetcher.calculateEMA(closingPrices, this.emaPeriod);
    const rsiArray = fetcher.calculateRSI(closingPrices, 14);
    const atrArray = fetcher.calculateATR(ltfCandles, 14);

    const currentCandle = ltfCandles[ltfCandles.length - 1];
    const currentEMA = emaArray[emaArray.length - 1];
    const currentPrice = currentCandle.close;
    const currentATR = atrArray[atrArray.length - 1];
    const currentRSI = rsiArray[rsiArray.length - 1];

    const isLong = currentPrice > currentEMA;

    // Filtro Maestro de Bitcoin (Macro Trend)
    if (isLong && btcTrend === "DOWN") return null;
    if (!isLong && btcTrend === "UP") return null;

    // Filtro Oscilador (RSI) para evitar comprar techos y vender pisos
    if (isLong && currentRSI > 65) return null; // Sobrecomprado, muy peligroso comprar
    if (!isLong && currentRSI < 35) return null; // Sobrevendido, muy peligroso vender en corto

    // 2. DETECCIÓN DE ZONAS INSTITUCIONALES (en gráfica mayor HTF)
    const swingPoints: number[] = [];
    for (let i = 1; i < htfCandles.length - 2; i++) {
      if (isLong) {
        // Swing Lows
        if (htfCandles[i].low < htfCandles[i - 1].low && htfCandles[i].low < htfCandles[i + 1].low) {
          swingPoints.push(htfCandles[i].low);
        }
      } else {
        // Swing Highs
        if (htfCandles[i].high > htfCandles[i - 1].high && htfCandles[i].high > htfCandles[i + 1].high) {
          swingPoints.push(htfCandles[i].high);
        }
      }
    }

    if (swingPoints.length === 0) return null;

    // Agrupamiento (Clustering) - Buscamos confluencia de al menos 2 toques en un rango de 1.5%
    let bestZone: number | null = null;
    let maxTouches = 0;

    for (let i = 0; i < swingPoints.length; i++) {
      const coreLevel = swingPoints[i];
      let htfTouches = 1;
      let extremeInCluster = coreLevel;

      // Buscar toques en la misma zona en temporalidad mayor
      for (let j = 0; j < swingPoints.length; j++) {
        if (i === j) continue;
        const compareLevel = swingPoints[j];
        
        const distance = Math.abs(coreLevel - compareLevel) / coreLevel;
        if (distance <= 0.015) { // 1.5% cluster
          htfTouches++;
          if (isLong && compareLevel < extremeInCluster) {
            extremeInCluster = compareLevel; // Tomamos el nivel más bajo como soporte
          } else if (!isLong && compareLevel > extremeInCluster) {
            extremeInCluster = compareLevel; // Tomamos el nivel más alto como resistencia
          }
        }
      }

      // Validar si en la temporalidad menor también hay toques recientes
      let ltfTouches = 0;
      for (const c of ltfCandles) {
        if (Math.abs(c.low - extremeInCluster) / extremeInCluster < 0.005 || Math.abs(c.high - extremeInCluster) / extremeInCluster < 0.005) {
          ltfTouches++;
        }
      }

      // El total de toques es la suma de HTF y LTF
      const totalTouches = htfTouches + (ltfTouches > 0 ? 1 : 0);

      if (totalTouches >= 2 && totalTouches >= maxTouches) {
        bestZone = extremeInCluster;
        maxTouches = totalTouches;
      }
    }

    if (!bestZone) return null; // No hay zonas de confluencia fuertes

    const level = bestZone;

    // 3. CÁLCULO DE ENTRADA Y RIESGO
    let distanceToZone = 0;
    let entryPrice = 0;
    let stopLoss = 0;
    let takeProfit = 0;
    let breakevenTarget = 0;
    let riskPerCoin = 0;

    if (isLong) {
      if (currentPrice <= level) return null;
      distanceToZone = (currentPrice - level) / level;
      if (distanceToZone > this.maxDistancePercent) return null;

      entryPrice = level * 1.001; // 0.1% buffer de entrada
      stopLoss = entryPrice - (currentATR * this.atrMultiplier);
      if (stopLoss <= 0) return null;

      riskPerCoin = entryPrice - stopLoss;
      takeProfit = entryPrice + (riskPerCoin * this.rrRatio);
      breakevenTarget = entryPrice + (riskPerCoin * 1.05);
    } else {
      if (currentPrice >= level) return null;
      distanceToZone = (level - currentPrice) / level;
      if (distanceToZone > this.maxDistancePercent) return null;

      entryPrice = level * 0.999; // 0.1% buffer por debajo
      stopLoss = entryPrice + (currentATR * this.atrMultiplier);
      
      riskPerCoin = stopLoss - entryPrice;
      if (riskPerCoin <= 0) return null; 

      takeProfit = entryPrice - (riskPerCoin * this.rrRatio);
      breakevenTarget = entryPrice - (riskPerCoin * 1.05);
    }

    // Score: Premiamos las monedas que están más cerca del precio de entrada
    // y damos un bonus por la cantidad de toques que tuvo la zona en la HTF.
    const distanceScore = this.maxDistancePercent - distanceToZone;
    const touchBonus = maxTouches * 0.01; 
    const score = distanceScore + touchBonus;

    return {
      strategyName: "Pullback Institucional",
      direction: isLong ? "LONG" : "SHORT",
      expirationCandles: 12, // Pullbacks pueden tomar más tiempo en desarrollarse
      supportLevel: level,
      currentPrice,
      entry: entryPrice,
      stopLoss,
      takeProfit,
      breakevenTarget,
      distancePct: distanceToZone * 100,
      score,
    };
  }

  async runCompetition(fetcher: DataFetcher, symbols: string[], timeframe: string, btcTrend: "UP" | "DOWN"): Promise<Signal | null> {
    let bestSignal: Signal | null = null;
    let bestScore = -1;
    const higherTimeframe = this.getHigherTimeframe(timeframe);

    for (const symbol of symbols) {
      // Descargamos velas operativas para la EMA y precio actual
      const ltfCandles = await fetcher.fetchOhlcv(symbol, timeframe, 200);
      if (!ltfCandles) continue;

      // Descargamos velas de la temporalidad mayor para zonas de soporte/resistencia
      const htfCandles = await fetcher.fetchOhlcv(symbol, higherTimeframe, 200);
      if (!htfCandles) continue;

      const signal = this.analyze(ltfCandles, htfCandles, fetcher, btcTrend);
      
      if (signal && signal.score > bestScore) {
        bestScore = signal.score;
        const minNotional = await fetcher.getMinNotional(symbol);
        bestSignal = { symbol, minNotional, ...signal };
      }
    }

    return bestSignal;
  }
}
