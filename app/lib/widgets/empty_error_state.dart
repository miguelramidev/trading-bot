import 'package:flutter/material.dart';
import '../core/theme/ds_colors.dart';
import '../core/theme/app_text_styles.dart';
import '../core/theme/app_spacing.dart';
import 'app_buttons.dart';

/// Mensaje claro + acción para reintentar o volver — mismo modelo que ya usa
/// `TradeDetailLoader` hoy (`screens/trades/trade_detail_loader.dart`), pero
/// reutilizable en cualquier pantalla.
class ErrorState extends StatelessWidget {
  final String message;
  final String actionLabel;
  final VoidCallback onAction;
  final IconData icon;

  const ErrorState({
    super.key,
    required this.message,
    required this.actionLabel,
    required this.onAction,
    this.icon = Icons.lock_outline,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: DsColors.textSecondary, size: 48),
            const SizedBox(height: AppSpacing.lg),
            Text(message, textAlign: TextAlign.center, style: AppTextStyles.body.copyWith(color: DsColors.textSecondary)),
            const SizedBox(height: AppSpacing.xxl),
            SecondaryButton(label: actionLabel, onPressed: onAction),
          ],
        ),
      ),
    );
  }
}

/// Estado vacío (sin error): mensaje y, opcionalmente, una acción.
class EmptyState extends StatelessWidget {
  final String message;
  final IconData icon;
  final String? actionLabel;
  final VoidCallback? onAction;

  const EmptyState({
    super.key,
    required this.message,
    this.icon = Icons.inbox_outlined,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: DsColors.textTertiary, size: 40),
            const SizedBox(height: AppSpacing.md),
            Text(message, textAlign: TextAlign.center, style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary)),
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: AppSpacing.lg),
              SecondaryButton(label: actionLabel!, onPressed: onAction),
            ],
          ],
        ),
      ),
    );
  }
}
