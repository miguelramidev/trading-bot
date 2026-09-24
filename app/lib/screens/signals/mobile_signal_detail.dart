import 'package:flutter/material.dart';
import 'package:k_chart/k_chart_widget.dart';
import 'package:k_chart/flutter_k_chart.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import 'package:fl_chart/fl_chart.dart';

class MobileSignalDetail extends StatefulWidget {
  final Map<String, dynamic> signal;

  const MobileSignalDetail({super.key, required this.signal});

  @override
  State<MobileSignalDetail> createState() => _MobileSignalDetailState();
}

class _MobileSignalDetailState extends State<MobileSignalDetail> {
  List<KLineEntity> candles = [];
  bool isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchCandles();
  }

  Future<void> _fetchCandles() async {
    try {
      final symbol = (widget.signal['symbol'] ?? 'SOLUSDT').replaceAll('/', '');
      final res = await http.get(Uri.parse('https://api.binance.com/api/v3/klines?symbol=$symbol&interval=15m&limit=100'));
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as List;
        setState(() {
          candles = data.map((e) => KLineEntity.fromCustom(time: e[0], open: double.parse(e[1]), high: double.parse(e[2]), low: double.parse(e[3]), close: double.parse(e[4]), vol: double.parse(e[5]))).toList();
          DataUtil.calculate(candles);
          isLoading = false;
        });
      }
    } catch (e) {
      setState(() => isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        title: Text('Aprobación L2', style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary, fontSize: 14)),
        centerTitle: true,
        leading: IconButton(icon: const Icon(Icons.arrow_back, color: AppColors.textSecondary), onPressed: () => Navigator.pop(context)),
      ),
      body: Stack(
        children: [
          SingleChildScrollView(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildHeader(),
                const SizedBox(height: 16),
                SizedBox(
                  height: 300,
                  child: Container(
                    decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
                    clipBehavior: Clip.hardEdge,
                    child: isLoading 
                      ? const Center(child: CircularProgressIndicator(color: AppColors.winGreen))
                      : KChartWidget(
                          candles,
                          ChartStyle(),
                          ChartColors()..bgColor = [AppColors.surface, AppColors.surface]
                                       ..upColor = AppColors.winGreen
                                       ..dnColor = AppColors.lossRed,
                          isLine: false,
                          isTrendLine: false,
                          mainState: MainState.MA,
                          secondaryState: SecondaryState.MACD,
                        ),
                  ),
                ),
                const SizedBox(height: 16),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _buildMiniChart('15m MACD', '+0.42', Colors.teal),
                      const SizedBox(width: 12),
                      _buildMiniChart('4H RSI', '68.2', Colors.blue),
                      const SizedBox(width: 12),
                      _buildMiniChart('1D Corr.', '+0.89', Colors.purple),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                _buildInfoPanel(),
                const SizedBox(height: 100), // Space for bottom buttons
              ],
            ),
          ),
          // Fixed Bottom Buttons
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.background,
                border: const Border(top: BorderSide(color: AppColors.border)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => Navigator.pop(context),
                      style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16), side: const BorderSide(color: AppColors.border), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                      icon: const Icon(Icons.close, color: AppColors.textSecondary, size: 18),
                      label: const Text('Descartar', style: TextStyle(color: AppColors.textSecondary, fontSize: 16)),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () {
                        Navigator.pop(context);
                      },
                      style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16), backgroundColor: AppColors.winGreen, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                      icon: const Icon(Icons.flash_on, color: Colors.black, size: 18),
                      label: const Text('Operar', style: TextStyle(color: Colors.black, fontSize: 16, fontWeight: FontWeight.bold)),
                    ),
                  ),
                ],
              ),
            ),
          )
        ],
      ),
    );
  }

  Widget _buildHeader() {
    final dir = widget.signal['direction'] ?? 'LONG';
    final isLong = dir.toUpperCase() == 'LONG';
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.signal['symbol'] ?? 'SOL/USDT', style: const TextStyle(color: AppColors.textPrimary, fontSize: 28, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text('\$${widget.signal['price'] ?? '0.00'}', style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary, fontSize: 18)),
          ],
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(color: (isLong ? AppColors.winGreen : AppColors.lossRed).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(20), border: Border.all(color: (isLong ? AppColors.winGreen : AppColors.lossRed))),
          child: Text('SEÑAL $dir', style: AppTheme.monoStyle.copyWith(color: isLong ? AppColors.winGreen : AppColors.lossRed, fontWeight: FontWeight.bold)),
        ),
      ],
    );
  }

  Widget _buildMiniChart(String title, String value, Color color) {
    return Container(
      width: 140,
      height: 100,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(title, style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10)),
              Text(value, style: AppTheme.monoStyle.copyWith(color: color, fontSize: 10, fontWeight: FontWeight.bold)),
            ],
          ),
          const Spacer(),
          SizedBox(
            height: 30,
            child: LineChart(
              LineChartData(
                gridData: FlGridData(show: false),
                titlesData: FlTitlesData(show: false),
                borderData: FlBorderData(show: false),
                lineBarsData: [
                  LineChartBarData(
                    spots: const [FlSpot(0, 1), FlSpot(1, 1.5), FlSpot(2, 1.4), FlSpot(3, 2), FlSpot(4, 2.2)],
                    isCurved: true,
                    color: color,
                    barWidth: 2,
                    dotData: FlDotData(show: false),
                    belowBarData: BarAreaData(show: true, color: color.withValues(alpha: 0.1)),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoPanel() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Resumen Cuantitativo', style: TextStyle(color: AppColors.textPrimary, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),
          _infoRow('Estrategia', 'MACD + VWAP'),
          const Divider(color: AppColors.border, height: 24),
          Row(
            children: [
              Expanded(child: _infoBlock('Stop Loss', '\$${widget.signal['stopLoss'] ?? '0.00'}', AppColors.lossRed)),
              Container(width: 1, height: 40, color: AppColors.border),
              Expanded(child: _infoBlock('Take Profit', '\$${widget.signal['takeProfit'] ?? '0.00'}', AppColors.winGreen, alignRight: true)),
            ],
          ),
          const Divider(color: AppColors.border, height: 24),
          const Text('RAZÓN DEL TRADE (SÍNTESIS)', style: TextStyle(color: AppColors.textSecondary, fontSize: 10, letterSpacing: 1)),
          const SizedBox(height: 8),
          const Text('Divergencia alcista confirmada en 15m con absorción institucional de liquidez en soporte semanal y correlación positiva con rebote en BTC/USDT.', style: TextStyle(color: AppColors.textSecondary, height: 1.5, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
        Text(value, style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary, fontWeight: FontWeight.bold, fontSize: 12)),
      ],
    );
  }

  Widget _infoBlock(String label, String value, Color color, {bool alignRight = false}) {
    return Column(
      crossAxisAlignment: alignRight ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(), style: const TextStyle(color: AppColors.textSecondary, fontSize: 10, letterSpacing: 1)),
        const SizedBox(height: 4),
        Text(value, style: AppTheme.monoStyle.copyWith(color: color, fontWeight: FontWeight.bold, fontSize: 14)),
      ],
    );
  }
}






