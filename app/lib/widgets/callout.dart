import 'package:flutter/material.dart';
import '../core/theme/ds_colors.dart';
import '../core/theme/app_text_styles.dart';
import '../core/theme/app_spacing.dart';
import '../core/theme/app_radius.dart';

enum CalloutVariant { info, warning }

/// Aviso con ícono. `info` para contexto neutral (fondo `surfaceRaised`),
/// `warning` para algo que requiere atención (fondo `warningTint`, texto en
/// `warning`).
class Callout extends StatelessWidget {
  final String message;
  final CalloutVariant variant;
  final IconData icon;

  const Callout({
    super.key,
    required this.message,
    this.variant = CalloutVariant.info,
    this.icon = Icons.info_outline,
  });

  @override
  Widget build(BuildContext context) {
    final isWarning = variant == CalloutVariant.warning;
    final color = isWarning ? DsColors.warning : DsColors.textSubtle;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md + 2, vertical: AppSpacing.md),
      decoration: BoxDecoration(
        color: isWarning ? DsColors.warningTint : DsColors.surfaceRaised,
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: AppSpacing.sm + 2),
          Expanded(
            child: Text(message, style: AppTextStyles.bodySmall.copyWith(color: color, height: 1.45)),
          ),
        ],
      ),
    );
  }
}
