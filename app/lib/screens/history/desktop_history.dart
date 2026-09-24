import 'package:flutter/material.dart' hide DataColumn, DataRow, DataCell;
import 'package:material_ui/material_ui.dart' as mui;
import '../../core/theme/app_colors.dart';
import 'package:intl/intl.dart';
import 'package:go_router/go_router.dart';
import 'package:data_table_2/data_table_2.dart';

class DesktopHistory extends StatefulWidget {
  final Map<String, dynamic>? stats;
  final List<dynamic> trades;
  final Map<String, dynamic>? pagination;
  final String currentFilter;

  const DesktopHistory({super.key, required this.stats, required this.trades, this.pagination, this.currentFilter = 'Todos'});

  @override
  State<DesktopHistory> createState() => _DesktopHistoryState();
}

class _DesktopHistoryState extends State<DesktopHistory> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          _buildHeader(),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  _buildStatsRow(),
                  const SizedBox(height: 24),
                  _buildTabs(),
                  const SizedBox(height: 16),
                  Expanded(child: _buildDataTable()),
                  const SizedBox(height: 16),
                  _buildPagination(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      height: 70,
      padding: const EdgeInsets.symmetric(horizontal: 24),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: AppColors.winGreen.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
            child: const Text('MQ', style: TextStyle(color: AppColors.winGreen, fontWeight: FontWeight.bold)),
          ),
          const SizedBox(width: 16),
          const Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('MacroQuant Executive', style: TextStyle(color: AppColors.textPrimary, fontSize: 16, fontWeight: FontWeight.bold)),
              Text('/ Libro Mayor Contable (Ledger)', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
            ],
          ),
          const Spacer(),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.download, size: 16),
            label: const Text('Exportar CSV / FIX Audit'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.transparent,
              foregroundColor: AppColors.textPrimary,
              side: const BorderSide(color: AppColors.border),
              elevation: 0,
            ),
          ),
          const SizedBox(width: 16),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.flash_on, size: 16),
            label: const Text('Ejecutar Orden'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.winGreen,
              foregroundColor: Colors.black,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatsRow() {
    return Row(
      children: [
        Expanded(child: _buildStatCard('TOTAL TRADES', '${widget.stats?['totalTrades'] ?? 0}', 'FIX L2', '• 100% Conciliado')),
        const SizedBox(width: 16),
        Expanded(child: _buildStatCard('WIN RATE', '${widget.stats?['winRate'] ?? '0.0'}%', 'ASIMÉTRICO', '${widget.stats?['winningTrades'] ?? 0} Ganadoras / ${widget.stats?['losingTrades'] ?? 0} Salidas SL')),
        const SizedBox(width: 16),
        Expanded(flex: 2, child: _buildStatCard('BENEFICIO NETO (PNL REALIZADO)', '+\$${widget.stats?['totalPnl'] ?? '0.00'}', 'USDT', '+14.82% BPS Alpha  Base Auditada', isPnl: true)),
        const SizedBox(width: 16),
        Expanded(child: _buildStatCard('PROFIT FACTOR', '${widget.stats?['profitFactor'] ?? '0.0'}', 'ÓPTIMO', 'Gross: \$${widget.stats?['grossProfit'] ?? 0} / Pérdida: \$${widget.stats?['grossLoss'] ?? 0}')),
      ],
    );
  }

  Widget _buildStatCard(String title, String value, String badge1, String badge2, {bool isPnl = false}) {
    final double pnlVal = isPnl ? double.tryParse(value.replaceAll('\$', '').replaceAll('+', '')) ?? 0 : 0;
    final color = isPnl ? (pnlVal >= 0 ? AppColors.winGreen : AppColors.lossRed) : AppColors.textPrimary;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(title, style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.bold)),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(4)),
                child: Text(badge1, style: const TextStyle(color: AppColors.textSecondary, fontSize: 10)),
              )
            ],
          ),
          const SizedBox(height: 16),
          Text(value, style: TextStyle(color: color, fontSize: 28, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(badge2, style: TextStyle(color: isPnl ? AppColors.winGreen : AppColors.textSecondary, fontSize: 11)),
        ],
      ),
    );
  }

  Widget _buildDataTable() {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: DataTable2(
        minWidth: 1000,
        headingTextStyle: const TextStyle(color: AppColors.textSecondary, fontSize: 10, fontWeight: FontWeight.bold),
        dataTextStyle: const TextStyle(color: AppColors.textPrimary, fontSize: 13),
        dividerThickness: 1,
        columnSpacing: 12,
        horizontalMargin: 12,
        columns: const [
          DataColumn2(label: Text('FECHA (UTC)'), size: ColumnSize.L),
          DataColumn2(label: Text('PAR / ACTIVO'), size: ColumnSize.M),
          DataColumn2(label: Text('DIRECCIÓN'), size: ColumnSize.S),
          DataColumn2(label: Text('APALAN.'), size: ColumnSize.S),
          DataColumn2(label: Text('ESTRATEGIA'), size: ColumnSize.L),
          DataColumn2(label: Text('ENTRADA'), size: ColumnSize.M),
          DataColumn2(label: Text('CIERRE'), size: ColumnSize.M),
          DataColumn2(label: Text('ROI %'), size: ColumnSize.S),
          DataColumn2(label: Text('PNL REALIZADO'), size: ColumnSize.M),
          DataColumn2(label: Text('ESTADO'), size: ColumnSize.M),
        ],
        rows: widget.trades.map((trade) {
          final isLong = trade['direction'] == 'LONG';
          final isShadow = trade['status'] == 'DESCARTADO';
          final isTp = trade['status'] == 'TP HIT';
          
          Color statusColor = AppColors.textSecondary;
          if (isTp) statusColor = AppColors.winGreen;
          if (trade['status'] == 'SL HIT') statusColor = AppColors.lossRed;

          final pnlVal = (trade['pnl'] as num?)?.toDouble() ?? 0.0;
          final roiVal = (trade['roi'] as num?)?.toDouble() ?? 0.0;
          final pnlStr = pnlVal > 0 ? '+\$${pnlVal.toStringAsFixed(2)}' : (pnlVal < 0 ? '-\$${pnlVal.abs().toStringAsFixed(2)}' : '\$0.00');
          final pnlColor = isShadow ? AppColors.textSecondary : (pnlVal > 0 ? AppColors.winGreen : AppColors.lossRed);

          String dateStr = '';
          if (trade['date'] != null) {
            final date = DateTime.parse(trade['date']).toLocal();
            dateStr = DateFormat('yyyy-MM-dd\nHH:mm:ss').format(date);
          }

          return mui.DataRow(
            onSelectChanged: (_) => context.go('/history/trade/${trade['id']}', extra: trade),
            cells: [
              mui.DataCell(Text(dateStr, style: const TextStyle(color: AppColors.textSecondary, fontSize: 11))),
              mui.DataCell(Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(width: 8, height: 8, decoration: BoxDecoration(color: statusColor, shape: BoxShape.circle)),
                  const SizedBox(width: 8),
                  Text(trade['symbol'], style: const TextStyle(fontWeight: FontWeight.bold)),
                ],
              )),
              mui.DataCell(Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(color: (isShadow ? AppColors.textSecondary : (isLong ? AppColors.winGreen : AppColors.lossRed)).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(4)),
                child: Text(trade['direction'], style: TextStyle(color: isShadow ? AppColors.textSecondary : (isLong ? AppColors.winGreen : AppColors.lossRed), fontSize: 11, fontWeight: FontWeight.bold)),
              )),
              mui.DataCell(Text('${trade['leverage']}x', style: const TextStyle(fontWeight: FontWeight.bold))),
              mui.DataCell(Text(trade['strategy'], style: const TextStyle(color: AppColors.textSecondary))),
              mui.DataCell(Text('\$${trade['entryPrice']}')),
              mui.DataCell(Text('\$${trade['exitPrice']}')),
              mui.DataCell(Text('${roiVal > 0 ? '+' : ''}${roiVal.toStringAsFixed(1)}%', style: TextStyle(color: pnlColor, fontWeight: FontWeight.bold))),
              mui.DataCell(Text(pnlStr, style: TextStyle(color: pnlColor, fontWeight: FontWeight.bold))),
              mui.DataCell(Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(color: statusColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(4)),
                child: Text(trade['status'], style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.bold)),
              )),
            ]
          );
        }).toList(),
      ),
    );
  }

  Widget _buildPagination() {
    if (widget.pagination == null) return const SizedBox();
    final int currentPage = widget.pagination!['page'] ?? 1;
    final int totalPages = widget.pagination!['totalPages'] ?? 1;
    final int totalItems = widget.pagination!['total'] ?? 0;
    final int limit = widget.pagination!['limit'] ?? 20;
    
    final int start = ((currentPage - 1) * limit) + 1;
    final int end = (currentPage * limit) > totalItems ? totalItems : (currentPage * limit);

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text('Mostrando $start-$end de $totalItems ejecuciones', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
        Row(
          children: [
            IconButton(
              icon: const Icon(Icons.chevron_left, color: AppColors.textSecondary),
              onPressed: currentPage > 1 ? () => context.go('/history?page=${currentPage - 1}&filter=${widget.currentFilter}') : null,
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(color: AppColors.surface, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(4)),
              child: Text('$currentPage / $totalPages', style: const TextStyle(color: AppColors.textPrimary)),
            ),
            IconButton(
              icon: const Icon(Icons.chevron_right, color: AppColors.textSecondary),
              onPressed: currentPage < totalPages ? () => context.go('/history?page=${currentPage + 1}&filter=${widget.currentFilter}') : null,
            ),
          ],
        )
      ],
    );
  }

  Widget _buildTabs() {
    return Row(
      children: [
        _buildTab('Todos'),
        const SizedBox(width: 8),
        _buildTab('Tomadas'),
        const SizedBox(width: 8),
        _buildTab('Descartadas'),
      ],
    );
  }

  Widget _buildTab(String title) {
    final isSelected = widget.currentFilter == title;
    return GestureDetector(
      onTap: () => context.go('/history?page=1&filter=$title'),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.winGreen.withValues(alpha: 0.1) : Colors.transparent,
          border: Border.all(color: isSelected ? AppColors.winGreen : AppColors.border),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          title,
          style: TextStyle(
            color: isSelected ? AppColors.winGreen : AppColors.textSecondary,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
          ),
        ),
      ),
    );
  }

}