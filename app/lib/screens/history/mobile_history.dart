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

class MobileHistory extends StatelessWidget {
  const MobileHistory({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DsColors.background,
      appBar: AppBar(
        backgroundColor: DsColors.background,
        elevation: 0,
        title: const Text('Historial'),
        actions: [
          Consumer<HistoryController>(
            builder: (context, controller, _) => IconButton(icon: const Icon(Icons.refresh), onPressed: controller.fetch),
          ),
        ],
      ),
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

          return RefreshIndicator(
            onRefresh: controller.fetch,
            child: ListView(
              padding: const EdgeInsets.all(AppSpacing.lg),
              children: [
                buildHistoryMetrics(controller),
                const SizedBox(height: AppSpacing.lg),
                buildPeriodControl(controller),
                const SizedBox(height: AppSpacing.md),
                buildSearchFields(controller),
                const SizedBox(height: AppSpacing.md),
                buildTypeFilterChips(controller),
                const SizedBox(height: AppSpacing.lg),
                if (rows.isEmpty)
                  const EmptyState(message: 'No hay operaciones con estos filtros.')
                else
                  for (var i = 0; i < rows.length; i++)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.md),
                      child: buildHistoryCard(rows[i], () => context.go('/history/trade/${rows[i].id}', extra: rawTrades[i])),
                    ),
                if (controller.pagination != null) _buildPagination(context, controller),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildPagination(BuildContext context, HistoryController controller) {
    final currentPage = controller.pagination!['page'] ?? 1;
    final totalPages = controller.pagination!['totalPages'] ?? 1;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(icon: const Icon(Icons.chevron_left), onPressed: currentPage > 1 ? () => controller.setPage(currentPage - 1) : null),
          Text('Página $currentPage de $totalPages', style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary)),
          IconButton(icon: const Icon(Icons.chevron_right), onPressed: currentPage < totalPages ? () => controller.setPage(currentPage + 1) : null),
        ],
      ),
    );
  }
}
