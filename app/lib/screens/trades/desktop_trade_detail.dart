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
    final pnl = (trade['unrealizedPnl'] as num?)?.toDouble() ?? (trade['pnl'] as num?)?.toDouble() ?? 0.0;
    final roi = (trade['percentage'] as num?)?.toDouble() ?? (trade['roi'] as num?)?.toDouble() ?? 0.0;
    final margin = (trade['initialMargin'] as num?)?.toDouble() ?? ((trade['entryPrice'] as num? ?? 1.0) * (trade['size'] as num? ?? 1.0) / (trade['leverage'] as num? ?? 1.0));
    final notional = margin * (trade['leverage'] as num? ?? 1.0);
    final isPositive = pnl >= 0;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        title: Text('${trade['symbol'] ?? 'UNK'} - Inspector de Posición', style: TextStyle(color: AppColors.textPrimary, fontSize: 16)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textSecondary),
          onPressed: () { if (context.canPop()) context.pop(); else context.go('/dashboard'); },
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
                      Container(width: 8, height: 8, decoration: const BoxDecoration(color: AppColors.winGreen, shape: BoxShape.circle)),
                      const SizedBox(width: 12),
                      const Text('MQ // INSPECTOR DE POSICIÓN ACTIVA', style: TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 1)),
                      const SizedBox(width: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(color: AppColors.winGreen.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(4), border: Border.all(color: AppColors.winGreen.withValues(alpha: 0.3))),
                        child: const Text('L2 EXECUTION ENGINE', style: TextStyle(color: AppColors.winGreen, fontSize: 10, fontWeight: FontWeight.bold)),
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
                            Text(trade['symbol'] ?? 'UNK', style: const TextStyle(color: AppColors.textPrimary, fontSize: 24, fontWeight: FontWeight.bold)),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(4)),
                              child: const Text('PERPETUO', style: TextStyle(color: AppColors.textSecondary, fontSize: 10)),
                            ),
                            const Spacer(),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                              decoration: BoxDecoration(color: (isLong ? AppColors.winGreen : AppColors.lossRed).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(20), border: Border.all(color: (isLong ? AppColors.winGreen : AppColors.lossRed).withValues(alpha: 0.3))),
                              child: Row(
                                children: [
                                  Container(width: 6, height: 6, decoration: BoxDecoration(color: (isLong ? AppColors.winGreen : AppColors.lossRed), shape: BoxShape.circle)),
                                  const SizedBox(width: 6),
                                  Text('${isLong ? "LONG" : "SHORT"} ${trade['leverage']}X CROSS', style: TextStyle(color: isLong ? AppColors.winGreen : AppColors.lossRed, fontSize: 10, fontWeight: FontWeight.bold)),
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
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: (isPositive ? AppColors.winGreen : AppColors.lossRed).withValues(alpha: 0.1),
                            border: Border.all(color: (isPositive ? AppColors.winGreen : AppColors.lossRed).withValues(alpha: 0.3)),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text('${isPositive ? "+" : ""}${roi.toStringAsFixed(2)}% ROI (RETORNO S/ MARGEN)', style: TextStyle(color: isPositive ? AppColors.winGreen : AppColors.lossRed, fontSize: 10, fontWeight: FontWeight.bold)),
                        ),
                        const SizedBox(height: 48),
                        _buildLeftRow('PNL REALIZADO ACUMULADO', '+\$0.00 USDT', AppColors.textPrimary),
                        const SizedBox(height: 16),
                        _buildLeftRow('FINANCIACIÓN DEVENGADA', '-0.00 USDT', AppColors.lossRed),
                        const SizedBox(height: 16),
                        _buildLeftRow('DELTA INSTITUCIONAL L1', '+0.000 ETH (Delta Hedged)', AppColors.winGreen),
                        const SizedBox(height: 48),
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(8), border: Border.all(color: AppColors.border)),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Icon(Icons.shield_outlined, color: AppColors.winGreen, size: 16),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text('Garantía de Ejecución Atómica L2', style: TextStyle(color: AppColors.textPrimary, fontSize: 11, fontWeight: FontWeight.bold)),
                                    const SizedBox(height: 4),
                                    Text('Posición respaldada por colateral segregado multi-custodia. Slippage máximo tolerado: 0.001%.', style: TextStyle(color: AppColors.textSecondary.withValues(alpha: 0.8), fontSize: 10)),
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
                            Text('PARÁMETROS MATEMÁTICOS & CONDICIONES DE MERCADO', style: TextStyle(color: AppColors.textSecondary, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1)),
                            Row(
                              children: [
                                Icon(Icons.verified, color: AppColors.winGreen, size: 10),
                                SizedBox(width: 4),
                                Text('AUDITADO ALADDIN/MQ', style: TextStyle(color: AppColors.winGreen, fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
                              ],
                            )
                          ],
                        ),
                        const SizedBox(height: 32),
                        _buildRightRow('ESTRATEGIA ALGORÍTMICA', trade['strategy'] ?? 'Motor Momentum Cuántico', 'Alpha-Momentum v4.2 [ID-982]', AppColors.textPrimary, AppColors.winGreen),
                        _buildRightDivider(),
                        _buildRightRow('VALOR NOCIONAL & MARGEN', 'Colateral aislado / cross', '\$${notional.toStringAsFixed(2)} USDT', AppColors.textSecondary, AppColors.textPrimary, subVal: 'Margen Asignado: \$${margin.toStringAsFixed(2)} USDT'),
                        _buildRightDivider(),
                        _buildRightRow('MODO DE APALANCAMIENTO', 'Factor de multiplicación dinámico', '${trade['leverage']}x Cross Margin', AppColors.textSecondary, AppColors.textPrimary, subVal: 'Modo Cobertura Activo (Hedge L1)', subValColor: AppColors.textSecondary),
                        _buildRightDivider(),
                        _buildRightRow('ENTRADA VS MARK PRICE', 'Índice agregado ponderado', '\$${trade['entryPrice']} → \$${trade['markPrice'] ?? trade['exitPrice'] ?? "-"}', AppColors.textSecondary, AppColors.textPrimary, subVal: 'Diferencial spread calculado', subValColor: AppColors.winGreen),
                        _buildRightDivider(),
                        _buildRightRow('DISTANCIA A STOP LOSS', 'Garantía Dinámica s/ Volatilidad', '\$${trade['stopLoss'] ?? "-"} USDT', AppColors.textSecondary, AppColors.textPrimary, subVal: '-2.94% / Delta -3.8%', subValColor: AppColors.lossRed, isSl: true),
                        _buildRightDivider(),
                        _buildRightRow('DISTANCIA A TAKE PROFIT', 'Objetivo Algorítmico VWAP +2σ', '\$${trade['takeProfit'] ?? "-"} USDT', AppColors.textSecondary, AppColors.textPrimary, subVal: '+5.83% / (R/R: 1:1.98)', subValColor: AppColors.winGreen, isTp: true),
                        _buildRightDivider(),
                        _buildRightRow('FUNDING RATE & PRÓXIMO CORTE', 'Tasa de permuta perp 8h', '+${trade['fundingRate'] ?? "0.0000"}%', AppColors.textSecondary, AppColors.textPrimary, subVal: 'Ciclo en 02:41:15', subValColor: AppColors.textSecondary),
                        _buildRightDivider(),
                        _buildRightRow('LIQUIDACIÓN TEÓRICA', 'Riesgo de margen cero', '\$${trade['liquidationPrice'] ?? "-"} USDT', AppColors.textSecondary, AppColors.lossRed, subVal: 'Distancia de Seguridad: 17.4%', subValColor: AppColors.winGreen),
                        
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
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () {},
                      icon: const Icon(Icons.close, size: 14),
                      label: const Text('Cierre de\nEmergencia', textAlign: TextAlign.center, style: TextStyle(fontSize: 11)),
                      style: OutlinedButton.styleFrom(foregroundColor: AppColors.lossRed, side: BorderSide(color: AppColors.lossRed.withValues(alpha: 0.3)), padding: const EdgeInsets.symmetric(vertical: 12)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () {},
                      style: OutlinedButton.styleFrom(foregroundColor: AppColors.textPrimary, side: const BorderSide(color: AppColors.border), padding: const EdgeInsets.symmetric(vertical: 12)),
                      child: const Text('Cerrar Posición\n(Market L2)', textAlign: TextAlign.center, style: TextStyle(fontSize: 11)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () {},
                      style: OutlinedButton.styleFrom(foregroundColor: AppColors.textPrimary, side: const BorderSide(color: AppColors.border), padding: const EdgeInsets.symmetric(vertical: 12)),
                      child: const Text('Ajustar TP / SL\nDinámico', textAlign: TextAlign.center, style: TextStyle(fontSize: 11)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () {},
                      style: OutlinedButton.styleFrom(foregroundColor: AppColors.textPrimary, side: const BorderSide(color: AppColors.border), padding: const EdgeInsets.symmetric(vertical: 12)),
                      child: const Text('Agregar\nMargen', textAlign: TextAlign.center, style: TextStyle(fontSize: 11)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(border: Border.all(color: AppColors.winGreen.withValues(alpha: 0.3)), borderRadius: BorderRadius.circular(4)),
                    child: const Row(
                      children: [
                        Icon(Icons.lock, color: AppColors.winGreen, size: 12),
                        SizedBox(width: 6),
                        Text('FIPS 140-3\nPROTEGIDO', style: TextStyle(color: AppColors.winGreen, fontSize: 8)),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () {},
                      style: OutlinedButton.styleFrom(foregroundColor: AppColors.textPrimary, side: const BorderSide(color: AppColors.border), padding: const EdgeInsets.symmetric(vertical: 12)),
                      child: const Text('Cerrar Parcial\n(50%)', textAlign: TextAlign.center, style: TextStyle(fontSize: 11)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {},
                      style: ElevatedButton.styleFrom(backgroundColor: AppColors.winGreen, foregroundColor: Colors.black, padding: const EdgeInsets.symmetric(vertical: 12)),
                      child: const Text('Rebalancear\nDelta', textAlign: TextAlign.center, style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                    ),
                  ),
                ],
              )
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
                if (isSl) ...[Container(width: 6, height: 6, decoration: const BoxDecoration(color: AppColors.lossRed, shape: BoxShape.circle)), const SizedBox(width: 6)],
                if (isTp) ...[Container(width: 6, height: 6, decoration: const BoxDecoration(color: AppColors.winGreen, shape: BoxShape.circle)), const SizedBox(width: 6)],
                Text(label, style: const TextStyle(color: AppColors.textPrimary, fontSize: 10, fontWeight: FontWeight.bold)),
              ],
            ),
            const SizedBox(height: 4),
            Text(subLabel, style: TextStyle(color: subColor, fontSize: 10)),
          ],
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(val, style: TextStyle(color: valColor, fontSize: 11, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            if (subVal != null) Text(subVal, style: TextStyle(color: subValColor ?? AppColors.textSecondary, fontSize: 10)),
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
