import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../../core/constants/trading_constants.dart';
import '../../core/network/api_client.dart';
import '../../core/utils/dashboard_mappers.dart';
import '../../core/utils/signal_progress.dart';
import '../../core/utils/signal_status.dart';
import '../../core/utils/signal_warnings.dart';
import '../../core/utils/strategy_name.dart';
import '../../core/utils/trade_projection.dart';

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
  Timer? _priceTimer;

  /// Mismo intervalo que el polling de `DashboardProvider` — no hace falta
  /// que coincidan exactamente, pero mantenerlos iguales evita que el precio
  /// de esta pantalla se sienta más (o menos) "en vivo" que el del Inicio.
  static const _priceRefreshInterval = Duration(seconds: 60);

  SignalDetailController(this.signal) {
    _resolved = Map<String, dynamic>.from(signal);
    _loadUserConfig();
    if (_resolved['btcRegime'] == null) _loadFullSignalIfNeeded();

    // "Último precio" tiene que ser un precio EN VIVO, nunca el close de la
    // última vela CERRADA que traía el gráfico (hasta acá, vía
    // `SignalChartView.onPriceLoaded`): para una señal recién generada esa
    // vela es la MISMA que la originó, así que el desplazamiento daba 0% y
    // "llegás tarde" nunca podía aparecer — bug real, confirmado con datos
    // reales (2026-10-01). `currentPrice` ya viaja en las señales pendientes
    // del Inicio (`/api/dashboard`, de `fetchTickers`) — sirve de placeholder
    // instantáneo mientras se confirma con un pedido directo al ticker.
    final initialPrice = double.tryParse(_resolved['currentPrice']?.toString() ?? '');
    if (initialPrice != null) {
      currentPrice = initialPrice;
      priceUpdatedAt = DateTime.now();
    }
    _loadLiveTicker();
    _priceTimer = Timer.periodic(_priceRefreshInterval, (_) => _loadLiveTicker());
  }

  bool isLoadingConfig = true;
  bool isLoadingFullSignal = false;
  double montoOperacion = 25;
  int leverageMin = 1;
  int leverageMax = 2;
  // Reglas 5/7/8 de RULES.md: umbrales de protección de `executeTrade`, cargados de
  // `GET /api/users/config` en `_loadUserConfig` — las constantes son solo el respaldo
  // para cuando ese dato todavía no llegó.
  double minSlDistancePct = kMinStopDistancePct;
  double minEffectiveRR = kMinEffectiveRR;
  int maxSignalAgeMinutes = kMaxSignalAgeMinutes;
  double? currentPrice;
  DateTime? priceUpdatedAt;
  bool isExecuting = false;

  String get symbol => _resolved['symbol']?.toString() ?? '';
  String get _cleanSymbol => symbol.split(':').first.replaceAll('/', '');
  bool get isLong => isLongDirection(_resolved['direction']);
  String? get decision => _resolved['decision'] as String?;

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
    // `_resolved`, no `signal`: el mapa original no siempre trae decision/
    // isActiveTrade (ninguno de los 3 formatos de origen los garantiza), pero
    // `_resolved` se completa con el backfill de `/api/history/:id` cuando
    // faltan — leer del original mostraba "Expirada" para señales ya
    // ejecutadas/cerradas (ver caso real WIF).
    return computeSignalDetailStatus(
      decision: _resolved['decision'] as String?,
      isActiveTrade: _resolved['isActiveTrade'] == true,
      evaluatedAt: at,
      window: Duration(minutes: maxSignalAgeMinutes),
    );
  }

  /// Si la señal todavía se puede operar en PRINCIPIO (estado "pendiente"):
  /// gatea si se muestra la sección "Si operás ahora" y la barra de
  /// botones. `stopTooTight`/margen insuficiente se manejan aparte, a nivel
  /// de pantalla (mobile/desktop_signal_detail.dart) — igual que el margen,
  /// deshabilitan el botón con un motivo, pero no esconden la sección.
  bool get canOperate => canOperateSignal(status);

  /// Regla 5: mismo umbral que `Trader.executeTrade` — si el stop queda
  /// demasiado cerca de la entrada, Binance va a rechazar la orden. Se
  /// avisa y se bloquea ANTES de que el usuario lo intente.
  bool get stopTooTight => isStopTooTight(entry: entry, stop: stop, threshold: minSlDistancePct);

  /// Regla 6: el precio en vivo ya cruzó el Stop Loss o el Take Profit de la
  /// señal — `executeTrade` rechaza la orden porque esos niveles ya no
  /// tienen sentido contra el precio actual. `false` mientras no haya
  /// precio en vivo todavía (no se inventa un cruce sin dato real).
  bool get entryBeyondLevels =>
      currentPrice != null && isEntryBeyondLevels(isLong: isLong, stop: stop, target: target, price: currentPrice!);

  /// La señal de verdad se ejecutó (se tomó y se operó), no solo se decidió
  /// descartar o todavía está pendiente — gatea la card de "Resultado de la
  /// ejecución", que no tiene sentido mostrar si nunca se operó.
  bool get wasExecuted => (_resolved['decision'] as String?)?.startsWith('Tomada') == true;

  String get strategy => strategyName(_resolved['strategy']?.toString() ?? _resolved['regime']?.toString());
  String? get btcRegime => _resolved['btcRegime']?.toString();
  String? get bias4h => _resolved['bias4h']?.toString();
  String? get fundingRate => _resolved['fundingRate']?.toString();
  String? get btcCorrelation => _resolved['btcCorrelation']?.toString();
  String? get triggerRsi => _resolved['triggerRsi']?.toString();
  String? get triggerAdx => _resolved['triggerAdx']?.toString();
  double? get triggerAdxValue => double.tryParse(_resolved['triggerAdx']?.toString() ?? '');
  String? get reason => _resolved['reason']?.toString();

  /// Advertencias de la señal (riesgo macro, reversa de estrategia, alertas
  /// de caída/rebote) — desde `warnings` (señales nuevas) o, si falta,
  /// parseadas de `reason` por viñetas (señales viejas, mismo criterio de
  /// emoji → severidad). Nunca dependen de `wasExecuted`: a diferencia de
  /// "Resultado de la ejecución", tienen que seguir viéndose después de
  /// ejecutar o descartar.
  List<SignalWarning> get warnings {
    final base = parseSignalWarnings(warningsJson: _resolved['warnings'] as List<dynamic>?, reason: reason);
    return stopTooTight ? sortSignalWarnings([...base, buildStopTooTightWarning()]) : base;
  }

  /// Solo las "high" — para gatear el resumen en el diálogo de confirmación.
  List<SignalWarning> get highSeverityWarnings => warnings.where((w) => w.severity == SignalWarningSeverity.high).toList();

  double? get progress => currentPrice != null ? computeSignalProgress(entry: entry, target: target, price: currentPrice!) : null;
  /// Regla 7: antes se basaba en un 30% fijo de avance hacia el objetivo
  /// (`kSignalLateThreshold`); ahora en la misma relación riesgo/premio
  /// mínima que usa `executeTrade` para rechazar — "llegás tarde" significa
  /// que entrar AHORA ya no cumple esa relación, no un % arbitrario de
  /// camino recorrido. `false` sin precio en vivo (nunca se inventa un aviso
  /// sin dato real) ni si el precio ya cruzó los niveles (ahí es Regla 6,
  /// un rechazo directo, no un "llegás tarde").
  bool get isLate => !entryBeyondLevels && effectiveRR != null && effectiveRR! < minEffectiveRR;
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

  /// Precio en vivo directo de Binance (`GET /api/market/ticker`), nunca el
  /// close de una vela — se llama al abrir la pantalla y cada
  /// `_priceRefreshInterval` mientras siga abierta.
  Future<void> _loadLiveTicker() async {
    if (symbol.isEmpty) return;
    try {
      final res = await ApiClient.get('/api/market/ticker?symbol=$_cleanSymbol');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final price = (data['price'] as num?)?.toDouble();
        if (price != null) setCurrentPrice(price);
      }
    } catch (e) {
      // Se queda con el precio que ya tenía (del Inicio o del ticker
      // anterior) — nunca lo pisa con algo peor ni rompe la pantalla.
    }
  }

  @override
  void dispose() {
    _priceTimer?.cancel();
    super.dispose();
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
        // `/api/history/:id` ya manda `decision`/`isActiveTrade`: el backfill
        // los completa cuando el `signal` original no los traía (por venir
        // de un formato de origen que no los incluye).
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
          // Reglas 5/7/8: si el backend no manda el campo (versión vieja del API, o
          // falló algo puntual), se queda con la constante local ya seteada arriba.
          minSlDistancePct = (data['minSlDistancePct'] as num?)?.toDouble() ?? minSlDistancePct;
          minEffectiveRR = (data['minEffectiveRR'] as num?)?.toDouble() ?? minEffectiveRR;
          maxSignalAgeMinutes = (data['maxSignalAgeMinutes'] as num?)?.toInt() ?? maxSignalAgeMinutes;
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
