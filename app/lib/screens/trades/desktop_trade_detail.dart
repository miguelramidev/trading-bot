import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import 'package:go_router/go_router.dart';

class DesktopTradeDetail extends StatelessWidget {
  final Map<String, dynamic> trade;

  final bool isClosed;
  const DesktopTradeDetail({super.key, required this.trade, this.isClosed = false});

  @override
  Widget build(BuildContext context) {
    final isLong = (trade['side'] ?? trade['direction'])?.toString().toUpperCase() == 'LONG';
    final pnl = double.tryParse(trade['unrealizedPnl']?.toString() ?? '') ?? double.tryParse(trade['pnl']?.toString() ?? '') ?? 0.0;
    final roi = double.tryParse(trade['percentage']?.toString() ?? '') ?? double.tryParse(trade['roi']?.toString() ?? '') ?? 0.0;
    final leverage = double.tryParse(trade['leverage']?.toString() ?? '') ?? 1.0;
    // margin comes from accountBalance stored at trade creation time, or from initialMargin if available
    final margin = double.tryParse(trade['margin']?.toString() ?? '') ?? double.tryParse(trade['initialMargin']?.toString() ?? '') ?? 0.0;
    final notional = margin * leverage;
    final isPositive = pnl >= 0;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        title: Text('${trade['symbol'] ?? 'UNK'} - Inspector de Posición', style: TextStyle(color: AppColors.textPrimary, fontSize: 16)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textSecondary),
          onPressed: () { if (context.canPop()) { context.pop(); } else { final currentUrl = GoRouterState.of(context).uri.toString(); if (currentUrl.contains('history')) { context.go('/history'); } else { context.go('/dashboard'); } } },
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(32),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1200),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(width: 8, height: 8, decoration: BoxDecoration(color: isClosed ? AppColors.textSecondary : AppColors.winGreen, shape: BoxShape.circle)),
                      const SizedBox(width: 12),
                      Text(isClosed ? 'MQ // INSPECTOR DE POSICIÓN CERRADA' : 'MQ // INSPECTOR DE POSICIÓN ACTIVA', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 1)),
                      const SizedBox(width: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: (isClosed ? AppColors.textSecondary : AppColors.winGreen).withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(4),
                          border: Border.all(color: (isClosed ? AppColors.textSecondary : AppColors.winGreen).withValues(alpha: 0.3))
                        ),
                        child: Text(isClosed ? (trade['status'] ?? 'CERRADA') : 'EN CURSO', style: TextStyle(color: isClosed ? AppColors.textSecondary : AppColors.winGreen, fontSize: 10, fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                  const SizedBox() // Removed CERRAR button
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const SizedBox(width: 20),
                  Text('0.38ms • ZÚRICH CLUSTER L2 • STREAMING L1 / #ORD-MQ-8841-ETH', style: TextStyle(color: AppColors.textSecondary.withValues(alpha: 0.5), fontSize: 9)),
                ],
              ),
              const SizedBox(height: 32),
              // Body
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Left Side
                  Expanded(
                    flex: 4,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                (trade['symbol'] ?? 'UNK').toString().replaceFirst(':USDT', ''),
                                style: const TextStyle(color: AppColors.textPrimary, fontSize: 22, fontWeight: FontWeight.bold),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(4)),
                              child: const Text('PERPETUO', style: TextStyle(color: AppColors.textSecondary, fontSize: 10)),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                              decoration: BoxDecoration(color: (isLong ? AppColors.winGreen : AppColors.lossRed).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(20), border: Border.all(color: (isLong ? AppColors.winGreen : AppColors.lossRed).withValues(alpha: 0.3))),
                              child: Row(
                                children: [
                                  Container(width: 6, height: 6, decoration: BoxDecoration(color: (isLong ? AppColors.winGreen : AppColors.lossRed), shape: BoxShape.circle)),
                                  const SizedBox(width: 6),
                                  Text('${isLong ? "LONG" : "SHORT"} x${trade['leverage'] ?? "?"}', style: TextStyle(color: isLong ? AppColors.winGreen : AppColors.lossRed, fontSize: 10, fontWeight: FontWeight.bold)),
                                ],
                              ),
                            )
                          ],
                        ),
                        const SizedBox(height: 32),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('${isClosed ? 'PNL REALIZADO' : 'PNL NO REALIZADO (UPNL)'}', style: TextStyle(color: AppColors.textSecondary, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1)),
                            Text('MARK BASIS', style: TextStyle(color: AppColors.winGreen, fontSize: 10, fontWeight: FontWeight.bold)),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text('${isPositive ? "+" : ""}\$${pnl.toStringAsFixed(2)}', style: TextStyle(color: isPositive ? AppColors.winGreen : AppColors.lossRed, fontSize: 40, fontWeight: FontWeight.bold)),
                            const SizedBox(width: 8),
                            Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: Text('USDT', style: TextStyle(color: isPositive ? AppColors.winGreen : AppColors.lossRed, fontSize: 14, fontWeight: FontWeight.bold)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          decoration: BoxDecoration(
                            color: (isPositive ? AppColors.winGreen : AppColors.lossRed).withValues(alpha: 0.1),
                            border: Border.all(color: (isPositive ? AppColors.winGreen : AppColors.lossRed).withValues(alpha: 0.3)),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text('${isPositive ? "+" : ""}${roi.toStringAsFixed(2)}% ROI (RETORNO S/ MARGEN)', style: TextStyle(color: isPositive ? AppColors.winGreen : AppColors.lossRed, fontSize: 14, fontWeight: FontWeight.bold)),
                        ),
                        const SizedBox(height: 48),
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(8), border: Border.all(color: AppColors.border)),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Icon(Icons.shield_outlined, color: AppColors.winGreen, size: 20),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text('Garantía de Ejecución L2', style: TextStyle(color: AppColors.textPrimary, fontSize: 14, fontWeight: FontWeight.bold)),
                                    const SizedBox(height: 4),
                                    Text('Posición respaldada por Binance Futures API. Slippage mitigado.', style: TextStyle(color: AppColors.textSecondary.withValues(alpha: 0.8), fontSize: 12)),
                                  ],
                                ),
                              )
                            ],
                          ),
                        )
                      ],
                    ),
                  ),
                  const SizedBox(width: 40),
                  // Divider
                  Container(width: 1, height: 400, color: AppColors.border),
                  const SizedBox(width: 40),
                  // Right Side
                  Expanded(
                    flex: 6,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('PARÁMETROS DE MERCADO Y SEÑAL', style: TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 1)),
                          ],
                        ),
                        const SizedBox(height: 32),
                        _buildRightRow('ESTRATEGIA ALGORÍTMICA', trade['strategy'] ?? '-', isClosed ? (trade['status'] ?? 'CERRADA') : 'EN CURSO', AppColors.textPrimary, isClosed ? AppColors.textSecondary : AppColors.winGreen),
                        _buildRightDivider(),
                        _buildRightRow('VALOR NOCIONAL & MARGEN', 'Apalancamiento x${trade['leverage'] ?? 1} Cross', '\$${notional.toStringAsFixed(2)} USDT', AppColors.textSecondary, AppColors.textPrimary, subVal: 'Margen: \$${margin.toStringAsFixed(2)} USDT'),
                        _buildRightDivider(),
                        _buildRightRow('ENTRADA VS PRECIO SALIDA', isClosed ? 'Precio ejecutado' : 'Diferencial en vivo', '\$${double.tryParse(trade['entryPrice']?.toString() ?? '')?.toStringAsFixed(4) ?? '-'} → \$${double.tryParse(trade['exitPrice']?.toString() ?? trade['markPrice']?.toString() ?? '')?.toStringAsFixed(4) ?? '-'}', AppColors.textSecondary, AppColors.textPrimary),
                        _buildRightDivider(),
                        _buildRightRow('STOP LOSS', 'Nivel de salida por pérdida', '\$${double.tryParse(trade['stopLoss']?.toString().replaceAll('-', '') ?? '')?.toStringAsFixed(4) ?? (trade['stopLoss'] ?? '-')}', AppColors.textSecondary, AppColors.lossRed, isSl: true),
                        _buildRightDivider(),
                        _buildRightRow('TAKE PROFIT', 'Objetivo Algorítmico', '\$${double.tryParse(trade['takeProfit']?.toString().replaceAll('-', '') ?? '')?.toStringAsFixed(4) ?? (trade['takeProfit'] ?? '-')}', AppColors.textSecondary, AppColors.winGreen, isTp: true),
                        _buildRightDivider(),
                        _buildRightRow('FUNDING RATE', 'Tasa de permuta perp 8h', '+${trade['fundingRate'] ?? "0.0000"}%', AppColors.textSecondary, AppColors.winGreen),
                        _buildRightDivider(),
                        _buildRightRow('LIQUIDACIÓN', 'Riesgo de margen', '\$${trade['liquidationPrice'] ?? "-"} USDT', AppColors.textSecondary, AppColors.lossRed),
                        
                        const SizedBox(height: 24),
                        Row(
                          children: [
                            const Icon(Icons.api, color: AppColors.textSecondary, size: 12),
                            const SizedBox(width: 6),
                            const Text('ORÁCULO DESCENTRALIZADO: PYTH / CHAINLINK CONSENSUS 100%', style: TextStyle(color: AppColors.textSecondary, fontSize: 9, letterSpacing: 0.5)),
                            const Spacer(),
                            const Text('DRIFT: 0.00018s', style: TextStyle(color: AppColors.textSecondary, fontSize: 9)),
                          ],
                        )
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 40),
              // Bottom Buttons
              if (!isClosed) Row(
                children: [
                  OutlinedButton.icon(
                    onPressed: () {},
                    icon: const Icon(Icons.block, size: 14),
                    label: const Text('Cerrar Posición Manualmente', style: TextStyle(fontSize: 12)),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.lossRed, 
                      side: BorderSide(color: AppColors.lossRed.withValues(alpha: 0.3)), 
                      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 24)
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        ),
      ),
    );
  }

  Widget _buildLeftRow(String label, String value, Color valColor) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 10, fontWeight: FontWeight.bold)),
        Text(value, style: TextStyle(color: valColor, fontSize: 12, fontWeight: FontWeight.bold)),
      ],
    );
  }

  Widget _buildRightRow(String label, String subLabel, String val, Color subColor, Color valColor, {String? subVal, Color? subValColor, bool isSl = false, bool isTp = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (isSl) ...[Container(width: 8, height: 8, decoration: const BoxDecoration(color: AppColors.lossRed, shape: BoxShape.circle)), const SizedBox(width: 8)],
                if (isTp) ...[Container(width: 8, height: 8, decoration: const BoxDecoration(color: AppColors.winGreen, shape: BoxShape.circle)), const SizedBox(width: 8)],
                Text(label, style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.bold)),
              ],
            ),
            const SizedBox(height: 4),
            Text(subLabel, style: TextStyle(color: subColor, fontSize: 12)),
          ],
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(val, style: TextStyle(color: valColor, fontSize: 14, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            if (subVal != null) Text(subVal, style: TextStyle(color: subValColor ?? AppColors.textSecondary, fontSize: 12)),
          ],
        ),
      ],
    );
  }

  Widget _buildRightDivider() {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 12),
      child: Divider(color: AppColors.border, height: 1),
    );
  }
}
