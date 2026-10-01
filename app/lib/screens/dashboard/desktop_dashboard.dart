import 'package:go_router/go_router.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/ds_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_radius.dart';
import '../../core/utils/result_formatter.dart';
import '../../core/utils/dashboard_mappers.dart';
import '../../core/utils/strategy_name.dart';
import '../../core/utils/symbol_formatter.dart';
import '../../providers/dashboard_provider.dart';
import '../../widgets/widgets.dart';
import 'dashboard_card_builders.dart';

/// Parte una lista en sublistas de a `size` — para agrupar las señales
/// pendientes en filas de a 3 y poder emparejar su altura con
/// `IntrinsicHeight` (ver la sección "Señales pendientes" de `build()`).
List<List<T>> _chunk<T>(List<T> items, int size) {
  final rows = <List<T>>[];
  for (var i = 0; i < items.length; i += size) {
    rows.add(items.sublist(i, i + size > items.length ? items.length : i + size));
  }
  return rows;
}

class DesktopDashboard extends StatelessWidget {
  const DesktopDashboard({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DsColors.background,
      body: Consumer<DashboardProvider>(
        builder: (context, provider, _) {
          if (provider.setupRequired) {
            return _SetupRequiredState(onGoToSettings: () => context.go('/settings'));
          }
          if (provider.isLoading && provider.lastUpdatedAt == null) {
            return const Center(child: CircularProgressIndicator());
          }
          if (provider.errorMessage != null && provider.lastUpdatedAt == null) {
            return ErrorState(
              message: provider.errorMessage!,
              actionLabel: 'Reintentar',
              onAction: () => provider.fetchDashboardData(forceRefresh: true),
            );
          }
          return SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(AppSpacing.huger, AppSpacing.xxl, AppSpacing.huger, AppSpacing.huger),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Inicio', style: AppTextStyles.title.copyWith(color: DsColors.textPrimary)),
                        const SizedBox(height: AppSpacing.xs),
                        Row(
                          children: [
                            DataTimestamp(dataTime: provider.lastUpdatedAt),
                            const Text(' · se actualiza cada 60 s', style: TextStyle(color: DsColors.textSecondary, fontSize: 13)),
                          ],
                        ),
                      ],
                    ),
                    Row(
                      children: [
                        _ConnectionPill(connected: provider.binanceConnected),
                        const SizedBox(width: AppSpacing.md),
                        SecondaryButton(
                          label: provider.isLoading ? 'Actualizando...' : 'Actualizar',
                          onPressed: provider.isLoading ? null : () => provider.fetchDashboardData(forceRefresh: true),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.xxl),
                _BalanceSection(provider: provider),
                const SizedBox(height: AppSpacing.xxxl),
                if (provider.positions.isNotEmpty) ...[
                  SectionHeader(title: 'Posiciones abiertas', count: '${provider.positions.length}'),
                  const SizedBox(height: AppSpacing.md),
                  ...provider.positions.map((p) => Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.md),
                        child: buildPositionCard(context, p),
                      )),
                  const SizedBox(height: AppSpacing.xxxl),
                ],
                SectionHeader(title: 'Señales pendientes', count: '${provider.pendingSignals.length} esperando decisión · vencen a los 60 min'),
                const SizedBox(height: AppSpacing.md),
                if (provider.pendingSignals.isEmpty)
                  const EmptyState(message: 'No hay señales pendientes.')
                else
                  // `IntrinsicHeight` + `CrossAxisAlignment.stretch` por fila
                  // (no un `Wrap`, que no empareja alturas entre hermanos):
                  // todas las tarjetas de una fila quedan con la misma
                  // altura, y cada una empuja sus botones al fondo
                  // (`SignalCard.fillHeight`).
                  Builder(
                    builder: (context) {
                      final rows = _chunk(provider.pendingSignals, 3);
                      return Column(
                        children: [
                          for (var r = 0; r < rows.length; r++) ...[
                            IntrinsicHeight(
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  for (var i = 0; i < rows[r].length; i++) ...[
                                    if (i > 0) const SizedBox(width: AppSpacing.lg),
                                    Expanded(child: buildSignalCard(context, provider, rows[r][i], fillHeight: true)),
                                  ],
                                  // Completa la fila si quedó incompleta, para
                                  // que las tarjetas no se estiren de más.
                                  for (var i = rows[r].length; i < 3; i++) ...[
                                    const SizedBox(width: AppSpacing.lg),
                                    const Expanded(child: SizedBox.shrink()),
                                  ],
                                ],
                              ),
                            ),
                            if (r < rows.length - 1) const SizedBox(height: AppSpacing.lg),
                          ],
                        ],
                      );
                    },
                  ),
                const SizedBox(height: AppSpacing.xxxl),
                SectionHeader(title: 'Actividad reciente'),
                const SizedBox(height: AppSpacing.md),
                if (provider.recentActivity.isEmpty)
                  const EmptyState(message: 'Todavía no hay actividad.')
                else
                  AppCard(
                    padding: EdgeInsets.zero,
                    child: Column(
                      children: [
                        const _ActivityHeaderRow(),
                        for (var i = 0; i < provider.recentActivity.length; i++)
                          _ActivityRow(item: provider.recentActivity[i], showDivider: i < provider.recentActivity.length - 1),
                      ],
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _SetupRequiredState extends StatelessWidget {
  final VoidCallback onGoToSettings;

  const _SetupRequiredState({required this.onGoToSettings});

  @override
  Widget build(BuildContext context) {
    return ErrorState(
      icon: Icons.key_off_outlined,
      message: 'Conectá tu cuenta de Binance para ver tu balance y operar.',
      actionLabel: 'Ir a Configuración',
      onAction: onGoToSettings,
    );
  }
}

class _ConnectionPill extends StatelessWidget {
  final bool? connected;

  const _ConnectionPill({required this.connected});

  @override
  Widget build(BuildContext context) {
    final color = connected == null ? DsColors.textTertiary : (connected! ? DsColors.positive : DsColors.negative);
    final label = connected == null ? 'Verificando conexión' : (connected! ? 'Binance conectado' : 'Sin conexión con Binance');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs + 2),
      decoration: BoxDecoration(color: DsColors.surface, border: Border.all(color: DsColors.border), borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: AppSpacing.sm),
          Text(label, style: AppTextStyles.caption.copyWith(color: DsColors.textPrimary)),
        ],
      ),
    );
  }
}

class _BalanceSection extends StatelessWidget {
  final DashboardProvider provider;

  const _BalanceSection({required this.provider});

  @override
  Widget build(BuildContext context) {
    final insufficient = provider.marginWarning?['insufficient'] == true;
    final requiredUsd = (provider.marginWarning?['requiredUsd'] as num?)?.toDouble();
    final usageFraction = provider.balance > 0 ? (provider.usedBalance / provider.balance).clamp(0.0, 1.0) : 0.0;
    final availablePct = provider.balance > 0 ? (provider.freeBalance / provider.balance) * 100 : 0.0;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(child: MetricBlock(label: 'Balance total', value: fmtUsd(provider.balance, signed: false), valueStyle: AppTextStyles.numDisplay)),
              Expanded(child: MetricBlock(label: 'Disponible', value: fmtUsd(provider.freeBalance, signed: false), secondaryLine: '${availablePct.toStringAsFixed(1)}% del balance')),
              Expanded(child: MetricBlock(label: 'Margen en uso', value: fmtUsd(provider.usedBalance, signed: false), secondaryLine: '${provider.openTradesCount} de ${provider.maxTrades} operaciones')),
              Expanded(
                child: MetricBlock(
                  label: 'PnL no realizado',
                  value: fmtUsd(provider.unrealizedPnl),
                  secondaryLine: fmtPct(provider.pnlPercent),
                  sign: provider.unrealizedPnl > 0 ? MetricSign.positive : (provider.unrealizedPnl < 0 ? MetricSign.negative : MetricSign.neutral),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xl),
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.pill),
            child: LinearProgressIndicator(
              value: usageFraction,
              minHeight: 8,
              backgroundColor: DsColors.border,
              valueColor: AlwaysStoppedAnimation(usageFraction >= 0.8 ? DsColors.warning : DsColors.accent),
            ),
          ),
          if (insufficient) ...[
            const SizedBox(height: AppSpacing.md),
            Callout(
              variant: CalloutVariant.warning,
              icon: Icons.warning_amber_rounded,
              message: 'El disponible no alcanza para una operación nueva de ${fmtUsd(requiredUsd, signed: false)}. Las señales se van a rechazar hasta que se libere margen.',
            ),
          ],
        ],
      ),
    );
  }
}

// Anchos compartidos entre `_ActivityHeaderRow` y `_ActivityRow` — si se
// cambia uno, hay que cambiar el otro para que las columnas sigan alineadas.
const double _kActivityTimeWidth = 110;
const double _kActivitySymbolWidth = 110;
const double _kActivityDirectionWidth = 80;
const double _kActivityStatusWidth = 130;
const double _kActivityPnlWidth = 90;

class _ActivityHeaderRow extends StatelessWidget {
  const _ActivityHeaderRow();

  @override
  Widget build(BuildContext context) {
    final style = AppTextStyles.caption.copyWith(color: DsColors.textTertiary);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl, vertical: AppSpacing.sm),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: DsColors.divider))),
      child: Row(
        children: [
          SizedBox(width: _kActivityTimeWidth, child: Text('Fecha', style: style)),
          SizedBox(width: _kActivitySymbolWidth, child: Text('Activo', style: style)),
          SizedBox(width: _kActivityDirectionWidth, child: Text('Lado', style: style)),
          Expanded(child: Text('Estrategia', style: style)),
          SizedBox(width: _kActivityStatusWidth, child: Text('Resultado', style: style)),
          SizedBox(width: _kActivityPnlWidth, child: Text('PnL', textAlign: TextAlign.right, style: style)),
        ],
      ),
    );
  }
}

class _ActivityRow extends StatelessWidget {
  final dynamic item;
  final bool showDivider;

  const _ActivityRow({required this.item, required this.showDivider});

  @override
  Widget build(BuildContext context) {
    final evaluatedAt = DateTime.tryParse(item['evaluatedAt']?.toString() ?? '');
    final timeLabel = evaluatedAt != null
        ? '${evaluatedAt.day.toString().padLeft(2, '0')}/${evaluatedAt.month.toString().padLeft(2, '0')} ${evaluatedAt.hour.toString().padLeft(2, '0')}:${evaluatedAt.minute.toString().padLeft(2, '0')}'
        : '—';
    final pnl = double.tryParse(item['realizedPnl']?.toString() ?? '');

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl, vertical: AppSpacing.md),
      decoration: BoxDecoration(border: showDivider ? const Border(bottom: BorderSide(color: DsColors.divider)) : null),
      child: Row(
        children: [
          SizedBox(width: _kActivityTimeWidth, child: Text(timeLabel, style: AppTextStyles.numXS.copyWith(color: DsColors.textSecondary))),
          SizedBox(width: _kActivitySymbolWidth, child: Text(fmtSymbol(item['symbol']), style: AppTextStyles.body.copyWith(color: DsColors.textPrimary, fontWeight: FontWeight.w600))),
          SizedBox(width: _kActivityDirectionWidth, child: Align(alignment: Alignment.centerLeft, child: DirectionTag(isLong: isLongDirection(item['direction'])))),
          Expanded(child: Text(strategyName(item['strategy']?.toString()), style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary))),
          SizedBox(width: _kActivityStatusWidth, child: Align(alignment: Alignment.centerLeft, child: StatusPill(statusPillVariantFromKey(item['status']?.toString())))),
          SizedBox(
            width: _kActivityPnlWidth,
            child: Text(
              pnl != null ? fmtUsd(pnl) : fmtMissing(),
              textAlign: TextAlign.right,
              style: AppTextStyles.numS.copyWith(color: pnl == null ? DsColors.textSecondary : (pnl >= 0 ? DsColors.positive : DsColors.negative)),
            ),
          ),
        ],
      ),
    );
  }
}
