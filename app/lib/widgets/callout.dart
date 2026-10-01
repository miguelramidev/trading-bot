import 'package:flutter/material.dart';
import '../core/theme/ds_colors.dart';
import '../core/theme/app_text_styles.dart';
import '../core/theme/app_spacing.dart';
import '../core/theme/app_radius.dart';

/// `high` es más urgente que `warning` (ej. riesgo macro en veto, alerta de
/// caída/rebote brusco) — mismo color que las alertas críticas de ejecución
/// (`DsColors.critical`), para que se distinga de un simple "ojo con esto".
/// `positive` es para una confirmación tranquilizadora (ej. alineación
/// macro a favor), en verde — nunca se usó para "falta de riesgo", solo
/// para "esto juega a favor".
enum CalloutVariant { info, warning, positive, high }

/// Aviso con ícono. `info` para contexto neutral (fondo `surfaceRaised`),
/// `warning` para algo que requiere atención (fondo `warningTint`, texto en
/// `warning`), `positive` en verde, `high` en rojo crítico.
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
    final (color, background) = switch (variant) {
      CalloutVariant.warning => (DsColors.warning, DsColors.warningTint),
      CalloutVariant.positive => (DsColors.positive, DsColors.positiveTint),
      CalloutVariant.high => (DsColors.critical, DsColors.critical.withValues(alpha: 0.12)),
      CalloutVariant.info => (DsColors.textSubtle, DsColors.surfaceRaised),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md + 2, vertical: AppSpacing.md),
      decoration: BoxDecoration(
        color: background,
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
