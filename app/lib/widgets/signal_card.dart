import 'package:flutter/material.dart';
import '../core/theme/ds_colors.dart';
import '../core/theme/app_text_styles.dart';
import '../core/theme/app_spacing.dart';
import '../core/theme/app_radius.dart';
import '../core/utils/result_formatter.dart';
import '../core/utils/signal_progress.dart';
import '../core/utils/signal_warnings.dart';
import 'direction_tag.dart';
import 'callout.dart';
import 'app_buttons.dart';

/// Umbral de la sección 4.4 del documento de diseño: a partir de este avance
/// hacia el objetivo, la tarjeta avisa que "se llegó tarde".
const double kSignalLateThreshold = 0.30;

/// Tarjeta de señal pendiente (sección 4, "Inicio"). Orden fijo (de arriba
/// a abajo): símbolo y dirección; estrategia con el motivo en texto simple;
/// los números (entrada, stop, objetivo, riesgo:premio); advertencias (en
/// recuadro); contexto de BTC y desplazamiento (texto simple, salvo
/// "llegás tarde"); botones, siempre al fondo.
class SignalCard extends StatelessWidget {
  final String symbol;
  final bool isLong;
  final String strategy;
  /// Motivo corto de la estrategia (ej. "MACD Zero-Cross a favor de EMA
  /// 200") — texto simple junto a la estrategia, no es una advertencia.
  final String? motivo;
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
  /// Riesgo macro, reversa de estrategia, alertas de caída/rebote — bien
  /// visibles, antes del contexto. Se les suma automáticamente la de
  /// "Stop demasiado ajustado" (Regla 5) si corresponde.
  final List<SignalWarning> warnings;
  final bool canTrade;
  final String? cannotTradeReason;
  final VoidCallback? onDiscard;
  final VoidCallback? onTrade;
  /// `true` en una grilla de escritorio donde varias tarjetas comparten fila
  /// con la misma altura (ver `desktop_dashboard.dart`, `IntrinsicHeight` +
  /// `CrossAxisAlignment.stretch`): empuja los botones al fondo con un
  /// `Spacer`. `false` (default) para una lista vertical de alto natural
  /// (Inicio en celular) — un `Spacer` ahí rompe el layout (alto no acotado).
  final bool fillHeight;

  const SignalCard({
    super.key,
    required this.symbol,
    required this.isLong,
    required this.strategy,
    this.motivo,
    required this.expiresLabel,
    this.expiresSoon = false,
    required this.entry,
    required this.stop,
    required this.target,
    this.currentPrice,
    required this.btcContext,
    this.warnings = const [],
    this.canTrade = true,
    this.cannotTradeReason,
    this.onDiscard,
    this.onTrade,
    this.fillHeight = false,
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

    // Regla 5: mismo umbral que `Trader.executeTrade` — si el stop queda
    // demasiado cerca de la entrada, Binance va a rechazar la orden. Se
    // avisa y se deshabilita el botón ANTES de que el usuario lo intente,
    // igual que con el margen insuficiente.
    final stopTooTight = isStopTooTight(entry: entry, stop: stop);
    final effectiveCanTrade = canTrade && !stopTooTight;
    final effectiveCannotTradeReason = stopTooTight ? 'Stop demasiado ajustado' : cannotTradeReason;
    final displayWarnings = sortSignalWarnings(stopTooTight ? [...warnings, buildStopTooTightWarning()] : warnings);

    return Container(
      padding: const EdgeInsets.all(AppSpacing.xl),
      decoration: BoxDecoration(
        color: DsColors.surface,
        border: Border.all(color: DsColors.border),
        borderRadius: BorderRadius.circular(AppRadius.xl),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: fillHeight ? MainAxisSize.max : MainAxisSize.min,
        children: [
          // 1. Símbolo y dirección (+ vencimiento a la derecha).
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Text(symbol, style: AppTextStyles.symbol.copyWith(color: DsColors.textPrimary)),
                  const SizedBox(width: AppSpacing.sm),
                  DirectionTag(isLong: isLong),
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
          const SizedBox(height: AppSpacing.xs + 2),
          // 2. Estrategia + motivo, texto simple.
          Text(
            motivo != null && motivo!.isNotEmpty ? '$strategy · $motivo' : strategy,
            style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.lg),
          // 3. Números.
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
          // 4. Advertencias.
          if (displayWarnings.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.lg),
            for (final w in displayWarnings) ...[
              // Título corto + una sola línea de detalle (el texto completo
              // va en el Detalle de señal, no acá).
              Callout(variant: calloutVariantFor(w.severity), icon: calloutIconFor(w.severity), title: w.title, message: w.detail, maxLines: 1),
              const SizedBox(height: AppSpacing.sm),
            ],
          ],
          const SizedBox(height: AppSpacing.lg),
          // 5. Contexto: texto simple, salvo "llegás tarde" (sigue en recuadro).
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
                : Text(
                    'Desde la señal: ${priceChangePct != null ? fmtPct(priceChangePct) : fmtMissing()}, un ${(progress! * 100).clamp(0, 100).toStringAsFixed(0)}% del camino al objetivo.',
                    style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary),
                  ),
          ],
          const SizedBox(height: AppSpacing.lg),
          if (fillHeight) const Spacer(),
          // 6. Botones, siempre al fondo.
          Row(
            children: [
              Expanded(child: SecondaryButton(label: 'Descartar', onPressed: onDiscard)),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                flex: 2,
                child: PrimaryButton(
                  label: 'Revisar y operar',
                  onPressed: effectiveCanTrade ? onTrade : null,
                  disabledReason: effectiveCannotTradeReason,
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
