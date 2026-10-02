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
///
/// Estos tres umbrales (Reglas 5/7/8) viajan en `GET /api/users/config`
/// (`minSlDistancePct`/`minEffectiveRR`/`maxSignalAgeMinutes`) — las
/// constantes de acá son solo el respaldo para cuando ese dato no llegó
/// todavía (o falló la carga), nunca la fuente de verdad.
const double kMinStopDistancePct = 0.005;

/// Regla 7: relación riesgo/premio mínima para operar, calculada con el
/// precio EN VIVO — por debajo de esto, `executeTrade` (`MIN_EFFECTIVE_RR`)
/// rechaza la orden. Reemplaza al viejo umbral fijo de "30% de avance hacia
/// el objetivo" para el aviso de "llegás tarde": ahora se basa en la
/// relación real, no en cuánto camino se recorrió.
const double kMinEffectiveRR = 1.5;

/// Regla 8: antigüedad máxima de la señal para poder ejecutarla —
/// `executeTrade` (`MAX_SIGNAL_AGE_MS`) rechaza por encima de esto.
const int kMaxSignalAgeMinutes = 60;
