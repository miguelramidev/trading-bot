import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../../core/network/api_client.dart';
import '../../core/utils/dashboard_mappers.dart';
import '../../core/utils/signal_progress.dart';
import '../../core/utils/signal_status.dart';
import '../../core/utils/strategy_name.dart';
import '../../core/utils/trade_projection.dart';
import '../../widgets/signal_card.dart' show kSignalLateThreshold;

/// Estado y cálculos del Detalle de señal, compartidos entre
/// `mobile_signal_detail.dart` y `desktop_signal_detail.dart` para no
/// duplicar la lógica (ver hallazgo del paso anterior: `_getSignalStatus`
/// estaba copiada literal en los dos archivos).
///
/// El `extra` que llega acá tiene 3 formas distintas según de dónde se
/// navegó (señal pendiente del Inicio, "Ver señal" desde una posición
/// abierta, o "Ver señal" desde el Historial) — ninguna trae todos los
/// campos. `_resolved` arranca como copia de `signal` y se completa con
/// `GET /api/history/:id` cuando falta contexto (`btcRegime`) y se puede
/// resolver un id.
class SignalDetailController extends ChangeNotifier {
  final Map<String, dynamic> signal;
  late final Map<String, dynamic> _resolved;

  SignalDetailController(this.signal) {
    _resolved = Map<String, dynamic>.from(signal);
    _loadUserConfig();
    if (_resolved['btcRegime'] == null) _loadFullSignalIfNeeded();
  }

  bool isLoadingConfig = true;
  bool isLoadingFullSignal = false;
  double montoOperacion = 25;
  int leverageMin = 1;
  int leverageMax = 2;
  double? currentPrice;
  DateTime? priceUpdatedAt;
  bool isExecuting = false;

  String get symbol => _resolved['symbol']?.toString() ?? '';
  bool get isLong => isLongDirection(_resolved['direction']);

  /// La señal pendiente del dashboard manda `entry` (columna de la tabla);
  /// posiciones/historial mandan `entryPrice` (alias de la respuesta HTTP).
  double get entry => double.tryParse(_resolved['entry']?.toString() ?? '') ?? double.tryParse(_resolved['entryPrice']?.toString() ?? '') ?? 0;
  double get stop => double.tryParse(_resolved['stopLoss']?.toString() ?? '') ?? entry;
  double get target => double.tryParse(_resolved['takeProfit']?.toString() ?? '') ?? entry;

  /// Igual que `entry`: el historial manda `date`, no `evaluatedAt`.
  DateTime? get evaluatedAt =>
      DateTime.tryParse(_resolved['evaluatedAt']?.toString() ?? '') ?? DateTime.tryParse(_resolved['date']?.toString() ?? '');

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

  String get strategy => strategyName(_resolved['strategy']?.toString() ?? _resolved['regime']?.toString());
  String? get btcRegime => _resolved['btcRegime']?.toString();
  String? get bias4h => _resolved['bias4h']?.toString();
  String? get fundingRate => _resolved['fundingRate']?.toString();
  String? get btcCorrelation => _resolved['btcCorrelation']?.toString();
  String? get triggerRsi => _resolved['triggerRsi']?.toString();
  String? get triggerAdx => _resolved['triggerAdx']?.toString();
  String? get reason => _resolved['reason']?.toString();

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

  int? get _resolvableId {
    final raw = _resolved['signalId'] ?? _resolved['id'];
    if (raw is int) return raw;
    return int.tryParse(raw?.toString() ?? '');
  }

  Future<void> _loadFullSignalIfNeeded() async {
    final id = _resolvableId;
    if (id == null) return;
    isLoadingFullSignal = true;
    notifyListeners();
    try {
      final res = await ApiClient.get('/api/history/$id');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        // No pisa `decision`/`isActiveTrade` — ese endpoint no los manda, y
        // son los que ya traía `signal` para calcular el estado correcto.
        _resolved.addAll(data);
      }
    } catch (e) {
      // Se queda con lo que ya tenía — ver sección de contexto con "—" donde falte.
    } finally {
      isLoadingFullSignal = false;
      notifyListeners();
    }
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
