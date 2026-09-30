/// Comisión de Binance Futures estimada para la UI (ida y vuelta, taker).
/// Es una aproximación para mostrarle al usuario "si toca el stop/objetivo"
/// antes de operar — la ejecución real cobra lo que Binance cobre en el
/// momento y ese PnL real se lee después con `ccxt` (`Trader.getTradeRealizedPnl`),
/// no con esta constante. Único lugar de la app donde vive este número.
const double kRoundTripCommissionRate = 0.0010;
