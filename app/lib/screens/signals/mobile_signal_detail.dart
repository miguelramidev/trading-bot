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

class MobileSignalDetail extends StatefulWidget {
  final Map<String, dynamic> signal;

  const MobileSignalDetail({super.key, required this.signal});

  @override
  State<MobileSignalDetail> createState() => _MobileSignalDetailState();
}

class _MobileSignalDetailState extends State<MobileSignalDetail> {
  List<KLineEntity> candles = [];
  List<KLineEntity> macro4hCandles = [];
  List<KLineEntity> macro1dCandles = [];
  List<KLineEntity> btc1dCandles = [];
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
        backgroundColor: AppColors.background,
        elevation: 0,
        title: Text('Aprobación L2', style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary, fontSize: 14)),
        centerTitle: true,
        leading: IconButton(icon: const Icon(Icons.arrow_back, color: AppColors.textSecondary), onPressed: () { if (context.canPop()) context.pop(); else context.go('/dashboard'); }),
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
                      onPressed: _isExecuting ? null : () {
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
                      style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16), side: const BorderSide(color: AppColors.border), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                      icon: _isExecuting 
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: AppColors.textSecondary, strokeWidth: 2))
                        : const Icon(Icons.close, color: AppColors.textSecondary, size: 18),
                      label: const Text('Descartar', style: TextStyle(color: AppColors.textSecondary, fontSize: 16)),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _isExecuting ? null : () => _executeTrade(context),
                      style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16), backgroundColor: AppColors.winGreen, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                      icon: _isExecuting 
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.black, strokeWidth: 2))
                        : const Icon(Icons.flash_on, color: Colors.black, size: 18),
                      label: Text(_isExecuting ? '...' : 'Operar', style: const TextStyle(color: Colors.black, fontSize: 16, fontWeight: FontWeight.bold)),
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
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Resumen Cuantitativo', style: TextStyle(color: AppColors.textPrimary, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),
          _infoRow('Estrategia', widget.signal['strategy'] ?? widget.signal['regime'] ?? 'Motor Cuántico'),
          const SizedBox(height: 16),
          _infoRow('Correlación BTC', widget.signal['btcCorrelation'] ?? 'N/A'),
          const SizedBox(height: 16),
          _infoRow('Alineación Macro', widget.signal['bias4h'] == 'UP' ? 'ALCISTA' : (widget.signal['bias4h'] == 'DOWN' ? 'BAJISTA' : 'NEUTRAL')),
          const SizedBox(height: 16),
          _infoRow('Funding Rate', widget.signal['fundingRate'] ?? 'N/A'),
          const SizedBox(height: 16),
          _infoRow('Open Interest', widget.signal['openInterest'] ?? 'N/A'),
          const Divider(color: AppColors.border, height: 24),
          Row(
            children: [
              Expanded(child: _infoBlock('Stop Loss', '\$${widget.signal['stopLoss'] ?? '0.00'}', AppColors.lossRed)),
              Container(width: 1, height: 40, color: AppColors.border),
              Expanded(child: _infoBlock('Take Profit', '\$${widget.signal['takeProfit'] ?? '0.00'}', AppColors.winGreen, alignRight: true)),
            ],
          ),
          if (widget.signal['executedEntryPrice'] != null || widget.signal['entry'] != null) ...[
            const Divider(color: AppColors.border, height: 24),
            _infoRow('Punto de Entrada', '\$${widget.signal['executedEntryPrice'] ?? widget.signal['entry']}'),
          ],
          const Divider(color: AppColors.border, height: 24),
          const Text('RAZÓN / DETALLES DE LA SEÑAL', style: TextStyle(color: AppColors.textSecondary, fontSize: 10, letterSpacing: 1)),
          const SizedBox(height: 8),
          Text(widget.signal['reason'] ?? 'Operación algorítmica detectada bajo parámetros institucionales (Tendencia de BTC: ${widget.signal['btcRegime'] ?? 'N/A'}).', style: const TextStyle(color: AppColors.textSecondary, height: 1.5, fontSize: 12)),
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

  bool _isExecuting = false;

  Future<void> _executeTrade(BuildContext context) async {
    if (_isExecuting) return;
    setState(() => _isExecuting = true);
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
    } finally {
      if (mounted) setState(() => _isExecuting = false);
    }
  }

  Future<void> _executeDiscard(BuildContext context, String reason) async {
    if (_isExecuting) return;
    setState(() => _isExecuting = true);
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
    } finally {
      if (mounted) setState(() => _isExecuting = false);
    }
  }
}






