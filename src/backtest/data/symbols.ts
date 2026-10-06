// Qué perpetuos entran al backtest: USDT-M de cripto, sin stablecoins, tokens apalancados,
// contratos de entrega ni subyacentes no cripto (acciones, commodities).

const STABLE_BASES = new Set(["USDC", "BUSD", "TUSD", "USDP", "FDUSD", "DAI", "USDE", "USD1", "PYUSD", "EUR", "GBP", "AEUR", "EURI", "XUSD", "RLUSD", "U"]);

/** Base del par: "1000PEPEUSDT" → "1000PEPE". */
export function baseOf(symbol: string): string {
  return symbol.endsWith("USDT") ? symbol.slice(0, -4) : symbol;
}

/**
 * `underlyingType` viene del exchangeInfo actual ("COIN", "EQUITY", "COMMODITY"...). Los pares
 * deslistados ya no figuran ahí: sin dato se asume cripto (la regla de nombre igual aplica).
 */
export function isEligibleSymbol(symbol: string, underlyingType?: string): boolean {
  if (!/^[A-Z0-9]+USDT$/.test(symbol)) return false; // descarta USDC, BUSD y delivery (_YYMMDD)
  if (underlyingType && underlyingType !== "COIN") return false;
  const base = baseOf(symbol);
  if (STABLE_BASES.has(base)) return false;
  if (/(UP|DOWN|BULL|BEAR)$/.test(base) && base.length > 4) return false; // tokens apalancados viejos
  return true;
}

/** Precio mediano cerca de $1: stablecoin aunque el nombre no la delate. */
export function looksLikeStablecoin(medianClose: number): boolean {
  return medianClose > 0.97 && medianClose < 1.03;
}
