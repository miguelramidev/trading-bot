import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../../core/network/api_client.dart';
import '../../core/utils/dashboard_mappers.dart';
import '../../core/utils/signal_progress.dart';
import '../../core/utils/signal_status.dart';
import '../../core/utils/trade_projection.dart';
import '../../widgets/signal_card.dart' show kSignalLateThreshold;

/// Estado y cálculos del Detalle de señal, compartidos entre
/// `mobile_signal_detail.dart` y `desktop_signal_detail.dart` para no
/// duplicar la lógica (ver hallazgo del paso anterior: `_getSignalStatus`
/// estaba copiada literal en los dos archivos).
class SignalDetailController extends ChangeNotifier {
  final Map<String, dynamic> signal;

  SignalDetailController(this.signal) {
    _loadUserConfig();
  }

  bool isLoadingConfig = true;
  double montoOperacion = 25;
  int leverageMin = 1;
  int leverageMax = 2;
  double? currentPrice;
  DateTime? priceUpdatedAt;
  bool isExecuting = false;

  String get symbol => signal['symbol']?.toString() ?? '';
  bool get isLong => isLongDirection(signal['direction']);
  double get entry => double.tryParse(signal['entry']?.toString() ?? '') ?? 0;
  double get stop => double.tryParse(signal['stopLoss']?.toString() ?? '') ?? entry;
  double get target => double.tryParse(signal['takeProfit']?.toString() ?? '') ?? entry;
  DateTime? get evaluatedAt => DateTime.tryParse(signal['evaluatedAt']?.toString() ?? '');

  SignalDetailStatus get status {
    final at = evaluatedAt;
    if (at == null) return SignalDetailStatus.pendiente;
    return computeSignalDetailStatus(
      decision: signal['decision'] as String?,
      isActiveTrade: signal['isActiveTrade'] == true,
      evaluatedAt: at,
    );
  }

  bool get canOperate => canOperateSignal(status);

  double? get progress => currentPrice != null ? computeSignalProgress(entry: entry, target: target, price: currentPrice!) : null;
  bool get isLate => progress != null && progress! >= kSignalLateThreshold;
  double? get effectiveRR => currentPrice != null ? computeEffectiveRiskReward(stop: stop, price: currentPrice!, target: target) : null;
  double? get designRR => computeEffectiveRiskReward(stop: stop, price: entry, target: target);

  /// "Si operás ahora" (sección 4.2): calculado con el apalancamiento
  /// mínimo de la config, nunca con el que termine escalando `executeTrade`.
  TradeProjection get projection => computeTradeProjection(
        entry: entry,
        stop: stop,
        target: target,
        marginUsd: montoOperacion,
        leverage: leverageMin,
        isLong: isLong,
      );

  void setCurrentPrice(double price) {
    currentPrice = price;
    priceUpdatedAt = DateTime.now();
    notifyListeners();
  }

  void setExecuting(bool value) {
    isExecuting = value;
    notifyListeners();
  }

  Future<void> _loadUserConfig() async {
    try {
      final res = await ApiClient.get('/api/users/config');
      if (res.statusCode == 200) {
        final json = jsonDecode(res.body);
        if (json['success'] == true) {
          final data = json['data'];
          montoOperacion = (data['montoOperacion'] as num?)?.toDouble() ?? montoOperacion;
          leverageMin = data['leverageMin'] as int? ?? leverageMin;
          leverageMax = data['leverageMax'] as int? ?? leverageMax;
        }
      }
    } catch (e) {
      // Se queda con los valores por defecto; la pantalla igual muestra "Si operás ahora"
      // con esos valores conservadores en vez de bloquearse.
    }
    isLoadingConfig = false;
    notifyListeners();
  }
}
