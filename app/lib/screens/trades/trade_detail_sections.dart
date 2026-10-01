import 'package:flutter/material.dart';
import '../../core/theme/ds_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/utils/result_formatter.dart';
import '../../core/utils/price_formatter.dart';
import '../../widgets/widgets.dart';
import '../history/history_mappers.dart';
import 'position_detail_controller.dart';

/// Secciones de Detalle de posición, compartidas entre mobile y desktop
/// (sección 5 "Detalle de posición" del documento de diseño).

/// PnL no realizado/realizado + último precio (o precio de salida) + entrada.
Widget buildResultSection(PositionDetailController controller) {
  final pnl = controller.pnlUsd;
  final pnlPct = controller.pnlPct;
  final sign = (pnl ?? 0) >= 0;
  final margin = controller.marginUsd;

  return AppCard(
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(controller.isClosed ? 'PnL realizado' : 'PnL no realizado', style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary)),
            const SizedBox(height: AppSpacing.xs),
            Text(fmtUsd(pnl), style: AppTextStyles.numDisplay.copyWith(color: sign ? DsColors.positive : DsColors.negative)),
            const SizedBox(height: AppSpacing.xs),
            Text(
              pnlPct != null
                  ? (margin != null ? '${fmtPct(pnlPct)} sobre el margen de ${fmtUsd(margin, signed: false)}' : fmtPct(pnlPct))
                  : fmtMissing(),
              style: AppTextStyles.bodySmall.copyWith(color: sign ? DsColors.positive : DsColors.negative),
            ),
          ],
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(controller.isClosed ? 'Precio de salida' : 'Último precio', style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary)),
            const SizedBox(height: AppSpacing.xs),
            Text(fmtPrice(controller.lastPrice), style: AppTextStyles.numL.copyWith(color: DsColors.textPrimary)),
            const SizedBox(height: AppSpacing.xs),
            Text('entrada ${fmtPrice(controller.entry)}', style: AppTextStyles.numXS.copyWith(color: DsColors.textSecondary)),
          ],
        ),
      ],
    ),
  );
}

/// Para una posición abierta: `SlTpRangeBar` + resultado hipotético si se
/// ejecuta cada nivel (todavía no pasó). Para una ya cerrada, esos "si toca"
/// no tienen sentido — se muestra en cambio qué se tocó de verdad y el
/// resultado real (`_buildCloseResultSection`).
Widget buildExitRangeSection(PositionDetailController controller) {
  if (controller.isClosed) return _buildCloseResultSection(controller);

  final projection = controller.projection;
  final lastPrice = controller.lastPrice;
  double? distanceFromLast(double price) => lastPrice == 0 ? null : ((price - lastPrice) / lastPrice) * 100;

  return AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Entre el stop y el objetivo', style: AppTextStyles.cardTitle.copyWith(color: DsColors.textPrimary)),
        const SizedBox(height: AppSpacing.lg),
        SlTpRangeBar(stop: controller.stop, entry: controller.entry, target: controller.target, price: lastPrice, isShort: !controller.isLong, showLevelLabels: false),
        const SizedBox(height: AppSpacing.lg),
        Row(
          children: [
            Expanded(
              child: OutcomeBlock(
                label: 'Stop · ${fmtPrice(controller.stop)}',
                amountUsd: projection?.stopResultUsd,
                price: controller.stop,
                distancePct: distanceFromLast(controller.stop),
                isPositive: false,
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: OutcomeBlock(
                label: 'Objetivo · ${fmtPrice(controller.target)}',
                amountUsd: projection?.targetResultUsd,
                price: controller.target,
                distancePct: distanceFromLast(controller.target),
                isPositive: true,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          'Resultados si se ejecuta cada nivel, desde tu entrada y con comisión estimada.',
          style: AppTextStyles.caption.copyWith(color: DsColors.textTertiary),
        ),
      ],
    ),
  );
}

/// "Cómo se cerró": qué se tocó de verdad (objetivo/stop/descartada — mismo
/// mapeo y mismas etiquetas en español que `StatusPill` usa en todas partes,
/// nunca el "TP HIT"/"SL HIT" crudo del backend) y el precio real de salida,
/// ya marcado en la barra (`SlTpRangeBar` con `price: lastPrice`, que para
/// un trade cerrado es el precio de salida real, ver `lastPrice` getter).
Widget _buildCloseResultSection(PositionDetailController controller) {
  final variant = statusPillVariantForHistory(controller.closeStatus);
  final exitPrice = controller.lastPrice;

  return AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Cómo se cerró', style: AppTextStyles.cardTitle.copyWith(color: DsColors.textPrimary)),
            StatusPill(variant),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        SlTpRangeBar(stop: controller.stop, entry: controller.entry, target: controller.target, price: exitPrice, isShort: !controller.isLong, showLevelLabels: false),
        const SizedBox(height: AppSpacing.sm),
        Text('Precio de salida: ${fmtPrice(exitPrice)}', style: AppTextStyles.caption.copyWith(color: DsColors.textSecondary)),
      ],
    ),
  );
}

/// Órdenes de protección reales en Binance. El caso más importante de la
/// pantalla: si no hay SL, un `Callout` bien visible, no un detalle más.
Widget buildProtectionSection(PositionDetailController controller) {
  final protection = controller.protection;

  if (controller.isLoadingProtection) {
    return const AppCard(child: Center(child: Padding(padding: EdgeInsets.all(AppSpacing.md), child: CircularProgressIndicator())));
  }
  if (controller.protectionError != null) {
    return AppCard(
      child: Callout(icon: Icons.error_outline, message: controller.protectionError!),
    );
  }
  if (protection == null) return const SizedBox.shrink();

  return AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Órdenes de protección en Binance', style: AppTextStyles.cardTitle.copyWith(color: DsColors.textPrimary)),
            if (protection.verifiedAt != null)
              Text('verificadas ${_fmtTime(protection.verifiedAt!)}', style: AppTextStyles.caption.copyWith(color: DsColors.textSecondary)),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        if (!protection.hasStopLoss) ...[
          Callout(
            variant: CalloutVariant.warning,
            icon: Icons.gpp_maybe_outlined,
            message: 'Esta posición no tiene stop loss activo en Binance.${protection.stopLossReason != null ? ' ${protection.stopLossReason}' : ''}',
          ),
          const SizedBox(height: AppSpacing.md),
        ] else ...[
          _protectionRow('Stop loss · stop a mercado', protection.stopLossPrice, true),
          if (controller.stopLossMismatch) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              'El stop real en Binance (${fmtPrice(protection.stopLossPrice)}) no coincide con el de la señal (${fmtPrice(controller.stop)}).',
              style: AppTextStyles.caption.copyWith(color: DsColors.warning),
            ),
          ],
        ],
        _protectionRow('Take profit · objetivo a mercado', protection.takeProfitPrice, protection.takeProfitPrice != null),
      ],
    ),
  );
}

Widget _protectionRow(String label, double? price, bool active) {
  return Container(
    padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
    decoration: const BoxDecoration(border: Border(top: BorderSide(color: DsColors.divider))),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: AppTextStyles.body.copyWith(color: DsColors.textPrimary)),
        Row(
          children: [
            Text(price != null ? fmtPrice(price) : fmtMissing(), style: AppTextStyles.numS.copyWith(color: DsColors.textPrimary)),
            const SizedBox(width: AppSpacing.md),
            StatusPill(active ? StatusPillVariant.activa : StatusPillVariant.desactivada, label: active ? 'Activa' : 'Sin datos'),
          ],
        ),
      ],
    ),
  );
}

String _fmtTime(DateTime t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

/// Tamaño, nocional, margen, apalancamiento, modo, liquidación — solo las
/// filas que de verdad tienen dato (nunca "Funding actual": no tiene sentido
/// para una posición ya cerrada, y para una abierta ya se ve en otro lado).
/// En un trade cerrado, tamaño/margen/apalancamiento no se registran
/// todavía (ver ROADMAP.md, "Guardar el apalancamiento usado") — se explica
/// en vez de mostrar una fila de "—" sin contexto.
Widget buildDetailsSection(PositionDetailController controller) {
  final rows = <(String, String)>[
    if (controller.size != null) ('Tamaño', fmtPrice(controller.size)),
    if (controller.notionalUsd != null) ('Nocional', fmtUsd(controller.notionalUsd, signed: false)),
    if (controller.marginUsd != null) ('Margen', fmtUsd(controller.marginUsd, signed: false)),
    if (controller.leverage != null) ('Apalancamiento', 'x${controller.leverage}'),
    if (controller.marginModeLabel != null) ('Modo de margen', controller.marginModeLabel!),
    if (controller.liquidationPrice != null) ('Liquidación', fmtPrice(controller.liquidationPrice)),
  ];

  return AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Detalles', style: AppTextStyles.cardTitle.copyWith(color: DsColors.textPrimary)),
        if (controller.isClosed) ...[
          const SizedBox(height: AppSpacing.xs),
          Text(
            'Tamaño, margen y apalancamiento todavía no se registran para operaciones cerradas.',
            style: AppTextStyles.caption.copyWith(color: DsColors.textTertiary),
          ),
        ],
        const SizedBox(height: AppSpacing.sm),
        for (final (label, value) in rows)
          Container(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
            decoration: const BoxDecoration(border: Border(top: BorderSide(color: DsColors.divider))),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(label, style: AppTextStyles.body.copyWith(color: DsColors.textSecondary)),
                Text(value, style: AppTextStyles.numS.copyWith(color: DsColors.textPrimary)),
              ],
            ),
          ),
      ],
    ),
  );
}

/// Señal de origen con link a su detalle (si se conoce el id).
Widget buildOriginSignalSection(PositionDetailController controller, VoidCallback? onViewSignal) {
  return AppCard(
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Señal de origen', style: AppTextStyles.caption.copyWith(color: DsColors.textSecondary)),
            const SizedBox(height: AppSpacing.xs),
            Text(controller.strategy, style: AppTextStyles.body.copyWith(color: DsColors.textPrimary)),
          ],
        ),
        if (onViewSignal != null)
          SelectionContainer.disabled(
            child: MouseRegion(
              cursor: SystemMouseCursors.click,
              child: GestureDetector(
                onTap: onViewSignal,
                child: Text('Ver señal', style: AppTextStyles.body.copyWith(color: DsColors.accentText)),
              ),
            ),
          ),
      ],
    ),
  );
}
