import 'package:go_router/go_router.dart';
import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import 'package:intl/intl.dart';

class MobileHistory extends StatefulWidget {
  final Map<String, dynamic>? stats;
  final List<dynamic> trades;
  final Map<String, dynamic>? pagination;
  final String currentFilter;

  const MobileHistory({super.key, required this.stats, required this.trades, this.pagination, this.currentFilter = 'Todos'});

  @override
  State<MobileHistory> createState() => _MobileHistoryState();
}

class _MobileHistoryState extends State<MobileHistory> {
  

  @override
  Widget build(BuildContext context) {
    final tradesList = widget.trades;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        title: const Text('Historial de Trades', style: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.bold)),
        actions: [
           Container(
             margin: const EdgeInsets.only(right: 16),
             padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
             decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(4)),
             child: const Text('SETTLED', style: TextStyle(color: AppColors.textSecondary, fontSize: 10, fontWeight: FontWeight.bold)),
           )
        ],
        bottom: PreferredSize(
           preferredSize: const Size.fromHeight(20),
           child: Padding(
             padding: const EdgeInsets.only(bottom: 8, left: 16),
             child: Align(
               alignment: Alignment.centerLeft,
               child: Text('• AUDITORÍA ALADDIN / FIX PROTOCOL V4.4', style: TextStyle(color: AppColors.textSecondary, fontSize: 10, letterSpacing: 1)),
             ),
           ),
        ),
      ),
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(child: _buildStatCard('WIN RATE (30D)', '${widget.stats?['winRate'] ?? '0.0'}%', '${widget.stats?['winningTrades'] ?? 0}/${widget.stats?['totalTrades'] ?? 0}', 'R:R ${widget.stats?['profitFactor'] ?? '0.0'}')),
                  const SizedBox(width: 12),
                  Expanded(child: _buildStatCard('PNL NETO TOTAL', '\$${widget.stats?['totalPnl'] ?? '0.00'}', '● REALIZADO', '', isPnl: true)),
                ],
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: SizedBox(
              height: 40,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  _buildFilterChip('Todos'),
                  const SizedBox(width: 8),
                  _buildFilterChip('Tomadas'),
                  const SizedBox(width: 8),
                  _buildFilterChip('Descartadas'),
                ],
              ),
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 16)),
          SliverList(
            delegate: SliverChildBuilderDelegate(
              (context, index) {
                return _buildTradeCard(tradesList[index]);
              },
              childCount: tradesList.length,
            ),
          ),
          SliverToBoxAdapter(child: _buildPagination()),
          const SliverToBoxAdapter(child: SizedBox(height: 32)),
        ],
      ),
    );
  }

  Widget _buildStatCard(String title, String value, String badge1, String badge2, {bool isPnl = false}) {
    final double pnlVal = isPnl ? double.tryParse(value.replaceAll('\$', '')) ?? 0 : 0;
    final color = isPnl ? (pnlVal >= 0 ? AppColors.winGreen : AppColors.lossRed) : AppColors.textPrimary;
    final sign = isPnl && pnlVal > 0 ? '+' : '';

    return Container(
      padding: const EdgeInsets.all(16),
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
              Expanded(child: Text(title, style: const TextStyle(color: AppColors.textSecondary, fontSize: 10, fontWeight: FontWeight.bold))),
              if (badge1.isNotEmpty && isPnl)
                Text(badge1, style: const TextStyle(color: AppColors.winGreen, fontSize: 10, fontWeight: FontWeight.bold))
              else if (badge1.isNotEmpty)
                Text(badge1, style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('$sign$value', style: TextStyle(color: color, fontSize: 24, fontWeight: FontWeight.bold)),
              if (badge2.isNotEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(4)),
                  child: Text(badge2, style: const TextStyle(color: AppColors.textSecondary, fontSize: 10)),
                )
            ],
          )
        ],
      ),
    );
  }

  Widget _buildFilterChip(String label) {
    final isSelected = widget.currentFilter == label;
    return GestureDetector(
      onTap: () => context.go('/history?page=1&filter=$label'),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.winGreen.withValues(alpha: 0.2) : Colors.transparent,
          border: Border.all(color: isSelected ? AppColors.winGreen : AppColors.border),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(label, style: TextStyle(color: isSelected ? AppColors.winGreen : AppColors.textSecondary, fontSize: 13, fontWeight: isSelected ? FontWeight.bold : FontWeight.normal)),
      ),
    );
  }

  Widget _buildTradeCard(dynamic trade) {
    return GestureDetector(
      onTap: () => context.go('/history/trade/${trade['id']}', extra: trade as Map<String, dynamic>),
      child:
    Builder(builder: (context) {
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
      dateStr = DateFormat('dd MMM, HH:mm').format(date);
    }

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Text(trade['symbol'], style: const TextStyle(color: AppColors.textPrimary, fontSize: 16, fontWeight: FontWeight.bold)),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(color: (isShadow ? AppColors.textSecondary : (isLong ? AppColors.winGreen : AppColors.lossRed)).withValues(alpha: 0.2), borderRadius: BorderRadius.circular(4)),
                    child: Text('${trade['direction']} ${trade['leverage']}x', style: TextStyle(color: isShadow ? AppColors.textSecondary : (isLong ? AppColors.winGreen : AppColors.lossRed), fontSize: 10, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
              Row(
                children: [
                  Text(pnlStr, style: TextStyle(color: pnlColor, fontSize: 16, fontWeight: FontWeight.bold)),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(color: statusColor.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(4)),
                    child: Text(trade['status'], style: TextStyle(color: statusColor, fontSize: 10, fontWeight: FontWeight.bold)),
                  ),
                ],
              )
            ],
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(Icons.access_time, size: 14, color: AppColors.textSecondary),
                  const SizedBox(width: 4),
                  Text(dateStr, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                ],
              ),
              if (!isShadow) Text('ROI ${roiVal > 0 ? '+' : ''}${roiVal.toStringAsFixed(2)}%', style: TextStyle(color: pnlColor, fontSize: 12, fontWeight: FontWeight.bold)),
            ],
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Divider(color: AppColors.border, height: 1),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(width: 6, height: 6, decoration: BoxDecoration(color: statusColor, shape: BoxShape.circle)),
                  const SizedBox(width: 8),
                  Text(trade['strategy'], style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                ],
              ),
              Text('ENT: \$${trade['entryPrice']} → SAL: \$${trade['exitPrice']}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
            ],
          ),
        ],
      ),
    );
    }));
  }

  Widget _buildPagination() {
    if (widget.pagination == null) return const SizedBox();
    final int currentPage = widget.pagination!['page'] ?? 1;
    final int totalPages = widget.pagination!['totalPages'] ?? 1;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_left, color: AppColors.textPrimary),
            onPressed: currentPage > 1 ? () => context.go('/history?page=${currentPage - 1}&filter=${widget.currentFilter}') : null,
          ),
          Text('Página $currentPage de $totalPages', style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
          IconButton(
            icon: const Icon(Icons.chevron_right, color: AppColors.textPrimary),
            onPressed: currentPage < totalPages ? () => context.go('/history?page=${currentPage + 1}&filter=${widget.currentFilter}') : null,
          ),
        ],
      ),
    );
  }

}
