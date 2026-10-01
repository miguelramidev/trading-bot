import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../core/network/api_client.dart';
import '../../core/utils/app_toast.dart';
import '../../core/utils/execute_result.dart';
import '../../providers/dashboard_provider.dart';
import '../../widgets/confirm_dialog.dart';
import 'signal_detail_controller.dart';

/// Confirmación + descarte de la señal, compartido entre mobile y desktop.
Future<void> performDiscard(BuildContext context, SignalDetailController controller) async {
  final result = await showDiscardConfirmDialog(context, symbol: controller.symbol);
  if (!result.confirmed || !context.mounted) return;

  controller.setExecuting(true);
  try {
    final id = controller.signal['id'];
    final res = await ApiClient.post('/api/signals/$id/discard', body: {'reason': result.reason ?? ''});
    if (res.statusCode == 200) {
      if (context.mounted) {
        AppToast.showInfo(context, 'Señal descartada');
        // La señal ya no está pendiente: refrescar el Inicio ahora, sin
        // esperar hasta el próximo poll de 60s, para no dejarla mostrada
        // como si siguiera pendiente al volver.
        context.read<DashboardProvider>().fetchDashboardData(forceRefresh: true);
        if (context.canPop()) {
          context.pop();
        } else {
          context.go('/dashboard');
        }
      }
    } else if (context.mounted) {
      AppToast.showError(context, 'Error al descartar');
    }
  } catch (e) {
    if (context.mounted) AppToast.showError(context, 'Error de conexión');
  } finally {
    controller.setExecuting(false);
  }
}

/// Confirmación + ejecución de la señal, compartido entre mobile y desktop.
/// El resultado sigue mostrándose con el módulo de 4 estados existente
/// (`execute_result.dart`), sin cambios.
Future<void> performTrade(BuildContext context, SignalDetailController controller) async {
  final projection = controller.projection;
  final confirmed = await showExecuteConfirmDialog(
    context,
    symbol: controller.symbol,
    isLong: controller.isLong,
    marginUsd: controller.montoOperacion,
    leverageMin: controller.leverageMin,
    leverageMax: controller.leverageMax,
    stopResultUsd: projection.stopResultUsd,
    targetResultUsd: projection.targetResultUsd,
    highSeverityWarnings: controller.highSeverityWarnings,
  );
  if (!confirmed || !context.mounted) return;

  controller.setExecuting(true);
  try {
    final id = controller.signal['id'];
    final res = await ApiClient.post('/api/signals/$id/execute');
    if (res.statusCode == 200) {
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final result = parseExecuteResult(data);
      if (context.mounted) {
        await showExecuteResult(context, result, messageForExecuteResult(result, data));
      }
      if (!context.mounted) return;
      // La señal ya no está pendiente (se ejecutó, con el resultado que sea):
      // refrescar el Inicio ahora, sin esperar el próximo poll de 60s.
      context.read<DashboardProvider>().fetchDashboardData(forceRefresh: true);
      if (context.canPop()) {
        context.pop();
      } else {
        context.go('/dashboard');
      }
    } else if (context.mounted) {
      AppToast.showError(context, 'Error al ejecutar');
    }
  } catch (e) {
    // Timeout, error de red o respuesta no parseable: no sabemos si la orden llegó a Binance.
    if (context.mounted) showUnconfirmedExecuteWarning(context);
  } finally {
    controller.setExecuting(false);
  }
}
