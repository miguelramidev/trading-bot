import '../constants/trading_constants.dart';

/// "Si operás ahora" (sección 4.2 del documento de diseño): nocional y
/// resultado en USDT si el precio toca el stop o el objetivo, con la
/// comisión estimada ya descontada. Misma fórmula para LONG y SHORT: el
/// signo de `(exit - entry)` (o su inverso en SHORT) hace el trabajo, no
/// hace falta una rama por dirección.
class TradeProjection {
  final double marginUsd;
  final int leverage;
  final double notionalUsd;
  final double stopResultUsd;
  final double targetResultUsd;

  const TradeProjection({
    required this.marginUsd,
    required this.leverage,
    required this.notionalUsd,
    required this.stopResultUsd,
    required this.targetResultUsd,
  });
}

TradeProjection computeTradeProjection({
  required double entry,
  required double stop,
  required double target,
  required double marginUsd,
  required int leverage,
  required bool isLong,
  double feeRate = kRoundTripCommissionRate,
}) {
  final notionalUsd = marginUsd * leverage;
  final positionSize = entry == 0 ? 0 : notionalUsd / entry;
  final fee = notionalUsd * feeRate;

  double pnlAt(double exitPrice) {
    final rawPnl = (isLong ? (exitPrice - entry) : (entry - exitPrice)) * positionSize;
    return rawPnl - fee;
  }

  return TradeProjection(
    marginUsd: marginUsd,
    leverage: leverage,
    notionalUsd: notionalUsd,
    stopResultUsd: pnlAt(stop),
    targetResultUsd: pnlAt(target),
  );
}

/// Resultado si el precio llega a `level`, a partir del tamaño REAL de la
/// posición (contratos/unidades, el `size` que manda Binance vía ccxt) —
/// a diferencia de [computeTradeProjection], no depende del margen ni del
/// apalancamiento configurados. Hace falta para una posición abierta cuyo
/// apalancamiento no llegó desde Binance (`PositionDetailController.leverage`
/// null): antes esa falta tiraba abajo todo el cálculo de "si toca el stop/
/// objetivo" aunque el tamaño real sí estuviera disponible.
double computeOutcomeFromQuantity({
  required double quantity,
  required double entry,
  required double level,
  required bool isLong,
  double feeRate = kRoundTripCommissionRate,
}) {
  final priceDiff = isLong ? (level - entry) : (entry - level);
  final notionalUsd = quantity * entry;
  final fee = notionalUsd * feeRate;
  return quantity * priceDiff - fee;
}
