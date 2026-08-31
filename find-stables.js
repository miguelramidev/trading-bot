import ccxt from "ccxt";

async function run() {
  const exchange = new ccxt.binance();
  await exchange.loadMarkets();
  
  const fiatOrStables = [];
  
  for (const symbol of Object.keys(exchange.markets)) {
    if (symbol.endsWith("/USDT")) {
      const base = symbol.split("/")[0];
      // If base ends with USD (e.g., FDUSD, RLUSD, USDC)
      if (
        base.endsWith("USD") || 
        base.endsWith("EUR") ||
        ["DAI", "USDP", "VAI", "USTC", "TRY", "BRL", "RUB", "ZAR", "UAH", "IDRT", "BIDR", "NGN", "ARS", "MXN", "COP", "PEN", "CLP"].includes(base)
      ) {
        fiatOrStables.push(symbol);
      }
    }
  }
  
  console.log(JSON.stringify(fiatOrStables));
}
run();
