import { db } from "../src/db/index.js";
import { signalHistory } from "../src/db/schema.js";
import ccxt from "ccxt";

async function run() {
  const trades = await db.query.signalHistory.findMany({
    orderBy: (history, { asc }) => [asc(history.evaluatedAt)]
  });
  
  const tomadas = trades.filter(t => t.decision && t.decision.startsWith("Tomada"));
  console.log(`Encontradas ${tomadas.length} operaciones tomadas.`);

  let balance = 1000;
  const exchange = new ccxt.binance({ options: { defaultType: 'future' } });

  for (const t of tomadas) {
    console.log(`\nSimulando ${t.symbol} (${t.direction}) - Evaluada: ${t.evaluatedAt.toISOString()}`);
    
    const entryPrice = parseFloat(t.entry!);
    const atr = parseFloat(t.atr!);
    
    // NUEVOS PARÁMETROS 2:5
    let slLimit, tpLimit;
    if (t.direction === "LONG") {
      slLimit = entryPrice - (2 * atr);
      tpLimit = entryPrice + (5 * atr);
    } else {
      slLimit = entryPrice + (2 * atr);
      tpLimit = entryPrice - (5 * atr);
    }
    
    const lowerPrice = Math.min(slLimit, tpLimit);
    const upperPrice = Math.max(slLimit, tpLimit);
    
    let stepPct = (atr / 3) / entryPrice;
    if (stepPct < 0.0035) stepPct = 0.0035;
    if (stepPct > 0.012) stepPct = 0.012;
    const stepSize = entryPrice * stepPct;
    
    const numGrids = Math.floor((upperPrice - lowerPrice) / stepSize);
    
    const gridSL = t.direction === "LONG" ? (lowerPrice - stepSize) : (upperPrice + stepSize);
    const gridTP = t.direction === "LONG" ? (upperPrice + stepSize) : (lowerPrice - stepSize);
    
    // Construir lineas de grilla
    let lines = [];
    for(let i=0; i<=numGrids; i++) {
       lines.push(lowerPrice + (i * stepSize));
    }
    
    console.log(`Grid Lines: ${lines.length}, Step: ${(stepPct*100).toFixed(2)}%, SL: ${gridSL.toFixed(4)}, TP: ${gridTP.toFixed(4)}`);

    // Descargar velas 1m desde la entrada
    let candles = [];
    try {
      candles = await exchange.fetchOHLCV(t.symbol, '1m', t.evaluatedAt.getTime(), 1000);
    } catch(e) { console.log(`Error bajando velas: ${e.message}`); continue; }

    // Simulación simplificada de Grid Arbitrage
    // Capital por linea = Balance total / numero de lineas
    const investmentPerLine = balance / lines.length;
    let gridProfits = 0;
    let positionSize = 0; // en USDT nocional
    let avgEntry = 0;
    
    // Estado de las lineas: false = no ejecutada, true = ejecutada (posición tomada)
    // Para SHORT: linea ejecutada significa que vendimos ahí.
    // Para LONG: linea ejecutada significa que compramos ahí.
    
    // Asumiremos que el Grid de Binance empieza comprando/vendiendo a medida que cruza.
    // Una forma rápida de estimar ganancias de grilla: contar cuantas veces el precio cruza una linea de ida y vuelta.
    // Para hacerlo riguroso minuto a minuto:
    let currentPrice = entryPrice;
    let hitEnd = false;
    let endReason = "EXPIRADO";
    
    // Simular el "Matcher"
    // Rastreamos el precio anterior y el actual para ver lineas cruzadas.
    let lastPrice = candles[0][1] as number; // Open de la primera vela
    let execCount = 0;
    
    for (const c of candles) {
       const low = c[3] as number;
       const high = c[2] as number;
       const close = c[4] as number;
       
       // Verificar Kill Switches
       if (t.direction === "LONG") {
         if (low <= gridSL) { hitEnd = true; endReason = "SL"; currentPrice = gridSL; break; }
         if (high >= gridTP) { hitEnd = true; endReason = "TP"; currentPrice = gridTP; break; }
       } else {
         if (high >= gridSL) { hitEnd = true; endReason = "SL"; currentPrice = gridSL; break; }
         if (low <= gridTP) { hitEnd = true; endReason = "TP"; currentPrice = gridTP; break; }
       }
       
       // Contar cruces para estimar arbitraje (por cada cruce completo de 1 step, ganamos el % del step)
       // Esta es una aproximación estadística: si el (High - Low) de una vela abarca N steps, sumamos N * profit
       const rangeSteps = Math.floor((high - low) / stepSize);
       if (rangeSteps >= 1) {
          // Ganancia aproximada por volatilidad intra-vela
          // Por cada step de rebote, ganamos el stepPct neto
          const arbProfit = investmentPerLine * (stepPct - 0.001); // 0.1% fees
          gridProfits += arbProfit * rangeSteps;
          execCount += rangeSteps;
       }
       
       currentPrice = close;
    }
    
    // Calcular PnL de la posicion direccional remanente
    let directionalPnl = 0;
    if (t.direction === "LONG") {
       directionalPnl = balance * ((currentPrice - entryPrice) / entryPrice);
    } else {
       directionalPnl = balance * ((entryPrice - currentPrice) / entryPrice);
    }
    
    const netPnl = directionalPnl + gridProfits;
    balance += netPnl;
    
    console.log(`Finalizó por: ${endReason}`);
    console.log(`Cruces de malla (Arbitraje): ${execCount} veces`);
    console.log(`Ganancia Arbitraje: $${gridProfits.toFixed(2)}`);
    console.log(`PnL Direccional: $${directionalPnl.toFixed(2)}`);
    console.log(`PnL Neto del Trade: $${netPnl.toFixed(2)}`);
    console.log(`Balance Nuevo: $${balance.toFixed(2)}`);
  }
  
  console.log(`\n=== BALANCE FINAL SIMULADO: $${balance.toFixed(2)} ===`);
}

run().then(() => process.exit(0));
