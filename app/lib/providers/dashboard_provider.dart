import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../core/network/api_client.dart';

/// Fuente única del Inicio: `MobileDashboard`/`DesktopDashboard` lo consumen
/// en vez de duplicar su propio fetch. Vuelve a pedir datos cada 60 s
/// mientras la pestaña de Inicio está activa Y la app está en primer plano.
///
/// La navegación usa `StatefulShellRoute.indexedStack`, que mantiene todas
/// las ramas montadas (oculta la inactiva con `Offstage`, no la destruye),
/// así que `dispose()` nunca se llama solo por cambiar de pestaña. Por eso
/// la visibilidad se decide con [setActiveTab], que `MainScreen` llama con
/// `navigationShell.currentIndex == 0` en cada build.
class DashboardProvider extends ChangeNotifier with WidgetsBindingObserver {
  DashboardProvider() {
    WidgetsBinding.instance.addObserver(this);
  }

  static const _pollInterval = Duration(seconds: 60);

  bool isLoading = true;
  bool setupRequired = false;
  /// `null` = todavía no completó ningún fetch (estado "desconocido", no
  /// debe mostrarse como desconectado/rojo); `true`/`false` una vez que hubo
  /// al menos una respuesta real de `/api/dashboard`.
  bool? binanceConnected;
  String? errorMessage;
  DateTime? lastUpdatedAt;

  double balance = 0.0;
  double unrealizedPnl = 0.0;
  double pnlPercent = 0.0;
  int openTradesCount = 0;
  List<dynamic> positions = [];
  String userName = 'Usuario';
  double freeBalance = 0.0;
  double usedBalance = 0.0;
  List<dynamic> signals = [];
  List<dynamic> chartData = [];
  List<dynamic> pendingSignals = [];
  List<dynamic> recentActivity = [];
  Map<String, dynamic>? marginWarning;
  int maxTrades = 5;

  bool _isTabActive = false;
  bool _isAppForeground = true;
  Timer? _timer;

  /// Solo para tests: si el polling de 60s está activo ahora mismo.
  bool get isPolling => _timer != null;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _isAppForeground = state == AppLifecycleState.resumed;
    _syncTimer();
  }

  /// `MainScreen` lo llama en cada build con si la pestaña de Inicio es la activa.
  void setActiveTab(bool active) {
    if (_isTabActive == active) return;
    _isTabActive = active;
    _syncTimer();
    if (active) fetchDashboardData();
  }

  void _syncTimer() {
    final shouldPoll = _isTabActive && _isAppForeground;
    if (shouldPoll && _timer == null) {
      _timer = Timer.periodic(_pollInterval, (_) => fetchDashboardData(forceRefresh: true));
    } else if (!shouldPoll && _timer != null) {
      _timer!.cancel();
      _timer = null;
    }
  }

  Future<void> fetchDashboardData({bool forceRefresh = false}) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      isLoading = false;
      notifyListeners();
      return;
    }

    if (forceRefresh || lastUpdatedAt == null) {
      isLoading = true;
      notifyListeners();
    }

    try {
      final response = await ApiClient.get('/api/dashboard');
      final data = jsonDecode(response.body);

      if (data['status'] == 'setup_required') {
        setupRequired = true;
        binanceConnected = false;
        errorMessage = null;
      } else if (data['status'] == 'error') {
        setupRequired = false;
        binanceConnected = false;
        errorMessage = data['message'] as String? ?? 'No se pudo consultar Binance.';
      } else {
        setupRequired = false;
        binanceConnected = data['binanceConnected'] == true;
        errorMessage = null;
        balance = (data['balance'] ?? 0).toDouble();
        unrealizedPnl = (data['unrealizedPnl'] ?? 0).toDouble();
        pnlPercent = (data['unrealizedPnlPercent'] ?? 0).toDouble();
        openTradesCount = data['openTrades'] ?? 0;
        positions = data['positions'] ?? [];
        userName = data['userName'] ?? 'Usuario';
        freeBalance = (data['freeBalance'] ?? 0).toDouble();
        usedBalance = (data['usedBalance'] ?? 0).toDouble();
        signals = data['signals'] ?? [];
        chartData = data['chartData'] ?? [];
        pendingSignals = data['pendingSignals'] ?? [];
        recentActivity = data['recentActivity'] ?? [];
        marginWarning = data['marginWarning'] as Map<String, dynamic>?;
        maxTrades = data['maxTrades'] ?? 5;
      }
      lastUpdatedAt = DateTime.now();
    } catch (e) {
      binanceConnected = false;
      errorMessage = 'No se pudo conectar con el servidor. Reintentá en unos segundos.';
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  /// Descarta una señal pendiente (`POST /api/signals/:id/discard`) y refresca.
  Future<bool> discardSignal(int id, {String? reason}) async {
    try {
      final response = await ApiClient.post('/api/signals/$id/discard', body: {'reason': reason ?? ''});
      if (response.statusCode == 200) {
        await fetchDashboardData(forceRefresh: true);
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _timer = null;
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }
}
