import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:app/providers/dashboard_provider.dart';

/// Evita que el test dependa de Firebase/red real: pisa el único punto de
/// contacto externo (`fetchDashboardData`) para poder probar el timer solo.
class _TestableDashboardProvider extends DashboardProvider {
  int fetchCount = 0;

  @override
  Future<void> fetchDashboardData({bool forceRefresh = false}) async {
    fetchCount++;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('setActiveTab(true) arranca el polling y pide datos; false lo detiene (cambio de pestaña)', () {
    final provider = _TestableDashboardProvider();
    expect(provider.isPolling, isFalse);

    provider.setActiveTab(true);
    expect(provider.isPolling, isTrue);
    expect(provider.fetchCount, 1);

    provider.setActiveTab(false);
    expect(provider.isPolling, isFalse);
  });

  test('llamar setActiveTab con el mismo valor no reinicia nada ni refetchea', () {
    final provider = _TestableDashboardProvider();
    provider.setActiveTab(true);
    final countAfterFirst = provider.fetchCount;

    provider.setActiveTab(true);
    expect(provider.fetchCount, countAfterFirst);
  });

  test('la app en background detiene el polling aunque la pestaña de Inicio siga activa', () {
    final provider = _TestableDashboardProvider();
    provider.setActiveTab(true);
    expect(provider.isPolling, isTrue);

    provider.didChangeAppLifecycleState(AppLifecycleState.paused);
    expect(provider.isPolling, isFalse);

    provider.didChangeAppLifecycleState(AppLifecycleState.resumed);
    expect(provider.isPolling, isTrue);
  });

  test('en una pestaña que no es Inicio, pasar a background no hace nada (ya estaba detenido)', () {
    final provider = _TestableDashboardProvider();
    expect(provider.isPolling, isFalse);
    provider.didChangeAppLifecycleState(AppLifecycleState.paused);
    expect(provider.isPolling, isFalse);
  });

  test('dispose cancela el timer', () {
    final provider = _TestableDashboardProvider();
    provider.setActiveTab(true);
    provider.dispose();
    expect(provider.isPolling, isFalse);
  });
}
