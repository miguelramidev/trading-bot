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

/// Aviso con ícono. El color de severidad vive en el ícono y en un borde
/// izquierdo — nunca en el texto: un texto rojo sobre un fondo apenas
/// teñido de rojo (el caso de `high`) no se lee bien. El fondo y el texto
/// son siempre neutros (`surfaceRaised`/`textSecondary`), para cualquier
/// variante.
class Callout extends StatelessWidget {
  final String message;
  /// Título corto opcional, en negrita, arriba del mensaje — para "título
  /// corto + una línea de detalle" (ej. la tarjeta de señal). Sin título,
  /// `message` es el único texto, como antes.
  final String? title;
  final CalloutVariant variant;
  final IconData icon;
  /// Si se pasa, trunca `message` a esa cantidad de líneas (con "…") — para
  /// la vista compacta de la tarjeta. `null` (default): sin límite, como en
  /// el Detalle de señal, que muestra el texto completo.
  final int? maxLines;

  const Callout({
    super.key,
    required this.message,
    this.title,
    this.variant = CalloutVariant.info,
    this.icon = Icons.info_outline,
    this.maxLines,
  });

  @override
  Widget build(BuildContext context) {
    final accentColor = switch (variant) {
      CalloutVariant.warning => DsColors.warning,
      CalloutVariant.positive => DsColors.positive,
      CalloutVariant.high => DsColors.critical,
      CalloutVariant.info => DsColors.textSubtle,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md + 2, vertical: AppSpacing.md),
      decoration: BoxDecoration(
        color: DsColors.surfaceRaised,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border(left: BorderSide(color: accentColor, width: 3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: accentColor),
          const SizedBox(width: AppSpacing.sm + 2),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (title != null) ...[
                  Text(title!, style: AppTextStyles.bodySmall.copyWith(color: DsColors.textPrimary, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                ],
                Text(
                  message,
                  style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary, height: 1.45),
                  maxLines: maxLines,
                  overflow: maxLines != null ? TextOverflow.ellipsis : null,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
