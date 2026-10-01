import 'package:flutter/material.dart';
import '../core/theme/ds_colors.dart';
import '../core/theme/app_text_styles.dart';
import '../core/theme/app_radius.dart';

/// Botón principal: acento sólido. Deshabilitado con [disabledReason] visible
/// como texto (nunca solo opacidad) — el usuario tiene que entender por qué
/// no puede tocarlo.
class PrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final String? disabledReason;

  const PrimaryButton({super.key, required this.label, required this.onPressed, this.disabledReason});

  @override
  Widget build(BuildContext context) {
    final isDisabled = onPressed == null;
    return SelectionContainer.disabled(
      child: SizedBox(
        height: 48,
        child: ElevatedButton(
          onPressed: onPressed,
          style: ElevatedButton.styleFrom(
            backgroundColor: isDisabled ? DsColors.surfaceRaised : DsColors.accent,
            foregroundColor: isDisabled ? DsColors.textTertiary : DsColors.textOnAccent,
            disabledBackgroundColor: DsColors.surfaceRaised,
            disabledForegroundColor: DsColors.textTertiary,
            elevation: 0,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.lg)),
          ),
          child: Text(isDisabled && disabledReason != null ? disabledReason! : label, style: AppTextStyles.body.copyWith(fontWeight: FontWeight.w700)),
        ),
      ),
    );
  }
}

/// Botón secundario: contorno, sin relleno.
class SecondaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;

  const SecondaryButton({super.key, required this.label, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return SelectionContainer.disabled(
      child: SizedBox(
        height: 48,
        child: OutlinedButton(
          onPressed: onPressed,
          style: OutlinedButton.styleFrom(
            foregroundColor: DsColors.textPrimary,
            side: const BorderSide(color: DsColors.border),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.lg)),
          ),
          child: Text(label, style: AppTextStyles.body.copyWith(fontWeight: FontWeight.w600)),
        ),
      ),
    );
  }
}

/// Botón de peligro: contorno rojo (ej. "Cerrar posición a mercado").
class DangerButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;

  const DangerButton({super.key, required this.label, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return SelectionContainer.disabled(
      child: SizedBox(
        height: 48,
        child: OutlinedButton(
          onPressed: onPressed,
          style: OutlinedButton.styleFrom(
            foregroundColor: DsColors.negative,
            side: BorderSide(color: DsColors.negative.withValues(alpha: 0.5)),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.lg)),
          ),
          child: Text(label, style: AppTextStyles.body.copyWith(fontWeight: FontWeight.w600)),
        ),
      ),
    );
  }
}
