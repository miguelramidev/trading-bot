/// Comisión de Binance Futures estimada para la UI (ida y vuelta, taker).
/// Es una aproximación para mostrarle al usuario "si toca el stop/objetivo"
/// antes de operar — la ejecución real cobra lo que Binance cobre en el
/// momento y ese PnL real se lee después con `ccxt` (`Trader.getTradeRealizedPnl`),
/// no con esta constante. Único lugar de la app donde vive este número.
const double kRoundTripCommissionRate = 0.0010;

/// Regla 5: distancia mínima del Stop Loss al precio de entrada — por debajo
/// de esto, `Trader.executeTrade` (`src/bot/trader.ts`, `MIN_SL_DISTANCE_PCT`)
/// rechaza la orden sin colocar nada. Mismo valor acá para avisarlo ANTES de
/// que el usuario intente operar, no para decidir nada del lado del cliente
/// — la autoridad sigue siendo el backend. Si `MIN_SL_DISTANCE_PCT` cambia
/// en `trader.ts`, cambiar también acá.
const double kMinStopDistancePct = 0.005;
