import 'package:flutter/material.dart';
import '../../core/theme/ds_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/utils/result_formatter.dart';
import '../../core/utils/price_formatter.dart';
import '../../widgets/widgets.dart';
import 'history_controller.dart';
import 'history_mappers.dart';
import 'history_row_data.dart';

/// Métricas del Historial: operaciones cerradas (de N señales en el
/// período), aciertos, PnL neto, profit factor (en `warning` si es menor a 1).
Widget buildHistoryMetrics(HistoryController controller) {
  final stats = controller.stats;
  if (stats == null) return const SizedBox.shrink();

  final totalTrades = stats['totalTrades'] ?? 0;
  final winningTrades = stats['winningTrades'] ?? 0;
  final losingTrades = stats['losingTrades'] ?? 0;
  final winRate = double.tryParse(stats['winRate']?.toString() ?? '');
  final totalPnl = double.tryParse(stats['totalPnl']?.toString() ?? '');
  final profitFactor = double.tryParse(stats['profitFactor']?.toString() ?? '');
  final periodSignalsCount = stats['periodSignalsCount'] ?? 0;
  final lowProfitFactor = profitFactor != null && profitFactor < 1;

  return Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Wrap(
        spacing: AppSpacing.md,
        runSpacing: AppSpacing.md,
        children: [
          SizedBox(
            width: 220,
            child: AppCard(
              child: MetricBlock(
                label: 'Operaciones cerradas',
                value: '$totalTrades',
                secondaryLine: 'de $periodSignalsCount señales en el período',
              ),
            ),
          ),
          SizedBox(
            width: 220,
            child: AppCard(
              child: MetricBlock(
                label: 'Aciertos',
                value: winRate != null ? '${winRate.toStringAsFixed(1)}%' : fmtMissing(),
                secondaryLine: '$winningTrades objetivos · $losingTrades stops',
              ),
            ),
          ),
          SizedBox(
            width: 220,
            child: AppCard(
              child: MetricBlock(
                label: 'PnL neto',
                value: fmtUsd(totalPnl),
                secondaryLine: 'con comisiones · sin funding',
                sign: (totalPnl ?? 0) > 0 ? MetricSign.positive : ((totalPnl ?? 0) < 0 ? MetricSign.negative : MetricSign.neutral),
              ),
            ),
          ),
          SizedBox(
            width: 220,
            child: AppCard(
              child: MetricBlock(
                label: 'Profit factor',
                value: profitFactor != null ? profitFactor.toStringAsFixed(2) : fmtMissing(),
                secondaryLine: lowProfitFactor ? 'menor a 1: las pérdidas superan las ganancias' : null,
                sign: lowProfitFactor ? MetricSign.negative : MetricSign.neutral,
              ),
            ),
          ),
        ],
      ),
    ],
  );
}

/// Pestañas de período (7 días / 30 días / Todo).
Widget buildPeriodControl(HistoryController controller) {
  const periods = ['7d', '30d', 'all'];
  const labels = ['7 días', '30 días', 'Todo'];
  return SegmentedControl(
    options: labels,
    selectedIndex: periods.indexOf(controller.period),
    onChanged: (i) => controller.setPeriod(periods[i]),
  );
}

/// Chips Todas / Ejecutadas / Descartadas.
Widget buildTypeFilterChips(HistoryController controller) {
  const types = ['Todos', 'Tomadas', 'Descartadas'];
  const labels = ['Todas', 'Ejecutadas', 'Descartadas'];
  return Wrap(
    spacing: AppSpacing.sm,
    children: [
      for (var i = 0; i < types.length; i++)
        AppFilterChip(label: labels[i], selected: controller.typeFilter == types[i], onTap: () => controller.setTypeFilter(types[i])),
    ],
  );
}

/// Búsqueda por activo y estrategia.
Widget buildSearchFields(HistoryController controller) {
  return Row(
    children: [
      Expanded(child: _SearchField(label: 'Buscar activo', onChanged: controller.setSymbolQuery)),
      const SizedBox(width: AppSpacing.md),
      Expanded(child: _SearchField(label: 'Estrategia', onChanged: controller.setStrategyQuery)),
    ],
  );
}

class _SearchField extends StatelessWidget {
  final String label;
  final ValueChanged<String> onChanged;

  const _SearchField({required this.label, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return TextField(
      onChanged: onChanged,
      style: AppTextStyles.body.copyWith(color: DsColors.textPrimary),
      decoration: InputDecoration(
        hintText: label,
        hintStyle: AppTextStyles.body.copyWith(color: DsColors.textTertiary),
        prefixIcon: const Icon(Icons.search, size: 18, color: DsColors.textSecondary),
        filled: true,
        fillColor: DsColors.surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: DsColors.border)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: DsColors.border)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: DsColors.accent)),
      ),
    );
  }
}

/// Fila de la tabla de escritorio.
Widget buildHistoryTableRow(HistoryRowData row, VoidCallback onTap) {
  final dateLabel = row.date != null
      ? '${row.date!.day.toString().padLeft(2, '0')}/${row.date!.month.toString().padLeft(2, '0')} ${row.date!.hour.toString().padLeft(2, '0')}:${row.date!.minute.toString().padLeft(2, '0')}'
      : '—';
  final pnlColor = row.isDiscarded ? DsColors.textSecondary : ((row.pnl ?? 0) >= 0 ? DsColors.positive : DsColors.negative);

  return InkWell(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl, vertical: AppSpacing.md),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: DsColors.divider))),
      child: Row(
        children: [
          SizedBox(width: 100, child: Text(dateLabel, style: AppTextStyles.numXS.copyWith(color: DsColors.textSecondary))),
          SizedBox(width: 90, child: Text(row.symbol.split('/').first, style: AppTextStyles.body.copyWith(color: DsColors.textPrimary, fontWeight: FontWeight.w600))),
          SizedBox(width: 70, child: DirectionTag(isLong: row.isLong)),
          Expanded(flex: 2, child: Text(row.strategy, style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary))),
          Expanded(flex: 2, child: Text('${fmtPrice(row.entryPrice)} → ${row.isDiscarded ? '—' : fmtPrice(row.exitPrice)}', style: AppTextStyles.numXS.copyWith(color: DsColors.textSecondary))),
          SizedBox(width: 120, child: StatusPill(statusPillVariantForHistory(row.status))),
          SizedBox(
            width: 90,
            child: Text(row.isDiscarded ? fmtMissing() : fmtUsd(row.pnl), textAlign: TextAlign.right, style: AppTextStyles.numS.copyWith(color: pnlColor)),
          ),
          SizedBox(
            width: 90,
            child: Text(row.isDiscarded ? fmtMissing() : fmtPct(row.roi), textAlign: TextAlign.right, style: AppTextStyles.numXS.copyWith(color: pnlColor)),
          ),
        ],
      ),
    ),
  );
}

/// Tarjeta de la lista de celular.
Widget buildHistoryCard(HistoryRowData row, VoidCallback onTap) {
  final dateLabel = row.date != null
      ? '${row.date!.day.toString().padLeft(2, '0')}/${row.date!.month.toString().padLeft(2, '0')} ${row.date!.hour.toString().padLeft(2, '0')}:${row.date!.minute.toString().padLeft(2, '0')}'
      : '—';
  final pnlColor = row.isDiscarded ? DsColors.textSecondary : ((row.pnl ?? 0) >= 0 ? DsColors.positive : DsColors.negative);

  return GestureDetector(
    onTap: onTap,
    child: AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Text(row.symbol.split('/').first, style: AppTextStyles.body.copyWith(color: DsColors.textPrimary, fontWeight: FontWeight.w700)),
                  const SizedBox(width: AppSpacing.sm),
                  DirectionTag(isLong: row.isLong),
                ],
              ),
              StatusPill(statusPillVariantForHistory(row.status)),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Text('$dateLabel · ${row.strategy}', style: AppTextStyles.caption.copyWith(color: DsColors.textSecondary)),
          const SizedBox(height: AppSpacing.sm),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('${fmtPrice(row.entryPrice)} → ${row.isDiscarded ? '—' : fmtPrice(row.exitPrice)}', style: AppTextStyles.numXS.copyWith(color: DsColors.textSecondary)),
              Text(row.isDiscarded ? fmtMissing() : '${fmtUsd(row.pnl)} · ${fmtPct(row.roi)}', style: AppTextStyles.numS.copyWith(color: pnlColor)),
            ],
          ),
        ],
      ),
    ),
  );
}
