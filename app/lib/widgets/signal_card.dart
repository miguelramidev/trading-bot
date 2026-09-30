import 'package:flutter/material.dart';
import '../core/theme/ds_colors.dart';
import '../core/theme/app_text_styles.dart';
import '../core/theme/app_spacing.dart';
import '../core/theme/app_radius.dart';
import '../core/utils/result_formatter.dart';
import '../core/utils/signal_progress.dart';
import 'direction_tag.dart';
import 'callout.dart';
import 'app_buttons.dart';

/// Umbral de la sección 4.4 del documento de diseño: a partir de este avance
/// hacia el objetivo, la tarjeta avisa que "se llegó tarde".
const double kSignalLateThreshold = 0.30;

/// Tarjeta de señal pendiente (sección 4, "Inicio"): símbolo, dirección,
/// estrategia, tiempo hasta vencer, niveles, riesgo:premio, contexto de BTC
/// y el aviso de desplazamiento si el precio ya recorrió buena parte del
/// camino al objetivo desde que se generó la señal.
class SignalCard extends StatelessWidget {
  final String symbol;
  final bool isLong;
  final String strategy;
  final String expiresLabel;
  final bool expiresSoon;
  final double entry;
  final double stop;
  final double target;
  /// Último precio conocido. `null` si todavía no se pudo consultar — en ese
  /// caso no se muestra ningún aviso de desplazamiento (no hay dato, no se
  /// inventa uno).
  final double? currentPrice;
  final String btcContext;
  final bool canTrade;
  final String? cannotTradeReason;
  final VoidCallback? onDiscard;
  final VoidCallback? onTrade;

  const SignalCard({
    super.key,
    required this.symbol,
    required this.isLong,
    required this.strategy,
    required this.expiresLabel,
    this.expiresSoon = false,
    required this.entry,
    required this.stop,
    required this.target,
    this.currentPrice,
    required this.btcContext,
    this.canTrade = true,
    this.cannotTradeReason,
    this.onDiscard,
    this.onTrade,
  });

  @override
  Widget build(BuildContext context) {
    final slPct = entry == 0 ? null : ((stop - entry) / entry) * 100;
    final tpPct = entry == 0 ? null : ((target - entry) / entry) * 100;
    final designRR = computeEffectiveRiskReward(stop: stop, price: entry, target: target);

    final price = currentPrice;
    final progress = price != null ? computeSignalProgress(entry: entry, target: target, price: price) : null;
    final isLate = progress != null && progress >= kSignalLateThreshold;
    final priceChangePct = price != null && entry != 0 ? ((price - entry) / entry) * 100 : null;
    final effectiveRR = price != null ? computeEffectiveRiskReward(stop: stop, price: price, target: target) : null;

    return Container(
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
            crossAxisAlignment: CrossAxisAlignment.start,
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
                  Text(strategy, style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary)),
                ],
              ),
              Row(
                children: [
                  Icon(Icons.schedule, size: 14, color: expiresSoon ? DsColors.warning : DsColors.textSecondary),
                  const SizedBox(width: AppSpacing.xs + 2),
                  Text(expiresLabel, style: AppTextStyles.bodySmall.copyWith(color: expiresSoon ? DsColors.warning : DsColors.textSecondary)),
                ],
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          Container(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
            decoration: const BoxDecoration(
              border: Border(top: BorderSide(color: DsColors.divider), bottom: BorderSide(color: DsColors.divider)),
            ),
            child: Row(
              children: [
                Expanded(child: _level('Entrada', entry.toString(), DsColors.textPrimary)),
                Expanded(child: _level('Stop', slPct != null ? fmtPct(slPct) : fmtMissing(), DsColors.negative)),
                Expanded(child: _level('Objetivo', tpPct != null ? fmtPct(tpPct) : fmtMissing(), DsColors.positive)),
                Expanded(child: _level('Riesgo : Premio', designRR != null ? '1 : ${designRR.toStringAsFixed(1)}' : fmtMissing(), DsColors.textPrimary)),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          Text(btcContext, style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary)),
          if (price != null) ...[
            const SizedBox(height: AppSpacing.md),
            isLate
                ? Callout(
                    variant: CalloutVariant.warning,
                    icon: Icons.warning_amber_rounded,
                    message: effectiveRR != null
                        ? 'El precio ya recorrió el ${(progress * 100).toStringAsFixed(0)}% hacia el objetivo. Si entrás ahora, la relación queda en 1 : ${effectiveRR.toStringAsFixed(1)}.'
                        : 'El precio ya recorrió el ${(progress * 100).toStringAsFixed(0)}% hacia el objetivo. Entrar ahora ya no tiene margen de riesgo.',
                  )
                : Callout(
                    message: 'Desde la señal: ${priceChangePct != null ? fmtPct(priceChangePct) : fmtMissing()}, un ${(progress! * 100).clamp(0, 100).toStringAsFixed(0)}% del camino al objetivo.',
                  ),
          ],
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              Expanded(child: SecondaryButton(label: 'Descartar', onPressed: onDiscard)),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                flex: 2,
                child: PrimaryButton(
                  label: 'Revisar y operar',
                  onPressed: canTrade ? onTrade : null,
                  disabledReason: cannotTradeReason,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _level(String label, String value, Color color) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: AppTextStyles.caption.copyWith(color: DsColors.textSecondary)),
        const SizedBox(height: AppSpacing.xs),
        Text(value, style: AppTextStyles.numS.copyWith(color: color)),
      ],
    );
  }
}
