import 'package:flutter/material.dart';
import '../core/theme/ds_colors.dart';
import '../core/theme/app_text_styles.dart';
import '../core/theme/app_spacing.dart';
import '../core/theme/app_radius.dart';
import '../core/utils/result_formatter.dart';

/// Bloque "Si toca el stop" / "Si toca el objetivo": monto en USDT, precio y
/// distancia — el riesgo hecho plata (principio 3 del documento de diseño).
class OutcomeBlock extends StatelessWidget {
  final String label;
  final double? amountUsd;
  final double? price;
  final double? distancePct;
  final bool isPositive;

  const OutcomeBlock({
    super.key,
    required this.label,
    required this.amountUsd,
    required this.price,
    required this.distancePct,
    required this.isPositive,
  });

  @override
  Widget build(BuildContext context) {
    final color = isPositive ? DsColors.positive : DsColors.negative;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: isPositive ? DsColors.positiveTintSoft : DsColors.negativeTintBlock,
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: AppTextStyles.caption.copyWith(color: color)),
          const SizedBox(height: AppSpacing.xs),
          Text(fmtUsd(amountUsd), style: AppTextStyles.numM.copyWith(color: color)),
          const SizedBox(height: AppSpacing.xs),
          Text(
            '${price != null ? price!.toString() : fmtMissing()} · ${distancePct != null ? fmtPct(distancePct) : fmtMissing()}',
            style: AppTextStyles.numXS.copyWith(color: DsColors.textSecondary),
          ),
        ],
      ),
    );
  }
}
