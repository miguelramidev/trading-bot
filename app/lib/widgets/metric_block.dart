import 'package:flutter/material.dart';
import '../core/theme/ds_colors.dart';
import '../core/theme/app_text_styles.dart';
import '../core/theme/app_spacing.dart';

/// Signo de un valor, para elegir el color de un [MetricBlock].
enum MetricSign { neutral, positive, negative }

/// Etiqueta, valor numérico grande y una línea secundaria opcional (ej.
/// "Balance total" / "$40.12"). El color del valor y de la línea secundaria
/// cambian según [sign] — nunca se decide "a mano" en cada pantalla.
class MetricBlock extends StatelessWidget {
  final String label;
  final String value;
  final String? secondaryLine;
  final MetricSign sign;
  final TextStyle? valueStyle;
  final CrossAxisAlignment alignment;

  const MetricBlock({
    super.key,
    required this.label,
    required this.value,
    this.secondaryLine,
    this.sign = MetricSign.neutral,
    this.valueStyle,
    this.alignment = CrossAxisAlignment.start,
  });

  Color get _color {
    switch (sign) {
      case MetricSign.positive:
        return DsColors.positive;
      case MetricSign.negative:
        return DsColors.negative;
      case MetricSign.neutral:
        return DsColors.textPrimary;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: alignment,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary)),
        const SizedBox(height: AppSpacing.xs + 2),
        Text(value, style: (valueStyle ?? AppTextStyles.numL).copyWith(color: _color)),
        if (secondaryLine != null) ...[
          const SizedBox(height: AppSpacing.xs + 2),
          Text(secondaryLine!, style: AppTextStyles.bodySmall.copyWith(color: _color)),
        ],
      ],
    );
  }
}
