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
  symbol: string;
  supportLevel: number;
  currentPrice: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  distancePct: number;
  score: number;
};

export class PullbackStrategy {
  private rrRatio: number;
  private slPercent: number;
  private maxDistancePercent: number;
  private emaPeriod: number;

  constructor(riskRewardRatio = 3.0, slPercent = 1.5, maxDistancePercent = 5.0, emaPeriod = 200) {
    this.rrRatio = riskRewardRatio;
    this.slPercent = slPercent / 100.0;
    this.maxDistancePercent = maxDistancePercent / 100.0;
    this.emaPeriod = emaPeriod;
  }

  getHigherTimeframe(ltf: string): string {
    if (ltf === "15m") return "1h";
    if (ltf === "1h") return "4h";
    if (ltf === "4h") return "1d";
    return "1d"; // default fallback
  }

  analyze(ltfCandles: Candle[], htfCandles: Candle[], fetcher: DataFetcher): Omit<Signal, "symbol"> | null {
    if (!ltfCandles || ltfCandles.length < this.emaPeriod) return null;
    if (!htfCandles || htfCandles.length < 10) return null;

    // 1. FILTRO DE TENDENCIA (EMA 200 en la gráfica operativa LTF)
    const closingPrices = ltfCandles.map(c => c.close);
    const emaArray = fetcher.calculateEMA(closingPrices, this.emaPeriod);
    
    const currentPrice = ltfCandles[ltfCandles.length - 1].close;
    const currentEMA = emaArray[emaArray.length - 1];

    // Si el precio actual está por debajo de la EMA 200, estamos en tendencia bajista -> Descartamos la moneda
    if (currentPrice < currentEMA) {
      return null;
    }

    // 2. DETECCIÓN DE ZONAS DE SOPORTE INSTITUCIONAL (en gráfica mayor HTF)
    // Encontramos los Swing Lows de la HTF (excluyendo la vela actual que se está formando)
    const swingLows: number[] = [];
    for (let i = 1; i < htfCandles.length - 2; i++) {
      if (htfCandles[i].low < htfCandles[i - 1].low && htfCandles[i].low < htfCandles[i + 1].low) {
        swingLows.push(htfCandles[i].low);
      }
    }

    if (swingLows.length === 0) return null;

    // Agrupamiento (Clustering) - Buscamos confluencia de al menos 2 toques en un rango de 1.5%
    let bestSupportZone: number | null = null;
    let maxTouches = 0;

    for (let i = 0; i < swingLows.length; i++) {
      const coreLevel = swingLows[i];
      let touches = 1;
      let lowestInCluster = coreLevel;

      for (let j = 0; j < swingLows.length; j++) {
        if (i === j) continue;
        const compareLevel = swingLows[j];
        
        // Si el otro swing low está a menos de 1.5% de distancia del coreLevel
        const distance = Math.abs(coreLevel - compareLevel) / coreLevel;
        if (distance <= 0.015) {
          touches++;
          if (compareLevel < lowestInCluster) {
            lowestInCluster = compareLevel;
          }
        }
      }

      if (touches >= 2 && touches >= maxTouches) {
        // Encontramos una zona con 2 o más toques.
        // Guardamos el punto más bajo de este clúster como nuestro soporte seguro.
        bestSupportZone = lowestInCluster;
        maxTouches = touches;
      }
    }

    if (!bestSupportZone) return null; // No hay zonas de confluencia fuertes

    const supportLevel = bestSupportZone;

    // 3. CÁLCULO DE ENTRADA Y RIESGO
    // Validamos que el precio actual esté por encima del soporte (aún no ha roto)
    if (currentPrice <= supportLevel) return null;

    const distanceToSupport = (currentPrice - supportLevel) / supportLevel;

    // Si estamos demasiado lejos del soporte, la entrada no es inminente
    if (distanceToSupport > this.maxDistancePercent) return null;

    const entryPrice = supportLevel * 1.001; // 0.1% buffer de entrada
    const stopLoss = entryPrice * (1 - this.slPercent);
    const riskPerCoin = entryPrice - stopLoss;
    const takeProfit = entryPrice + (riskPerCoin * this.rrRatio);

    // Score: Premiamos las monedas que están más cerca del precio de entrada
    // y damos un bonus por la cantidad de toques que tuvo la zona en la HTF.
    const distanceScore = this.maxDistancePercent - distanceToSupport;
    const touchBonus = maxTouches * 0.01; 
    const score = distanceScore + touchBonus;

    return {
      supportLevel,
      currentPrice,
      entry: entryPrice,
      stopLoss,
      takeProfit,
      distancePct: distanceToSupport * 100,
      score,
    };
  }

  async runCompetition(fetcher: DataFetcher, symbols: string[], timeframe: string): Promise<Signal | null> {
    let bestSignal: Signal | null = null;
    let bestScore = -1;
    const higherTimeframe = this.getHigherTimeframe(timeframe);

    for (const symbol of symbols) {
      // Descargamos velas operativas para la EMA y precio actual
      const ltfCandles = await fetcher.fetchOhlcv(symbol, timeframe, 200);
      if (!ltfCandles) continue;

      // Descargamos velas de la temporalidad mayor para zonas de soporte
      const htfCandles = await fetcher.fetchOhlcv(symbol, higherTimeframe, 200);
      if (!htfCandles) continue;

      const signal = this.analyze(ltfCandles, htfCandles, fetcher);
      
      if (signal && signal.score > bestScore) {
        bestScore = signal.score;
        bestSignal = { symbol, ...signal };
      }
    }

    return bestSignal;
  }
}
