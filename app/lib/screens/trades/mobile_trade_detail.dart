import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/price_formatter.dart';
import '../../core/utils/symbol_formatter.dart';
import 'package:go_router/go_router.dart';

class MobileTradeDetail extends StatelessWidget {
  final Map<String, dynamic> trade;

  final bool isClosed;
  const MobileTradeDetail({super.key, required this.trade, this.isClosed = false});

  @override
  Widget build(BuildContext context) {
    final isLong = (trade['side'] ?? trade['direction'])?.toString().toUpperCase() == 'LONG';
    final pnl = double.tryParse(trade['unrealizedPnl']?.toString() ?? '') ?? double.tryParse(trade['pnl']?.toString() ?? '') ?? 0.0;
    final roi = double.tryParse(trade['percentage']?.toString() ?? '') ?? double.tryParse(trade['roi']?.toString() ?? '');
    // El apalancamiento puede venir null (trades del historial): en ese caso margen y monto se muestran como "—".
    final leverage = double.tryParse(trade['leverage']?.toString() ?? '');
    final double? margin = double.tryParse(trade['initialMargin']?.toString() ?? '') ??
        (leverage != null ? (double.tryParse(trade['entryPrice']?.toString() ?? '') ?? 1.0) * (double.tryParse(trade['size']?.toString() ?? '') ?? 1.0) / leverage : null);
    final double? notional = (margin != null && leverage != null) ? margin * leverage : null;
    final isPositive = pnl >= 0;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          onPressed: () => context.pop(),
        ),
        title: const Text('Detalle de Posición', style: TextStyle(color: AppColors.textPrimary, fontSize: 16, fontWeight: FontWeight.bold)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(fmtSymbol(trade['symbol']), style: const TextStyle(color: AppColors.textPrimary, fontSize: 24, fontWeight: FontWeight.bold), overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 4),
                    const Text('Perpetuo Cuantitativo', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                  ],
                )),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    color: (isLong ? AppColors.winGreen : AppColors.lossRed).withValues(alpha: 0.1),
                    border: Border.all(color: (isLong ? AppColors.winGreen : AppColors.lossRed).withValues(alpha: 0.3)),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    children: [
                      Container(width: 6, height: 6, decoration: BoxDecoration(color: (isLong ? AppColors.winGreen : AppColors.lossRed), shape: BoxShape.circle)),
                      const SizedBox(width: 6),
                      Text('${isLong ? "LONG" : "SHORT"}\n${trade['leverage'] != null ? "${trade['leverage']}x" : "—"}', textAlign: TextAlign.center, style: TextStyle(color: isLong ? AppColors.winGreen : AppColors.lossRed, fontSize: 10, fontWeight: FontWeight.bold)),
                    ],
                  ),
                )
              ],
            ),
            const SizedBox(height: 24),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                children: [
                  Text('${isClosed ? 'PNL REALIZADO' : 'PNL NO REALIZADO (UPNL)'}', style: TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 1)),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text('${isPositive ? "+" : ""}\$${pnl.toStringAsFixed(2)}', style: TextStyle(color: isPositive ? AppColors.winGreen : AppColors.lossRed, fontSize: 32, fontWeight: FontWeight.bold)),
                      const SizedBox(width: 8),
                      Text('USDT', style: TextStyle(color: isPositive ? AppColors.winGreen : AppColors.lossRed, fontSize: 14, fontWeight: FontWeight.bold)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: (isPositive ? AppColors.winGreen : AppColors.lossRed).withValues(alpha: 0.1),
                      border: Border.all(color: (isPositive ? AppColors.winGreen : AppColors.lossRed).withValues(alpha: 0.3)),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Text(roi != null ? '${roi >= 0 ? "+" : ""}${roi.toStringAsFixed(2)}% ROI • RETORNO S/ MARGEN' : '— ROI • RETORNO S/ MARGEN', style: TextStyle(color: isPositive ? AppColors.winGreen : AppColors.lossRed, fontSize: 10, fontWeight: FontWeight.bold)),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.shield_outlined, color: AppColors.textSecondary, size: 12),
                      const SizedBox(width: 6),
                      const Text('PnL Neto estimado tras comisiones de liquidación y funding', style: TextStyle(color: AppColors.textSecondary, fontSize: 9)),
                    ],
                  )
                ],
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(child: _buildInfoCard('MONTO INVERTIDO', notional != null ? '\$${notional.toStringAsFixed(2)} USDT' : '—', 'Margen: ${margin != null ? '\$${margin.toStringAsFixed(2)}' : '—'}')),
                const SizedBox(width: 16),
                Expanded(child: _buildInfoCard('APALANCAMIENTO', '${trade['leverage'] != null ? "${trade['leverage']}x" : "—"} ${trade['marginMode']?.toString().toUpperCase() ?? '—'}', '')),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(child: _buildInfoCard('PRECIO ENTRADA', '\$${fmtPrice(trade['entryPrice'])}', '')),
                const SizedBox(width: 16),
                Expanded(child: _buildInfoCard('MARK PRICE', '\$${fmtPrice(trade['markPrice'] ?? trade['exitPrice'])}', '', showDot: true)),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(child: _buildInfoCard('STOP LOSS', '\$${fmtPrice(trade['stopLoss'])}', 'Garantía Dinámica', isRed: true)),
                const SizedBox(width: 16),
                Expanded(child: _buildInfoCard('TAKE PROFIT', '\$${fmtPrice(trade['takeProfit'])}', 'Objetivo Algorítmico', isGreenSub: true)),
              ],
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.access_time, color: AppColors.textSecondary, size: 16),
                    const SizedBox(width: 8),
                    const Text('TASA DE FINANCIAMIENTO (8H)', style: TextStyle(color: AppColors.textSecondary, fontSize: 10, fontWeight: FontWeight.bold)),
                  ],
                ),
                Text('+${trade['fundingRate'] ?? '0.0000'}%', style: const TextStyle(color: AppColors.winGreen, fontSize: 12, fontWeight: FontWeight.bold)),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.warning_amber_rounded, color: AppColors.textSecondary, size: 16),
                    const SizedBox(width: 8),
                    const Text('PRECIO LIQUIDACIÓN ESTIMADO', style: TextStyle(color: AppColors.textSecondary, fontSize: 10, fontWeight: FontWeight.bold)),
                  ],
                ),
                Text('\$${trade['liquidationPrice'] ?? '-'} USDT', style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.bold)),
              ],
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoCard(String title, String val, String sub, {bool isGreenSub = false, bool isRed = false, bool showDot = false, String topBadge = ''}) {
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
              Text(title, style: const TextStyle(color: AppColors.textSecondary, fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
              if (showDot) Container(width: 6, height: 6, decoration: const BoxDecoration(color: AppColors.winGreen, shape: BoxShape.circle)),
              if (topBadge.isNotEmpty) 
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                  decoration: BoxDecoration(color: (isRed ? AppColors.lossRed : AppColors.winGreen).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(4)),
                  child: Text(topBadge, style: TextStyle(color: isRed ? AppColors.lossRed : AppColors.winGreen, fontSize: 9, fontWeight: FontWeight.bold)),
                )
            ],
          ),
          const SizedBox(height: 12),
          Text(val, style: TextStyle(color: isRed ? AppColors.lossRed : AppColors.textPrimary, fontSize: 16, fontWeight: FontWeight.bold)),
          if (sub.isNotEmpty) ...[
            const SizedBox(height: 4),
            Row(
              children: [
                if (isGreenSub) Container(width: 4, height: 4, margin: const EdgeInsets.only(right: 4), decoration: const BoxDecoration(color: AppColors.winGreen, shape: BoxShape.circle)),
                Text(sub, style: TextStyle(color: isGreenSub ? AppColors.winGreen : AppColors.textSecondary, fontSize: 10)),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
