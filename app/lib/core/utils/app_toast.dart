import 'package:flutter/material.dart';
import 'package:toastification/toastification.dart';
import '../theme/app_colors.dart';

class AppToast {
  static void showSuccess(BuildContext context, String message) {
    _showToast(
      context: context,
      message: message,
      type: ToastificationType.success,
      color: AppColors.winGreen,
      icon: Icons.check_circle_outline,
    );
  }

  static void showError(BuildContext context, String message) {
    _showToast(
      context: context,
      message: message,
      type: ToastificationType.error,
      color: AppColors.lossRed,
      icon: Icons.error_outline,
    );
  }

  static void showInfo(BuildContext context, String message) {
    _showToast(
      context: context,
      message: message,
      type: ToastificationType.info,
      color: AppColors.accentBlue,
      icon: Icons.info_outline,
    );
  }

  static void _showToast({
    required BuildContext context,
    required String message,
    required ToastificationType type,
    required Color color,
    required IconData icon,
  }) {
    // Distinción entre Web (pantallas grandes) y Mobile
    final isWeb = MediaQuery.of(context).size.width > 800;

    toastification.show(
      context: context,
      title: Text(message, style: TextStyle(color: AppColors.textPrimary, fontSize: 14)),
      type: type,
      style: ToastificationStyle.flat,
      autoCloseDuration: const Duration(seconds: 4),
      alignment: isWeb ? Alignment.topRight : Alignment.bottomCenter,
      direction: isWeb ? TextDirection.ltr : TextDirection.ltr,
      animationDuration: const Duration(milliseconds: 300),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
      margin: isWeb ? const EdgeInsets.only(top: 24, right: 24) : const EdgeInsets.only(bottom: 24, left: 16, right: 16),
      backgroundColor: AppColors.surfaceHighlight,
      foregroundColor: AppColors.textPrimary,
      primaryColor: color,
      icon: Icon(icon, color: color),
      borderRadius: BorderRadius.circular(12),
      showProgressBar: false,
      closeButtonShowType: CloseButtonShowType.none,
    );
  }
}
