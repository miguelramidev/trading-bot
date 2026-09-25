import 'package:go_router/go_router.dart';
import 'package:flutter/material.dart';
import 'package:k_chart/k_chart_widget.dart';
import 'package:k_chart/flutter_k_chart.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../../core/network/api_client.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/app_toast.dart';
import 'package:fl_chart/fl_chart.dart';

class DesktopSignalDetail extends StatefulWidget {
  final Map<String, dynamic> signal;

  const DesktopSignalDetail({super.key, required this.signal});

  @override
  State<DesktopSignalDetail> createState() => _DesktopSignalDetailState();
}

class _DesktopSignalDetailState extends State<DesktopSignalDetail> {
  List<KLineEntity> candles = [];
  List<KLineEntity> macro4hCandles = [];
  List<KLineEntity> macro1dCandles = [];
  List<KLineEntity> btc1dCandles = [];
  bool themeIsDark = true;
  bool isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchCandles();
  }

  Future<void> _fetchCandles() async {
    try {
      final symbol = (widget.signal['symbol'] ?? 'SOLUSDT').replaceAll('/', '');
      
      final responses = await Future.wait([
        ApiClient.get('/api/market/klines?symbol=$symbol&interval=15m&limit=100'),
        ApiClient.get('/api/market/klines?symbol=$symbol&interval=4h&limit=100'),
        ApiClient.get('/api/market/klines?symbol=$symbol&interval=1d&limit=100'),
        ApiClient.get('/api/market/klines?symbol=BTCUSDT&interval=1d&limit=100'),
      ]);

      if (responses[0].statusCode == 200) {
        setState(() {
          candles = (jsonDecode(responses[0].body) as List).map((e) => KLineEntity.fromCustom(time: e[0], open: double.parse(e[1]), high: double.parse(e[2]), low: double.parse(e[3]), close: double.parse(e[4]), vol: double.parse(e[5]))).toList();
          macro4hCandles = (jsonDecode(responses[1].body) as List).map((e) => KLineEntity.fromCustom(time: e[0], open: double.parse(e[1]), high: double.parse(e[2]), low: double.parse(e[3]), close: double.parse(e[4]), vol: double.parse(e[5]))).toList();
          macro1dCandles = (jsonDecode(responses[2].body) as List).map((e) => KLineEntity.fromCustom(time: e[0], open: double.parse(e[1]), high: double.parse(e[2]), low: double.parse(e[3]), close: double.parse(e[4]), vol: double.parse(e[5]))).toList();
          btc1dCandles = (jsonDecode(responses[3].body) as List).map((e) => KLineEntity.fromCustom(time: e[0], open: double.parse(e[1]), high: double.parse(e[2]), low: double.parse(e[3]), close: double.parse(e[4]), vol: double.parse(e[5]))).toList();
          
          DataUtil.calculate(candles);
          DataUtil.calculate(macro4hCandles);
          DataUtil.calculate(macro1dCandles);
          DataUtil.calculate(btc1dCandles);
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
        backgroundColor: AppColors.surface,
        elevation: 0,
        title: Text('${widget.signal['symbol']} - Terminal Cuantitativa L2', style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary, fontSize: 16)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textSecondary),
          onPressed: () { if (context.canPop()) context.pop(); else context.go('/dashboard'); },
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // LEFT COLUMN: Chart + Matriz
            Expanded(
              flex: 7,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildHeader(),
                  const SizedBox(height: 16),
                  Expanded(
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
                  Row(
                    children: [
                      Expanded(child: _buildCandleMiniChart('${widget.signal['symbol'] ?? 'SOL'} (4H)', macro4hCandles)),
                      const SizedBox(width: 16),
                      Expanded(child: _buildCandleMiniChart('${widget.signal['symbol'] ?? 'SOL'} (1D)', macro1dCandles)),
                      const SizedBox(width: 16),
                      Expanded(child: _buildCandleMiniChart('BTC/USDT (1D)', btc1dCandles)),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 24),
            // RIGHT COLUMN: Info
            Expanded(
              flex: 3,
              child: SingleChildScrollView(
                child: _buildInfoPanel(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    final dir = widget.signal['direction'] ?? 'LONG';
    final isLong = dir.toUpperCase() == 'LONG';
    return Row(
      children: [
        Text(widget.signal['symbol'] ?? 'SOL/USDT', style: const TextStyle(color: AppColors.textPrimary, fontSize: 32, fontWeight: FontWeight.bold)),
        const SizedBox(width: 16),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(color: (isLong ? AppColors.winGreen : AppColors.lossRed).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(20), border: Border.all(color: (isLong ? AppColors.winGreen : AppColors.lossRed))),
          child: Text('SEÑAL $dir', style: AppTheme.monoStyle.copyWith(color: isLong ? AppColors.winGreen : AppColors.lossRed, fontWeight: FontWeight.bold)),
        ),
        const Spacer(),
        Text('\$${widget.signal['price'] ?? '0.00'}', style: const TextStyle(color: AppColors.textPrimary, fontSize: 24, fontWeight: FontWeight.bold)),
      ],
    );
  }

  Widget _buildCandleMiniChart(String title, List<KLineEntity> data) {
    return Container(
      height: 350, // Maxima visibilidad
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 8, top: 4, bottom: 8),
            child: Text(title, style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.bold)),
          ),
          Expanded(
            child: data.isEmpty 
              ? const Center(child: CircularProgressIndicator())
              : ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: KChartWidget(
                    data,
                    ChartStyle(),
                    ChartColors()..bgColor = [AppColors.surface, AppColors.surface]
                                 ..upColor = AppColors.winGreen
                                 ..dnColor = AppColors.lossRed,
                    isLine: false,
                    isTrendLine: false,
                    mainState: MainState.NONE,
                    secondaryState: SecondaryState.NONE,
                  ),
                ),
          ),
        ],
      ),
    );
  }

  Widget _buildMiniChart(String title, String value, Color color) {
    return Container(
      height: 120,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(title, style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10)),
              Text(value, style: AppTheme.monoStyle.copyWith(color: color, fontSize: 12, fontWeight: FontWeight.bold)),
            ],
          ),
          const Spacer(),
          SizedBox(
            height: 40,
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

  String _getSignalStatus() {
    final decision = widget.signal['decision'];
    final isActive = widget.signal['isActiveTrade'] ?? false;
    
    if (decision == 'Tomada') {
      return isActive ? 'YA SE OPERÓ (ACTIVA)' : 'YA TERMINÓ';
    } else if (decision == 'Descartada') {
      return 'DESCARTADA';
    } else {
      if (widget.signal['evaluatedAt'] != null) {
        final evalTime = DateTime.parse(widget.signal['evaluatedAt']);
        if (DateTime.now().toUtc().difference(evalTime).inMinutes > 60) {
          return 'EXPIRADA';
        }
      }
      return 'PENDIENTE DE DECISIÓN';
    }
  }

  Color _getStatusColor(String status) {
    if (status.contains('ACTIVA')) return AppColors.winGreen;
    if (status.contains('TERMINÓ')) return Colors.blue;
    if (status == 'DESCARTADA') return AppColors.lossRed;
    if (status == 'EXPIRADA') return Colors.grey;
    return Colors.orange; // PENDIENTE
  }

  Widget _buildInfoPanel() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Resumen Cuantitativo', style: TextStyle(color: AppColors.textPrimary, fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 24),
              _infoRow('Estrategia', widget.signal['strategy'] ?? widget.signal['regime'] ?? 'Motor Cuántico'),
              const SizedBox(height: 16),
              _infoRow('Correlación BTC', widget.signal['btcCorrelation'] ?? 'N/A', valueColor: AppColors.winGreen),
              const SizedBox(height: 16),
              _infoRow('Alineación Macro', widget.signal['bias4h'] == 'UP' ? 'ALCISTA' : (widget.signal['bias4h'] == 'DOWN' ? 'BAJISTA' : 'NEUTRAL'), valueColor: widget.signal['bias4h'] == 'UP' ? AppColors.winGreen : (widget.signal['bias4h'] == 'DOWN' ? AppColors.lossRed : AppColors.textSecondary)),
              const SizedBox(height: 16),
              _infoRow('Funding Rate', widget.signal['fundingRate'] ?? 'N/A'),
              const SizedBox(height: 16),
              _infoRow('Open Interest', widget.signal['openInterest'] ?? 'N/A'),
              const Divider(color: AppColors.border, height: 32),
              _infoRow('Stop Loss', "\$${widget.signal['stopLoss'] ?? '0.00'}", valueColor: AppColors.lossRed),
              const SizedBox(height: 16),
              _infoRow('Take Profit', "\$${widget.signal['takeProfit'] ?? '0.00'}", valueColor: AppColors.winGreen),
              if (widget.signal['executedEntryPrice'] != null || widget.signal['entry'] != null) ...[
                const SizedBox(height: 16),
                _infoRow('Punto de Entrada', "\$${widget.signal['executedEntryPrice'] ?? widget.signal['entry']}", valueColor: Colors.blue),
              ],
              const Divider(color: AppColors.border, height: 32),
              const Text('RAZÓN / DETALLES DE LA SEÑAL', style: TextStyle(color: AppColors.textSecondary, fontSize: 10, letterSpacing: 1)),
              const SizedBox(height: 8),
              Text(widget.signal['reason'] ?? 'Operación algorítmica detectada bajo parámetros institucionales (Tendencia de BTC: ${widget.signal['btcRegime'] ?? 'N/A'}).', style: const TextStyle(color: AppColors.textSecondary, height: 1.5)),
            ],
          ),
        ),
        const SizedBox(height: 24),
        Builder(builder: (context) {
          final status = _getSignalStatus();
          final statusColor = _getStatusColor(status);
          final isPending = status == 'PENDIENTE DE DECISIÓN';
          
          return Column(
            children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: statusColor),
                ),
                child: Center(
                  child: Text(
                    'ESTADO: $status',
                    style: AppTheme.monoStyle.copyWith(color: statusColor, fontWeight: FontWeight.bold),
                  ),
                ),
              ),
              if (isPending) ...[
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: OutlinedButton(
                    onPressed: () {
              final reasonController = TextEditingController();
              showDialog(
                context: context,
                builder: (dialogContext) => AlertDialog(
                  backgroundColor: AppColors.surface,
                  title: const Text('Descartar Trade', style: TextStyle(color: AppColors.textPrimary)),
                  content: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('¿Por qué estás descartando esta señal? (Opcional)', style: TextStyle(color: AppColors.textSecondary, fontSize: 14)),
                      const SizedBox(height: 16),
                      TextField(
                        controller: reasonController,
                        style: const TextStyle(color: AppColors.textPrimary),
                        maxLines: 3,
                        decoration: InputDecoration(
                          hintText: 'Ej: No me gusta la vela, mucha volatilidad, etc.',
                          hintStyle: const TextStyle(color: AppColors.textSecondary),
                          filled: true,
                          fillColor: AppColors.background,
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
                        ),
                      ),
                    ],
                  ),
                  actions: [
                    TextButton(
                      onPressed: () async {
                        Navigator.pop(dialogContext);
                        _executeDiscard(context, '');
                      },
                      child: const Text('Omitir', style: TextStyle(color: AppColors.textSecondary)),
                    ),
                    ElevatedButton(
                      onPressed: () async {
                        Navigator.pop(dialogContext);
                        _executeDiscard(context, reasonController.text);
                      },
                      style: ElevatedButton.styleFrom(backgroundColor: AppColors.lossRed),
                      child: const Text('Descartar', style: TextStyle(color: Colors.white)),
                    ),
                  ],
                ),
              );
            },
            style: OutlinedButton.styleFrom(side: const BorderSide(color: AppColors.border), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
            child: const Text('Descartar Señal', style: TextStyle(color: AppColors.textSecondary, fontSize: 16)),
          ),
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          height: 56,
          child: ElevatedButton.icon(
            onPressed: () async {
              try {
                final res = await ApiClient.post('/api/signals/${widget.signal['id']}/execute');
                if (res.statusCode == 200) {
                  final data = jsonDecode(res.body);
                  if (data['status'] == 'success') {
                     AppToast.showSuccess(context, '¡Trade ejecutado en Binance!');
                  } else {
                     AppToast.showError(context, 'Rechazado: ${data['message']}');
                  }
                  if (context.canPop()) { context.pop(); } else { context.go('/dashboard'); }
                } else {
                  AppToast.showError(context, 'Error al ejecutar');
                }
              } catch (e) {
                AppToast.showError(context, 'Error de conexión');
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.winGreen, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
            icon: const Icon(Icons.flash_on, color: Colors.black),
            label: const Text('Operar Ahora', style: TextStyle(color: Colors.black, fontSize: 16, fontWeight: FontWeight.bold)),
          ),
        ),
              ]
            ],
          );
        }),
      ],
    );
  }

  Widget _infoRow(String label, String value, {Color valueColor = AppColors.textPrimary}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 14)),
        Text(value, style: AppTheme.monoStyle.copyWith(color: valueColor, fontWeight: FontWeight.bold, fontSize: 14)),
      ],
    );
  }

  Future<void> _executeDiscard(BuildContext context, String reason) async {
    try {
      final res = await ApiClient.post('/api/signals/${widget.signal['id']}/discard', body: {'reason': reason});
      if (res.statusCode == 200) {
        AppToast.showInfo(context, 'Trade descartado');
        if (context.canPop()) { context.pop(); } else { context.go('/dashboard'); }
      } else {
        AppToast.showError(context, 'Error al descartar');
      }
    } catch (e) {
      AppToast.showError(context, 'Error de conexión');
    }
  }
}






