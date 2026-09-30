import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../../core/network/api_client.dart';
import '../../core/utils/trade_projection.dart';

/// Órdenes de protección reales en Binance (`GET /api/dashboard/positions/protection`).
class ProtectionInfo {
  final bool hasStopLoss;
  final String? stopLossReason;
  final double? stopLossPrice;
  final double? takeProfitPrice;
  final DateTime? verifiedAt;

  const ProtectionInfo({
    required this.hasStopLoss,
    this.stopLossReason,
    this.stopLossPrice,
    this.takeProfitPrice,
    this.verifiedAt,
  });
}

/// Estado y cálculos del Detalle de posición, compartidos entre
/// `mobile_trade_detail.dart` y `desktop_trade_detail.dart`. Maneja tanto una
/// posición abierta (del Inicio, con datos en vivo de Binance) como un trade
/// ya cerrado (del Historial, solo con lo que guardó `signal_history`) — los
/// nombres de campo del `trade` map difieren entre los dos casos.
class PositionDetailController extends ChangeNotifier {
  final Map<String, dynamic> trade;
  final bool isClosed;

  PositionDetailController(this.trade, {required this.isClosed}) {
    if (!isClosed) _loadProtection();
  }

  bool isLoadingProtection = false;
  ProtectionInfo? protection;
  String? protectionError;

  bool get isLong {
    final side = trade['side']?.toString().toLowerCase();
    if (side != null) return side == 'long';
    return trade['direction']?.toString().toUpperCase() == 'LONG';
  }

  String get symbol => trade['symbol']?.toString() ?? '';

  double get entry => _num(trade['entryPrice']) ?? _num(trade['executedEntryPrice']) ?? _num(trade['entry']) ?? 0;

  /// Último precio (abierta) o precio de salida real (cerrada).
  double get lastPrice => _num(trade['markPrice']) ?? _num(trade['executedExitPrice']) ?? entry;

  double get stop => _num(trade['stopLoss']) ?? entry;
  double get target => _num(trade['takeProfit']) ?? entry;

  double? get pnlUsd => _num(trade['unrealizedPnl']) ?? _num(trade['realizedPnl']);
  double? get pnlPct => _num(trade['percentage']) ?? _num(trade['realizedRoi']);

  int? get leverage => trade['leverage'] is int ? trade['leverage'] as int : int.tryParse(trade['leverage']?.toString() ?? '');
  double? get marginUsd => _num(trade['initialMargin']);
  String? get marginMode => trade['marginMode']?.toString();
  double? get liquidationPrice => _num(trade['liquidationPrice']);
  double? get fundingRate => _num(trade['fundingRate']);
  String get strategy => trade['strategy']?.toString() ?? trade['regime']?.toString() ?? '—';

  int? get signalId {
    final raw = trade['signalId'] ?? trade['id'];
    if (raw is int) return raw;
    return int.tryParse(raw?.toString() ?? '');
  }

  /// `null` cuando falta margen o apalancamiento (siempre el caso en trades
  /// cerrados hasta que exista `trade_executions` — ver ROADMAP.md).
  TradeProjection? get projection {
    final margin = marginUsd;
    final lev = leverage;
    if (margin == null || lev == null) return null;
    return computeTradeProjection(entry: entry, stop: stop, target: target, marginUsd: margin, leverage: lev, isLong: isLong);
  }

  /// El SL real de Binance no coincide con el que la señal intentó poner.
  bool get stopLossMismatch {
    final realStop = protection?.stopLossPrice;
    if (realStop == null || entry == 0) return false;
    final intendedStop = _num(trade['stopLoss']);
    if (intendedStop == null) return false;
    final diffPct = ((realStop - intendedStop) / entry).abs() * 100;
    return diffPct > 0.05;
  }

  double? _num(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString());
  }

  Future<void> _loadProtection() async {
    isLoadingProtection = true;
    notifyListeners();
    try {
      final res = await ApiClient.get('/api/dashboard/positions/protection?symbol=${Uri.encodeComponent(symbol)}');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        protection = ProtectionInfo(
          hasStopLoss: data['hasStopLoss'] == true,
          stopLossReason: data['stopLossReason'] as String?,
          stopLossPrice: _num((data['stopLoss'] as Map<String, dynamic>?)?['price']),
          takeProfitPrice: _num((data['takeProfit'] as Map<String, dynamic>?)?['price']),
          verifiedAt: DateTime.tryParse(data['verifiedAt']?.toString() ?? ''),
        );
      } else {
        protectionError = 'No se pudo verificar la protección en Binance.';
      }
    } catch (e) {
      protectionError = 'No se pudo verificar la protección en Binance.';
    } finally {
      isLoadingProtection = false;
      notifyListeners();
    }
  }
}
