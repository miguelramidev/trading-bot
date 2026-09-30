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
