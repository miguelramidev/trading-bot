import 'package:flutter/material.dart';
import '../core/theme/ds_colors.dart';
import '../core/theme/app_text_styles.dart';
import '../core/theme/app_spacing.dart';
import '../core/theme/app_radius.dart';
import '../core/utils/result_formatter.dart';
import 'direction_tag.dart';
import 'sl_tp_range_bar.dart';

/// Tarjeta de una posición abierta (sección 4, "Inicio"): símbolo,
/// dirección, estrategia, apalancamiento, modo, entrada, último precio,
/// [SlTpRangeBar] y PnL.
class PositionCard extends StatelessWidget {
  final String symbol;
  final bool isLong;
  final String strategy;
  final int? leverage;
  final String? marginMode;
  final double entry;
  final double lastPrice;
  final double stop;
  final double target;
  final double? pnlUsd;
  final double? pnlPct;
  final VoidCallback? onTap;

  const PositionCard({
    super.key,
    required this.symbol,
    required this.isLong,
    required this.strategy,
    this.leverage,
    this.marginMode,
    required this.entry,
    required this.lastPrice,
    required this.stop,
    required this.target,
    this.pnlUsd,
    this.pnlPct,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final pnlColor = (pnlUsd ?? 0) >= 0 ? DsColors.positive : DsColors.negative;
    return SelectionContainer.disabled(
      child: MouseRegion(
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.xl),
        decoration: BoxDecoration(
          color: DsColors.surface,
          border: Border.all(color: DsColors.border),
          borderRadius: BorderRadius.circular(AppRadius.xl),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(symbol, style: AppTextStyles.symbol.copyWith(color: DsColors.textPrimary)),
                        const SizedBox(width: AppSpacing.sm),
                        DirectionTag(isLong: isLong),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.xs + 2),
                    Text(
                      '$strategy${leverage != null ? ' · x$leverage' : ''}${marginMode != null ? ' · $marginMode' : ''}',
                      style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary),
                    ),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(fmtUsd(pnlUsd), style: AppTextStyles.numM.copyWith(color: pnlColor)),
                    const SizedBox(height: AppSpacing.xs),
                    Text(pnlPct != null ? fmtPct(pnlPct) : fmtMissing(), style: AppTextStyles.bodySmall.copyWith(color: pnlColor)),
                  ],
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            SlTpRangeBar(stop: stop, entry: entry, target: target, price: lastPrice, isShort: !isLong),
          ],
        ),
      ),
      ),
      ),
    );
  }
}
