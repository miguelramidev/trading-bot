import 'package:flutter/material.dart';
import 'package:toastification/toastification.dart';
import '../theme/ds_colors.dart';

class AppToast {
  static void showSuccess(BuildContext context, String message) {
    _showToast(
      context: context,
      message: message,
      type: ToastificationType.success,
      color: DsColors.positive,
      icon: Icons.check_circle_outline,
    );
  }

  static void showError(BuildContext context, String message) {
    _showToast(
      context: context,
      message: message,
      type: ToastificationType.error,
      color: DsColors.negative,
      icon: Icons.error_outline,
    );
  }

  static void showInfo(BuildContext context, String message) {
    _showToast(
      context: context,
      message: message,
      type: ToastificationType.info,
      color: DsColors.accent,
      icon: Icons.info_outline,
    );
  }

  static void showWarning(BuildContext context, String message) {
    _showToast(
      context: context,
      message: message,
      type: ToastificationType.warning,
      color: DsColors.warning,
      icon: Icons.warning_amber_outlined,
      autoCloseDuration: const Duration(seconds: 6),
    );
  }

  // Crítico: nunca se cierra solo, hay que tocarlo a mano para descartarlo.
  static void showCritical(BuildContext context, String message) {
    _showToast(
      context: context,
      message: message,
      type: ToastificationType.error,
      color: DsColors.critical,
      icon: Icons.report_gmailerrorred_outlined,
      autoCloseDuration: null,
      closeButtonShowType: CloseButtonShowType.always,
    );
  }

  static void _showToast({
    required BuildContext context,
    required String message,
    required ToastificationType type,
    required Color color,
    required IconData icon,
    Duration? autoCloseDuration = const Duration(seconds: 4),
    CloseButtonShowType closeButtonShowType = CloseButtonShowType.none,
  }) {
    // Distinción entre Web (pantallas grandes) y Mobile
    final isWeb = MediaQuery.of(context).size.width > 800;

    toastification.show(
      context: context,
      title: Text(message, style: TextStyle(color: DsColors.textPrimary, fontSize: 14)),
      type: type,
      style: ToastificationStyle.flat,
      autoCloseDuration: autoCloseDuration,
      alignment: isWeb ? Alignment.topRight : Alignment.bottomCenter,
      direction: isWeb ? TextDirection.ltr : TextDirection.ltr,
      animationDuration: const Duration(milliseconds: 300),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
      margin: isWeb ? const EdgeInsets.only(top: 24, right: 24) : const EdgeInsets.only(bottom: 24, left: 16, right: 16),
      backgroundColor: DsColors.surfaceRaised,
      foregroundColor: DsColors.textPrimary,
      primaryColor: color,
      icon: Icon(icon, color: color),
      borderRadius: BorderRadius.circular(12),
      showProgressBar: false,
      closeButtonShowType: closeButtonShowType,
      // `pauseOnHover` por default del paquete es `true`: si el mouse queda
      // apoyado arriba del toast (lo normal justo después de tocar
      // "Confirmar" en un modal que cierra cerca de esa zona), el cierre
      // automático nunca arranca — bug real reportado: el toast se queda
      // pegado hasta recargar la página. `autoCloseDuration: null` (el caso
      // "crítico") ya requiere cierre manual a propósito, así que esto no le
      // cambia nada a ese caso.
      pauseOnHover: false,
    );
  }
}
