import 'package:flutter/material.dart';
import 'app_toast.dart';
import '../theme/app_colors.dart';

/// Resultado de negocio de POST /api/signals/:id/execute ("resultado" en la respuesta).
///
/// Semántica (no inferible del nombre):
/// - [advertencia]: falló el Take Profit pero el Stop Loss quedó puesto,
///   o falló el Stop Loss pero el cierre de emergencia de la posición funcionó.
/// - [critico]: falló el Stop Loss y también falló el cierre de emergencia
///   (la posición quedó abierta sin protección).
enum ExecuteResult { ejecutado, rechazado, advertencia, critico }

/// Interpreta la respuesta de /execute con fallback al "status" legacy.
///
/// Un "resultado" desconocido cae en [ExecuteResult.advertencia], nunca en
/// [ExecuteResult.rechazado]: "rechazado" implica que no hay posición abierta,
/// y ese es justamente el supuesto peligroso a evitar ante un valor que no
/// reconocemos.
ExecuteResult parseExecuteResult(Map<String, dynamic> data) {
  final raw = data['resultado'] as String?;
  if (raw != null) {
    for (final value in ExecuteResult.values) {
      if (value.name == raw) return value;
    }
    return ExecuteResult.advertencia;
  }
  return data['status'] == 'success' ? ExecuteResult.ejecutado : ExecuteResult.rechazado;
}

String messageForExecuteResult(ExecuteResult result, Map<String, dynamic> data) {
  final backendMessage = data['message'] as String?;
  switch (result) {
    case ExecuteResult.ejecutado:
      return backendMessage ?? '¡Trade ejecutado en Binance!';
    case ExecuteResult.rechazado:
      return 'Rechazado: ${backendMessage ?? 'motivo desconocido'}';
    case ExecuteResult.advertencia:
      return backendMessage ?? 'Trade ejecutado con una advertencia. Revisá los detalles en Binance.';
    case ExecuteResult.critico:
      return backendMessage ?? 'Se detectó un problema crítico en la ejecución.';
  }
}

/// Muestra el resultado de /execute: toast para ejecutado/rechazado/advertencia,
/// diálogo modal bloqueante para crítico.
Future<void> showExecuteResult(BuildContext context, ExecuteResult result, String message) async {
  switch (result) {
    case ExecuteResult.ejecutado:
      AppToast.showSuccess(context, message);
    case ExecuteResult.rechazado:
      AppToast.showError(context, message);
    case ExecuteResult.advertencia:
      AppToast.showWarning(context, message);
    case ExecuteResult.critico:
      await showCriticalExecuteDialog(context, message);
  }
}

/// Ante un timeout, error de red o respuesta no parseable de /execute no se
/// sabe si la orden llegó a Binance: nunca se muestra como rechazado.
void showUnconfirmedExecuteWarning(BuildContext context) {
  AppToast.showWarning(
    context,
    'No se pudo confirmar el resultado de la ejecución. Revisá Binance o Telegram antes de volver a intentar.',
  );
}

/// Diálogo bloqueante para el caso crítico: requiere tocar "Entendido" para cerrarse.
Future<void> showCriticalExecuteDialog(BuildContext context, String message) {
  return showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (dialogContext) => PopScope(
      canPop: false,
      child: AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text(
          'Alerta crítica',
          style: TextStyle(color: AppColors.criticalRed, fontWeight: FontWeight.bold),
        ),
        content: Text(
          '$message\n\nCerrá la posición manualmente en Binance antes de continuar.',
          style: const TextStyle(color: AppColors.textPrimary),
        ),
        actions: [
          ElevatedButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.criticalRed),
            child: const Text('Entendido', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    ),
  );
}
