import 'package:flutter/material.dart';
import '../../core/theme/ds_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/utils/result_formatter.dart';
import '../../core/utils/price_formatter.dart';
import '../../core/utils/dashboard_mappers.dart';
import '../../core/utils/signal_status.dart';
import '../../widgets/widgets.dart';
import 'signal_detail_controller.dart';

/// Secciones de la pantalla de Detalle de señal, compartidas entre mobile y
/// desktop (sección 5 "Detalle de señal" del documento de diseño).

/// Pastilla de estado del encabezado — un solo lugar que decide la
/// variante/etiqueta para los 5 estados posibles.
Widget buildStatusPill(SignalDetailController controller) {
  // `controller.decision` (resuelto), no `controller.signal['decision']`: el
  // mapa original no siempre trae `decision` — mismo bug ya corregido en el
  // getter `status` del controller (ver caso real WIF, Tanda 3).
  final decision = controller.decision;
  switch (controller.status) {
    case SignalDetailStatus.pendiente:
      final at = controller.evaluatedAt;
      final expiryLabel = at != null ? computeSignalExpiry(at).label : '—';
      return StatusPill(StatusPillVariant.pendiente, label: 'Pendiente · $expiryLabel');
    case SignalDetailStatus.activa:
      return const StatusPill(StatusPillVariant.activa);
    case SignalDetailStatus.descartada:
      return const StatusPill(StatusPillVariant.descartada);
    case SignalDetailStatus.expirada:
      return const StatusPill(StatusPillVariant.expirada);
    case SignalDetailStatus.terminada:
      // La decisión manda: si originalmente se descartó, el resultado que el
      // monitor simuló después (TP/SL) no cambia que nunca se operó — mismo
      // criterio que `mapDecisionToStatus` del backend.
      if (decision != null && decision.startsWith('Descartada')) {
        return const StatusPill(StatusPillVariant.descartada);
      }
      if (decision != null && decision.contains('TP Tocado')) return const StatusPill(StatusPillVariant.objetivo);
      if (decision != null && decision.contains('SL Tocado')) return const StatusPill(StatusPillVariant.stop);
      return const StatusPill(StatusPillVariant.desactivada, label: 'Terminada');
  }
}

/// "Último precio" + desplazamiento desde la señal. Si ya "llegás tarde"
/// (mismo umbral del 30% que usa `SignalCard` en el Inicio, `isLate` del
/// controller), lo avisa acá también — antes este aviso existía en el
/// Inicio pero no en el Detalle de señal: alguien que entraba desde el
/// Inicio ya avisado veía, adentro, el mismo texto neutro de siempre.
Widget buildPriceSection(SignalDetailController controller) {
  final price = controller.currentPrice;
  final progress = controller.progress;
  final priceChangePct = price != null && controller.entry != 0 ? ((price - controller.entry) / controller.entry) * 100 : null;
  final isLate = controller.isLate;
  final effectiveRR = controller.effectiveRR;

  return AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Último precio', style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary)),
        const SizedBox(height: AppSpacing.xs),
        Text(price != null ? fmtPrice(price) : fmtMissing(), style: AppTextStyles.numXL.copyWith(color: DsColors.textPrimary)),
        const SizedBox(height: AppSpacing.xs),
        if (price != null && progress != null) ...[
          if (isLate)
            Callout(
              variant: CalloutVariant.warning,
              icon: Icons.warning_amber_rounded,
              message: effectiveRR != null
                  ? 'El precio ya recorrió el ${(progress * 100).toStringAsFixed(0)}% hacia el objetivo. Si entrás ahora, la relación queda en 1 : ${effectiveRR.toStringAsFixed(1)}.'
                  : 'El precio ya recorrió el ${(progress * 100).toStringAsFixed(0)}% hacia el objetivo. Entrar ahora ya no tiene margen de riesgo.',
            )
          else
            Text(
              '${priceChangePct != null ? fmtPct(priceChangePct) : fmtMissing()} desde la señal (${fmtPrice(controller.entry)}): un ${(progress * 100).clamp(0, 100).toStringAsFixed(0)}% del camino al objetivo.',
              style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary),
            ),
        ],
      ],
    ),
  );
}

/// "Si operás ahora": margen, apalancamiento, nocional y resultado si toca
/// stop/objetivo. Calculado con el apalancamiento mínimo de la config.
Widget buildTradeNowSection(SignalDetailController controller) {
  final projection = controller.projection;
  final designRR = controller.designRR;

  return AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Si operás ahora', style: AppTextStyles.cardTitle.copyWith(color: DsColors.textPrimary)),
        const SizedBox(height: AppSpacing.md),
        Row(
          children: [
            Expanded(child: _field('Margen', fmtUsd(projection.marginUsd, signed: false))),
            Expanded(child: _field('Apalancamiento', 'x${controller.leverageMin}')),
            Expanded(child: _field('Nocional', fmtUsd(projection.notionalUsd, signed: false))),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          'Apalancamiento mínimo x${controller.leverageMin}; puede subir hasta x${controller.leverageMax} si Binance lo exige.',
          style: AppTextStyles.caption.copyWith(color: DsColors.textSecondary),
        ),
        const SizedBox(height: AppSpacing.md),
        Row(
          children: [
            Expanded(
              child: OutcomeBlock(
                label: 'Si toca el stop',
                amountUsd: projection.stopResultUsd,
                price: controller.stop,
                distancePct: controller.entry == 0 ? null : ((controller.stop - controller.entry) / controller.entry) * 100,
                isPositive: false,
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: OutcomeBlock(
                label: 'Si toca el objetivo',
                amountUsd: projection.targetResultUsd,
                price: controller.target,
                distancePct: controller.entry == 0 ? null : ((controller.target - controller.entry) / controller.entry) * 100,
                isPositive: true,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          'Riesgo : premio ${designRR != null ? '1 : ${designRR.toStringAsFixed(1)}' : fmtMissing()} · incluye comisión estimada de 0.10%',
          style: AppTextStyles.caption.copyWith(color: DsColors.textSecondary),
        ),
      ],
    ),
  );
}

Widget _field(String label, String value) {
  return Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: AppTextStyles.caption.copyWith(color: DsColors.textSecondary)),
      const SizedBox(height: AppSpacing.xs),
      Text(value, style: AppTextStyles.numS.copyWith(color: DsColors.textPrimary)),
    ],
  );
}

/// Contexto de la señal: régimen de BTC, tendencia 4h, funding, correlación, RSI, ADX.
Widget buildContextSection(SignalDetailController controller) {
  final bias4h = controller.bias4h;
  final biasLabel = bias4h == 'UP' ? 'Alcista' : (bias4h == 'DOWN' ? 'Bajista' : 'Neutral');
  final biasColor = bias4h == 'UP' ? DsColors.positive : (bias4h == 'DOWN' ? DsColors.negative : DsColors.textPrimary);

  final rows = <(String, String, Color)>[
    ('Régimen de BTC', controller.btcRegime ?? fmtMissing(), DsColors.textPrimary),
    ('Tendencia 4h', biasLabel, biasColor),
    ('Funding', controller.fundingRate ?? fmtMissing(), DsColors.textPrimary),
    ('Correlación BTC', controller.btcCorrelation ?? fmtMissing(), DsColors.textPrimary),
    ('RSI (15m)', controller.triggerRsi ?? fmtMissing(), DsColors.textPrimary),
    ('ADX (15m)', controller.triggerAdx ?? fmtMissing(), DsColors.textPrimary),
  ];

  return AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Contexto de la señal', style: AppTextStyles.cardTitle.copyWith(color: DsColors.textPrimary)),
        const SizedBox(height: AppSpacing.md),
        Wrap(
          runSpacing: AppSpacing.md,
          children: [
            for (final (label, value, color) in rows)
              SizedBox(
                width: 220,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(label, style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary)),
                    Text(value, style: AppTextStyles.numXS.copyWith(color: color)),
                  ],
                ),
              ),
          ],
        ),
      ],
    ),
  );
}

/// Aviso de margen insuficiente: usa el `marginWarning` que ya carga el
/// `DashboardProvider` (ver Inicio) — no pide nada nuevo.
Widget? buildMarginWarningSection(Map<String, dynamic>? marginWarning) {
  if (marginWarning?['insufficient'] != true) return null;
  final requiredUsd = (marginWarning?['requiredUsd'] as num?)?.toDouble();
  final availableUsd = (marginWarning?['availableUsd'] as num?)?.toDouble();
  return Callout(
    variant: CalloutVariant.warning,
    icon: Icons.warning_amber_rounded,
    message:
        'Disponible ${fmtUsd(availableUsd, signed: false)}: no alcanza para el margen de ${fmtUsd(requiredUsd, signed: false)}. Liberá margen o bajá el monto por operación en Ajustes.',
  );
}
