import ccxt from 'ccxt';

async function checkPrecision() {
  try {
    const exchange = new ccxt.binance({
      options: { defaultType: 'future' }
    });
    
    await exchange.loadMarkets();
    const symbol = 'SKHYNIX/USDT:USDT'; // Formato CCXT para futuros lineales
    const market = exchange.markets[symbol];
    
    if (market) {
      console.log(`--- Análisis de Precisión para ${symbol} ---`);
      console.log(`Tamaño mínimo de orden (min): ${market.limits.amount.min}`);
      console.log(`Paso mínimo permitido (step/precision): ${market.precision.amount}`);
      
      const desiredAmountTokens = 20 / 1230.61;
      console.log(`\nTokens deseados para 20 USDT a $1230.61: ${desiredAmountTokens}`);
      
      const truncatedAmount = exchange.amountToPrecision(symbol, desiredAmountTokens);
      console.log(`Tokens redondeados por Binance (amountToPrecision): ${truncatedAmount}`);
      
      const realInvestment = parseFloat(truncatedAmount) * 1230.61;
      console.log(`Inversión real enviada a Binance: $${realInvestment.toFixed(2)} USDT`);
    } else {
      console.log("No se encontró el mercado en CCXT con ese símbolo. Intentando buscar variaciones...");
      const allSymbols = Object.keys(exchange.markets).filter(s => s.includes('SKHYNIX'));
      console.log("Variaciones encontradas:", allSymbols);
    }
  } catch (e) {
    console.error("Error consultando Binance:", e);
  }
}

checkPrecision();
