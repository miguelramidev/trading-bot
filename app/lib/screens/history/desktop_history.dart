import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../core/theme/ds_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/theme/app_spacing.dart';
import '../../widgets/widgets.dart';
import 'history_controller.dart';
import 'history_row_data.dart';
import 'history_sections.dart';

class DesktopHistory extends StatelessWidget {
  const DesktopHistory({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DsColors.background,
      body: Consumer<HistoryController>(
        builder: (context, controller, _) {
          if (controller.isLoading && controller.stats == null) {
            return const Center(child: CircularProgressIndicator());
          }
          if (controller.errorMessage != null && controller.stats == null) {
            return ErrorState(message: controller.errorMessage!, actionLabel: 'Reintentar', onAction: controller.fetch);
          }

          final rawTrades = controller.trades.cast<Map<String, dynamic>>();
          final rows = rawTrades.map(HistoryRowData.fromTrade).toList();

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
                        Text('Historial', style: AppTextStyles.title.copyWith(color: DsColors.textPrimary)),
                        const SizedBox(height: AppSpacing.xs),
                        Text('Operaciones ejecutadas y señales descartadas', style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary)),
                      ],
                    ),
                    buildPeriodControl(controller),
                  ],
                ),
                const SizedBox(height: AppSpacing.xl),
                buildHistoryMetrics(controller),
                const SizedBox(height: AppSpacing.xl),
                Row(
                  children: [
                    buildTypeFilterChips(controller),
                    const Spacer(),
                    SizedBox(width: 460, child: buildSearchFields(controller)),
                  ],
                ),
                const SizedBox(height: AppSpacing.lg),
                if (rows.isEmpty)
                  const EmptyState(message: 'No hay operaciones con estos filtros.')
                else
                  AppCard(
                    padding: EdgeInsets.zero,
                    child: Column(
                      children: [
                        buildHistoryTableHeader(),
                        for (var i = 0; i < rows.length; i++) buildHistoryTableRow(rows[i], () => context.go('/history/trade/${rows[i].id}', extra: rawTrades[i])),
                      ],
                    ),
                  ),
                if (controller.pagination != null) ...[
                  const SizedBox(height: AppSpacing.md),
                  _buildPagination(controller),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildPagination(HistoryController controller) {
    final currentPage = controller.pagination!['page'] ?? 1;
    final totalPages = controller.pagination!['totalPages'] ?? 1;
    final total = controller.pagination!['total'] ?? 0;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text('$total operaciones en total', style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary)),
        Row(
          children: [
            IconButton(icon: const Icon(Icons.chevron_left), onPressed: currentPage > 1 ? () => controller.setPage(currentPage - 1) : null),
            Text('$currentPage / $totalPages', style: AppTextStyles.numS.copyWith(color: DsColors.textPrimary)),
            IconButton(icon: const Icon(Icons.chevron_right), onPressed: currentPage < totalPages ? () => controller.setPage(currentPage + 1) : null),
          ],
        ),
      ],
    );
  }
}
