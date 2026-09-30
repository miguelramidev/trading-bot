import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/price_formatter.dart';
import '../../core/utils/symbol_formatter.dart';
import 'package:go_router/go_router.dart';

class DesktopTradeDetail extends StatelessWidget {
  final Map<String, dynamic> trade;

  final bool isClosed;
  const DesktopTradeDetail({super.key, required this.trade, this.isClosed = false});

  @override
  Widget build(BuildContext context) {
    final isLong = (trade['side'] ?? trade['direction'])?.toString().toUpperCase() == 'LONG';
    final pnl = double.tryParse(trade['unrealizedPnl']?.toString() ?? '') ?? double.tryParse(trade['pnl']?.toString() ?? '') ?? 0.0;
    final roi = double.tryParse(trade['percentage']?.toString() ?? '') ?? double.tryParse(trade['roi']?.toString() ?? '');
    // El apalancamiento puede venir null (trades del historial, que tampoco guardan tamaño de
    // posición): en ese caso margen y nocional se muestran como "—". El campo `margin` del
    // historial viene de `accountBalance`, que está roto (ver ROADMAP.md) — no es confiable,
    // por eso se prioriza `initialMargin` (real, de Binance) y si no está, se calcula.
    final leverage = double.tryParse(trade['leverage']?.toString() ?? '');
    final double? margin = double.tryParse(trade['initialMargin']?.toString() ?? '') ??
        (leverage != null ? (double.tryParse(trade['entryPrice']?.toString() ?? '') ?? 1.0) * (double.tryParse(trade['size']?.toString() ?? '') ?? 1.0) / leverage : null);
    final double? notional = (margin != null && leverage != null) ? margin * leverage : null;
    final isPositive = pnl >= 0;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        title: Text('${fmtSymbol(trade['symbol'])} - Inspector de Posición', style: TextStyle(color: AppColors.textPrimary, fontSize: 16)),
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
                                fmtSymbol(trade['symbol']),
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
                                  Text('${isLong ? "LONG" : "SHORT"} ${trade['leverage'] != null ? "x${trade['leverage']}" : "—"}', style: TextStyle(color: isLong ? AppColors.winGreen : AppColors.lossRed, fontSize: 10, fontWeight: FontWeight.bold)),
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
                          child: Text(roi != null ? '${roi >= 0 ? "+" : ""}${roi.toStringAsFixed(2)}% ROI (RETORNO S/ MARGEN)' : '— ROI (RETORNO S/ MARGEN)', style: TextStyle(color: isPositive ? AppColors.winGreen : AppColors.lossRed, fontSize: 14, fontWeight: FontWeight.bold)),
                        ),
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
                        _buildRightRow('VALOR NOCIONAL & MARGEN', 'Apalancamiento ${trade['leverage'] != null ? "x${trade['leverage']}" : "—"} ${trade['marginMode']?.toString().toUpperCase() ?? "—"}', notional != null ? '\$${notional.toStringAsFixed(2)} USDT' : '—', AppColors.textSecondary, AppColors.textPrimary, subVal: 'Margen: ${margin != null ? '\$${margin.toStringAsFixed(2)} USDT' : '—'}'),
                        _buildRightDivider(),
                        _buildRightRow('ENTRADA VS PRECIO SALIDA', isClosed ? 'Precio ejecutado' : 'Diferencial en vivo', '\$${fmtPrice(trade['entryPrice'])} → \$${fmtPrice(trade['exitPrice'] ?? trade['markPrice'])}', AppColors.textSecondary, AppColors.textPrimary),
                        _buildRightDivider(),
                        _buildRightRow('STOP LOSS', 'Nivel de salida por pérdida', '\$${fmtPrice(trade['stopLoss'])}', AppColors.textSecondary, AppColors.lossRed, isSl: true),
                        _buildRightDivider(),
                        _buildRightRow('TAKE PROFIT', 'Objetivo Algorítmico', '\$${fmtPrice(trade['takeProfit'])}', AppColors.textSecondary, AppColors.winGreen, isTp: true),
                        _buildRightDivider(),
                        _buildRightRow('FUNDING RATE', 'Tasa de permuta perp 8h', '+${trade['fundingRate'] ?? "0.0000"}%', AppColors.textSecondary, AppColors.winGreen),
                        _buildRightDivider(),
                        _buildRightRow('LIQUIDACIÓN', 'Riesgo de margen', '\$${trade['liquidationPrice'] ?? "-"} USDT', AppColors.textSecondary, AppColors.lossRed),
                      ],
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
