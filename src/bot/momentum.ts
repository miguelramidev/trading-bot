import { DataFetcher } from "./data.js";
import { Signal } from "./strategy.js";

type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export class MomentumStrategy {
  private rrRatio: number;
  private atrMultiplier: number;
  private emaPeriod: number;
  private volumeMultiplier: number;

  constructor(riskRewardRatio = 3.0, atrMultiplier = 1.5, emaPeriod = 200, volumeMultiplier = 1.5) {
    this.rrRatio = riskRewardRatio;
    this.atrMultiplier = atrMultiplier;
    this.emaPeriod = emaPeriod;
    this.volumeMultiplier = volumeMultiplier; // Minimo 1.5x de volumen sobre el promedio
  }

  getHigherTimeframe(ltf: string): string {
    if (ltf === "15m") return "1h";
    if (ltf === "1h") return "4h";
    if (ltf === "4h") return "1d";
    return "1d";
  }

  analyze(ltfCandles: Candle[], htfCandles: Candle[], fetcher: DataFetcher): Omit<Signal, "symbol" | "minNotional"> | null {
    if (!ltfCandles || ltfCandles.length < this.emaPeriod) return null;
    if (!htfCandles || htfCandles.length < 20) return null;

    // 1. FILTRO DE TENDENCIA (EMA 200 en la gráfica operativa LTF)
    const closingPrices = ltfCandles.map(c => c.close);
    const emaArray = fetcher.calculateEMA(closingPrices, this.emaPeriod);
    const atrArray = fetcher.calculateATR(ltfCandles, 14);
    
    // Calcular media móvil de volumen (SMA 20 de volumen en LTF para mayor reactividad)
    const volumes = ltfCandles.map(c => c.volume);
    const volumeSMA = fetcher.calculateSMA(volumes, 20);
    
    // Velas más recientes
    const currentCandle = ltfCandles[ltfCandles.length - 1]; // Vela que se está formando
    const lastClosedCandle = ltfCandles[ltfCandles.length - 2]; // La vela que acaba de cerrar (Breakout)
    const lastClosedVolume = lastClosedCandle.volume;
    const avgVolume = volumeSMA[volumeSMA.length - 3]; // Promedio justo antes del pico de volumen

    const currentEMA = emaArray[emaArray.length - 1];
    const currentATR = atrArray[atrArray.length - 1];
    const isLong = currentCandle.close > currentEMA;

    // Validación de Volumen Institucional (Smart Money Concept)
    if (lastClosedVolume < avgVolume * this.volumeMultiplier) {
      return null; // No hay suficiente volumen para considerarlo un impulso institucional verdadero
    }

    // 2. DETECCIÓN DE ZONAS CLAVES RECIENTES (Últimas 30 velas antes del breakout)
    // Buscamos el techo o piso local que acaba de ser roto
    const lookbackCandles = ltfCandles.slice(ltfCandles.length - 32, ltfCandles.length - 2);
    
    let keyLevel = 0;
    
    if (isLong) {
      // Buscar la Resistencia Local (Máximo de las últimas 30 velas antes del breakout)
      keyLevel = Math.max(...lookbackCandles.map(c => c.high));
      
      // Validación del Breakout: La vela anterior debe haber cerrado por encima de esta resistencia fuerte
      if (lastClosedCandle.close <= keyLevel) return null;
      
    } else {
      // Buscar el Soporte Local (Mínimo de las últimas 30 velas)
      keyLevel = Math.min(...lookbackCandles.map(c => c.low));
      
      // Validación del Breakout: La vela anterior debe haber cerrado por debajo de este soporte
      if (lastClosedCandle.close >= keyLevel) return null;
    }

    // 3. CÁLCULO DE ENTRADA Y RIESGO (Breakout & Retest Institucional)
    // En lugar de comprar/vender a precio de mercado (persiguiendo el precio),
    // colocamos la orden Limit en el nivel exacto que acaba de romperse (el Retest).
    
    const entryPrice = keyLevel; 
    let stopLoss = 0;
    let takeProfit = 0;
    let breakevenTarget = 0;
    let riskPerCoin = 0;

    if (isLong) {
      // Si el precio ya se alejó demasiado y es imposible que haga retest pronto, cancelamos (ej. > 3% del nivel)
      if (currentCandle.close > keyLevel * 1.03) return null;

      stopLoss = entryPrice - (currentATR * this.atrMultiplier);
      if (stopLoss <= 0) return null;

      riskPerCoin = entryPrice - stopLoss;
      takeProfit = entryPrice + (riskPerCoin * this.rrRatio);
      breakevenTarget = entryPrice + (riskPerCoin * 1.05);
    } else {
      // Cancelamos si se alejó demasiado hacia abajo
      if (currentCandle.close < keyLevel * 0.97) return null;

      stopLoss = entryPrice + (currentATR * this.atrMultiplier);
      
      riskPerCoin = stopLoss - entryPrice;
      if (riskPerCoin <= 0) return null; 

      takeProfit = entryPrice - (riskPerCoin * this.rrRatio);
      breakevenTarget = entryPrice - (riskPerCoin * 1.05);
    }

    // Score de Momentum: 
    // 1. Depende principalmente del multiplicador de volumen (mientras más alto, más fuerte la inyección de capital)
    const volumeScore = lastClosedVolume / avgVolume; 
    
    // 2. Bonus si el precio actual está muy cerca de hacer el retest (mayor probabilidad de ejecución rápida)
    const distanceToRetest = Math.abs(currentCandle.close - entryPrice) / entryPrice;
    const distanceBonus = Math.max(0, 0.03 - distanceToRetest) * 100; // max ~3 puntos extras

    const score = volumeScore + distanceBonus;

    return {
      strategyName: "Breakout & Retest (Momentum)",
      direction: isLong ? "LONG" : "SHORT",
      expirationCandles: 4, // El momentum se invalida muy rápido si no hay retest inmediato
      supportLevel: keyLevel, // El antiguo techo ahora es piso (o viceversa)
      currentPrice: currentCandle.close,
      entry: entryPrice,
      stopLoss,
      takeProfit,
      breakevenTarget,
      distancePct: distanceToRetest * 100,
      score,
    };
  }

  async runCompetition(fetcher: DataFetcher, symbols: string[], timeframe: string): Promise<Signal | null> {
    let bestSignal: Signal | null = null;
    let bestScore = -1;
    const higherTimeframe = this.getHigherTimeframe(timeframe);

    for (const symbol of symbols) {
      const ltfCandles = await fetcher.fetchOhlcv(symbol, timeframe, 200);
      if (!ltfCandles) continue;
      
      const htfCandles = await fetcher.fetchOhlcv(symbol, higherTimeframe, 200);
      if (!htfCandles) continue;

      const signal = this.analyze(ltfCandles, htfCandles, fetcher);
      
      if (signal && signal.score > bestScore) {
        bestScore = signal.score;
        const minNotional = await fetcher.getMinNotional(symbol);
        bestSignal = { symbol, minNotional, ...signal };
      }
    }

    return bestSignal;
  }
}
