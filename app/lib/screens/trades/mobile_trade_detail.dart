import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import 'package:go_router/go_router.dart';

class MobileTradeDetail extends StatelessWidget {
  final Map<String, dynamic> trade;

  final bool isClosed;
  const MobileTradeDetail({super.key, required this.trade, this.isClosed = false});

  @override
  Widget build(BuildContext context) {
    final isLong = (trade['side'] ?? trade['direction'])?.toString().toUpperCase() == 'LONG';
    final pnl = double.tryParse(trade['unrealizedPnl']?.toString() ?? '') ?? double.tryParse(trade['pnl']?.toString() ?? '') ?? 0.0;
    final roi = double.tryParse(trade['percentage']?.toString() ?? '') ?? double.tryParse(trade['roi']?.toString() ?? '') ?? 0.0;
    final margin = double.tryParse(trade['initialMargin']?.toString() ?? '') ?? ((double.tryParse(trade['entryPrice']?.toString() ?? '') ?? 1.0) * (double.tryParse(trade['size']?.toString() ?? '') ?? 1.0) / (double.tryParse(trade['leverage']?.toString() ?? '') ?? 1.0));
    final notional = margin * (double.tryParse(trade['leverage']?.toString() ?? '') ?? 1.0);
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
        title: Column(
          children: [
            const Text('Detalle de Posición', style: TextStyle(color: AppColors.textPrimary, fontSize: 16, fontWeight: FontWeight.bold)),
            Text('MQ-TERMINAL L2', style: TextStyle(color: AppColors.textSecondary, fontSize: 10, letterSpacing: 1)),
          ],
        ),
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 16),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
            child: Row(
              children: [
                Container(width: 6, height: 6, decoration: const BoxDecoration(color: AppColors.winGreen, shape: BoxShape.circle)),
                const SizedBox(width: 4),
                const Text('0.38ms • ZÚRICH', style: TextStyle(color: AppColors.textSecondary, fontSize: 9, fontWeight: FontWeight.bold)),
              ],
            ),
          )
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(trade['symbol'] ?? 'UNK', style: const TextStyle(color: AppColors.textPrimary, fontSize: 24, fontWeight: FontWeight.bold)),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                          decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(4)),
                          child: const Text('L2', style: TextStyle(color: AppColors.textSecondary, fontSize: 10)),
                        )
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text('Perpetuo Cuantitativo • Orden #MQ-8841', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                  ],
                ),
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
                      Text('${isLong ? "LONG" : "SHORT"}\n${trade['leverage']}x', textAlign: TextAlign.center, style: TextStyle(color: isLong ? AppColors.winGreen : AppColors.lossRed, fontSize: 10, fontWeight: FontWeight.bold)),
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
                    child: Text('${isPositive ? "+" : ""}${roi.toStringAsFixed(2)}% ROI • RETORNO S/ MARGEN', style: TextStyle(color: isPositive ? AppColors.winGreen : AppColors.lossRed, fontSize: 10, fontWeight: FontWeight.bold)),
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
                Expanded(child: _buildInfoCard('MONTO INVERTIDO', '\$${notional.toStringAsFixed(2)} USDT', 'Margen: \$${margin.toStringAsFixed(2)}')),
                const SizedBox(width: 16),
                Expanded(child: _buildInfoCard('APALANCAMIENTO', '${trade['leverage']}x ${trade['marginMode']?.toString().toUpperCase() ?? 'CROSS'}', 'Modo Cobertura Activo', isGreenSub: true)),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(child: _buildInfoCard('PRECIO ENTRADA', '\$${trade['entryPrice']}', 'Base Ejecución L2')),
                const SizedBox(width: 16),
                Expanded(child: _buildInfoCard('MARK PRICE', '\$${trade['markPrice'] ?? '-'}', 'Delta: \$0.00', showDot: true)), // Delta calculation omitted for MVP
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(child: _buildInfoCard('STOP LOSS', '\$${trade['stopLoss'] ?? '-'}', 'Garantía Dinámica', topBadge: '-2.9%', isRed: true)),
                const SizedBox(width: 16),
                Expanded(child: _buildInfoCard('TAKE PROFIT', '\$${trade['takeProfit'] ?? '-'}', 'Objetivo Algorítmico', topBadge: '+5.8%', isGreenSub: true)),
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
            if (!isClosed) SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton.icon(
                onPressed: () {},
                icon: const Icon(Icons.block, color: AppColors.lossRed, size: 18),
                label: const Text('Cerrar Posición Manualmente', style: TextStyle(color: AppColors.lossRed, fontSize: 14, fontWeight: FontWeight.bold)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.lossRed.withValues(alpha: 0.1),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                    side: BorderSide(color: AppColors.lossRed.withValues(alpha: 0.3)),
                  )
                ),
              ),
            ),
            if (!isClosed) const SizedBox(height: 12),
            if (!isClosed) Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.lock_outline, color: AppColors.textSecondary, size: 12),
                const SizedBox(width: 6),
                const Text('Ejecución inmediata a precio de mercado L2 con protección slippage', style: TextStyle(color: AppColors.textSecondary, fontSize: 9)),
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
          const SizedBox(height: 4),
          Row(
            children: [
              if (isGreenSub) Container(width: 4, height: 4, margin: const EdgeInsets.only(right: 4), decoration: const BoxDecoration(color: AppColors.winGreen, shape: BoxShape.circle)),
              Text(sub, style: TextStyle(color: isGreenSub ? AppColors.winGreen : AppColors.textSecondary, fontSize: 10)),
            ],
          )
        ],
      ),
    );
  }
}
