import 'package:go_router/go_router.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/ds_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_radius.dart';
import '../../core/utils/result_formatter.dart';
import '../../core/utils/dashboard_mappers.dart';
import '../../core/utils/symbol_formatter.dart';
import '../../providers/dashboard_provider.dart';
import '../../widgets/widgets.dart';
import 'dashboard_card_builders.dart';

class MobileDashboard extends StatelessWidget {
  const MobileDashboard({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DsColors.background,
      appBar: AppBar(
        backgroundColor: DsColors.background,
        elevation: 0,
        title: const Text('Inicio'),
        actions: [
          Consumer<DashboardProvider>(
            builder: (context, provider, _) => IconButton(
              tooltip: 'Actualizar',
              icon: const Icon(Icons.refresh),
              onPressed: () => provider.fetchDashboardData(forceRefresh: true),
            ),
          ),
        ],
      ),
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
          return RefreshIndicator(
            onRefresh: () => provider.fetchDashboardData(forceRefresh: true),
            child: ListView(
              padding: const EdgeInsets.all(AppSpacing.lg),
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    DataTimestamp(dataTime: provider.lastUpdatedAt),
                    _ConnectionPill(connected: provider.binanceConnected),
                  ],
                ),
                const SizedBox(height: AppSpacing.lg),
                _BalanceSection(provider: provider),
                const SizedBox(height: AppSpacing.xxxl),
                if (provider.positions.isNotEmpty) ...[
                  SectionHeader(title: 'Posiciones abiertas', count: '${provider.positions.length} de ${provider.maxTrades}', mobile: true),
                  const SizedBox(height: AppSpacing.md),
                  ...provider.positions.map((p) => Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.md),
                        child: buildPositionCard(context, p),
                      )),
                  const SizedBox(height: AppSpacing.xxxl),
                ],
                SectionHeader(title: 'Señales pendientes', count: '${provider.pendingSignals.length}', mobile: true),
                const SizedBox(height: AppSpacing.md),
                if (provider.pendingSignals.isEmpty)
                  const EmptyState(message: 'No hay señales pendientes.')
                else
                  ...provider.pendingSignals.map((s) => Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.md),
                        child: buildSignalCard(context, provider, s),
                      )),
                const SizedBox(height: AppSpacing.xxxl),
                SectionHeader(title: 'Actividad reciente', mobile: true),
                const SizedBox(height: AppSpacing.md),
                if (provider.recentActivity.isEmpty)
                  const EmptyState(message: 'Todavía no hay actividad.')
                else
                  AppCard(
                    padding: EdgeInsets.zero,
                    child: Column(
                      children: [
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
  final bool connected;

  const _ConnectionPill({required this.connected});

  @override
  Widget build(BuildContext context) {
    final color = connected ? DsColors.positive : DsColors.negative;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs + 2),
      decoration: BoxDecoration(color: DsColors.surface, border: Border.all(color: DsColors.border), borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: AppSpacing.sm),
          Text(connected ? 'Binance conectado' : 'Sin conexión con Binance', style: AppTextStyles.caption.copyWith(color: DsColors.textPrimary)),
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
          MetricBlock(label: 'Balance total', value: fmtUsd(provider.balance, signed: false), valueStyle: AppTextStyles.numDisplay),
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              Expanded(child: MetricBlock(label: 'Disponible', value: fmtUsd(provider.freeBalance, signed: false), secondaryLine: '${availablePct.toStringAsFixed(1)}% del balance')),
              Expanded(child: MetricBlock(label: 'Margen en uso', value: fmtUsd(provider.usedBalance, signed: false), secondaryLine: '${provider.openTradesCount} de ${provider.maxTrades} operaciones')),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          MetricBlock(
            label: 'PnL no realizado',
            value: fmtUsd(provider.unrealizedPnl),
            secondaryLine: fmtPct(provider.pnlPercent),
            sign: provider.unrealizedPnl > 0 ? MetricSign.positive : (provider.unrealizedPnl < 0 ? MetricSign.negative : MetricSign.neutral),
          ),
          const SizedBox(height: AppSpacing.lg),
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
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(border: showDivider ? const Border(bottom: BorderSide(color: DsColors.divider)) : null),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(fmtSymbol(item['symbol']), style: AppTextStyles.body.copyWith(color: DsColors.textPrimary, fontWeight: FontWeight.w600)),
                    const SizedBox(width: AppSpacing.sm),
                    DirectionTag(isLong: isLongDirection(item['direction'])),
                  ],
                ),
                const SizedBox(height: AppSpacing.xs),
                Text('$timeLabel · ${item['strategy']?.toString() ?? '—'}', style: AppTextStyles.caption.copyWith(color: DsColors.textSecondary)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              StatusPill(statusPillVariantFromKey(item['status']?.toString())),
              const SizedBox(height: AppSpacing.xs),
              Text(pnl != null ? fmtUsd(pnl) : fmtMissing(), style: AppTextStyles.numXS.copyWith(color: pnl == null ? DsColors.textSecondary : (pnl >= 0 ? DsColors.positive : DsColors.negative))),
            ],
          ),
        ],
      ),
    );
  }
}
