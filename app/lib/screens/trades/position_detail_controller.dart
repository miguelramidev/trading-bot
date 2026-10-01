import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../../core/network/api_client.dart';
import '../../core/utils/strategy_name.dart';
import '../../core/utils/trade_projection.dart';

/// Órdenes de protección reales en Binance (`GET /api/dashboard/positions/protection`).
class ProtectionInfo {
  final bool hasStopLoss;
  final String? stopLossReason;
  final double? stopLossPrice;
  final double? takeProfitPrice;
  final DateTime? verifiedAt;
  final double? tickSize;

  const ProtectionInfo({
    required this.hasStopLoss,
    this.stopLossReason,
    this.stopLossPrice,
    this.takeProfitPrice,
    this.verifiedAt,
    this.tickSize,
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

  /// Último precio (abierta, de `/api/dashboard`) o precio de salida real
  /// (cerrada: `GET /api/history/:id` lo manda como `exitPrice`, no
  /// `executedExitPrice` — ese es el nombre de la columna en la base, no el
  /// de la respuesta HTTP).
  double get lastPrice => _num(trade['markPrice']) ?? _num(trade['exitPrice']) ?? _num(trade['executedExitPrice']) ?? entry;

  double get stop => _num(trade['stopLoss']) ?? entry;
  double get target => _num(trade['takeProfit']) ?? entry;

  /// Igual que `lastPrice`: `/api/history/:id` manda `pnl`/`roi`, no
  /// `realizedPnl`/`realizedRoi` (esos son los nombres de columna).
  double? get pnlUsd => _num(trade['unrealizedPnl']) ?? _num(trade['pnl']) ?? _num(trade['realizedPnl']);
  double? get pnlPct => _num(trade['percentage']) ?? _num(trade['roi']) ?? _num(trade['realizedRoi']);

  int? get leverage => trade['leverage'] is int ? trade['leverage'] as int : int.tryParse(trade['leverage']?.toString() ?? '');
  double? get marginUsd => _num(trade['initialMargin']);
  String? get marginMode => trade['marginMode']?.toString();

  /// "isolated"/"cross" (como lo manda Binance via ccxt) traducido.
  String? get marginModeLabel {
    switch (marginMode?.toLowerCase()) {
      case 'isolated':
        return 'Aislado';
      case 'cross':
        return 'Cruzado';
      default:
        return null;
    }
  }

  double? get liquidationPrice => _num(trade['liquidationPrice']);
  double? get fundingRate => _num(trade['fundingRate']);
  String get strategy => strategyName(trade['strategy']?.toString() ?? trade['regime']?.toString());

  /// Tamaño (contratos) de la posición, si viene (solo abiertas, `positions[]`).
  double? get size => _num(trade['size']);

  /// Nocional = tamaño × entrada (no margen × apalancamiento: ese cálculo se
  /// desvía del real por el redondeo de Binance al ejecutar).
  double? get notionalUsd {
    final s = size;
    if (s == null || entry == 0) return null;
    return s * entry;
  }

  /// Status crudo del cierre ("TP HIT" / "SL HIT" / "DESCARTADO", como lo
  /// manda `GET /api/history/:id`) — solo tiene sentido para trades cerrados.
  /// Traducir siempre con `statusPillVariantForHistory` (mismo mapeo que
  /// `StatusPill` usa en toda la app), nunca mostrarlo crudo.
  String? get closeStatus => trade['status']?.toString();

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
  /// Tolera el redondeo de Binance al tick size del símbolo (si lo
  /// conocemos): hasta 2 ticks de diferencia no cuenta como mismatch. Sin
  /// tick size (símbolo no cargado, consulta vieja) cae a una tolerancia
  /// fija chica, para no marcar falsos positivos por redondeo de precio.
  bool get stopLossMismatch {
    final realStop = protection?.stopLossPrice;
    final intendedStop = _num(trade['stopLoss']);
    if (realStop == null || intendedStop == null) return false;

    final diff = (realStop - intendedStop).abs();
    final tick = protection?.tickSize;
    final tolerance = tick != null ? tick * 2 : intendedStop.abs() * 0.0005;
    return diff > tolerance;
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
          tickSize: _num(data['tickSize']),
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
