import 'dart:convert';
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/ds_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_radius.dart';
import '../../core/utils/price_formatter.dart';
import '../../widgets/segmented_control.dart';
import 'signal_chart_math.dart';

enum _ChartTab { m15, h4, d1, btc1d }

extension on _ChartTab {
  String get label => switch (this) {
        _ChartTab.m15 => '15m',
        _ChartTab.h4 => '4h',
        _ChartTab.d1 => '1d',
        _ChartTab.btc1d => 'BTC 1d',
      };
  String get interval => this == _ChartTab.btc1d ? '1d' : label;
  bool get isBtc => this == _ChartTab.btc1d;
}

class _Candle {
  final double open, high, low, close;
  const _Candle({required this.open, required this.high, required this.low, required this.close});
}

/// Gráfico de la señal (sección 4.5 del documento de diseño), compartido
/// entre mobile y desktop: pestañas 15m/4h/1d/BTC 1d que piden sus velas
/// recién cuando se abren (se cachean por pestaña, no se vuelven a pedir),
/// con las líneas de stop/entrada/objetivo superpuestas sobre las velas del
/// símbolo operado (no sobre BTC 1d, que es otra escala de precio).
///
/// Usa `fl_chart` (`CandlestickChart`), no `k_chart`: a diferencia de
/// `k_chart`, expone `minY`/`maxY` explícitos (así el rango vertical
/// siempre puede incluir el stop y el objetivo) y no tiene pan/zoom propio
/// que pueda desincronizar la superposición de líneas.
class SignalChartView extends StatefulWidget {
  final String symbol;
  final double entry;
  final double stop;
  final double target;

  /// Se llama con el cierre de la última vela de 15m del símbolo operado
  /// apenas se carga esa pestaña (la inicial) — así la pantalla que envuelve
  /// el gráfico no tiene que pedir esas mismas velas por su cuenta solo
  /// para saber el "último precio".
  final ValueChanged<double>? onPriceLoaded;

  const SignalChartView({
    super.key,
    required this.symbol,
    required this.entry,
    required this.stop,
    required this.target,
    this.onPriceLoaded,
  });

  @override
  State<SignalChartView> createState() => _SignalChartViewState();
}

class _SignalChartViewState extends State<SignalChartView> {
  _ChartTab _tab = _ChartTab.m15;
  final Map<_ChartTab, List<_Candle>> _cache = {};
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadTab(_tab);
  }

  String get _cleanSymbol => widget.symbol.split(':').first.replaceAll('/', '');

  Future<void> _loadTab(_ChartTab tab) async {
    if (_cache.containsKey(tab)) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final symbol = tab.isBtc ? 'BTCUSDT' : _cleanSymbol;
      final res = await ApiClient.get('/api/market/klines?symbol=$symbol&interval=${tab.interval}&limit=100');
      if (res.statusCode == 200) {
        final list = (jsonDecode(res.body) as List)
            .map((e) => _Candle(
                  open: double.parse(e[1].toString()),
                  high: double.parse(e[2].toString()),
                  low: double.parse(e[3].toString()),
                  close: double.parse(e[4].toString()),
                ))
            .toList();
        if (!mounted) return;
        setState(() => _cache[tab] = list);
        if (tab == _ChartTab.m15 && list.isNotEmpty) {
          widget.onPriceLoaded?.call(list.last.close);
        }
      } else {
        if (!mounted) return;
        setState(() => _error = 'No se pudieron cargar las velas.');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'No se pudieron cargar las velas.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _onTabSelected(int index) {
    final tab = _ChartTab.values[index];
    setState(() => _tab = tab);
    _loadTab(tab);
  }

  @override
  Widget build(BuildContext context) {
    final candles = _cache[_tab];
    final showLevels = !_tab.isBtc;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            SegmentedControl(
              options: _ChartTab.values.map((t) => t.label).toList(),
              selectedIndex: _tab.index,
              onChanged: _onTabSelected,
            ),
            if (showLevels)
              Row(
                children: [
                  _legendItem('Objetivo', DsColors.positive),
                  const SizedBox(width: AppSpacing.md),
                  _legendItem('Entrada', DsColors.textSecondary),
                  const SizedBox(width: AppSpacing.md),
                  _legendItem('Stop', DsColors.negative),
                ],
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        SizedBox(
          height: 360,
          width: double.infinity,
          child: _buildBody(candles, showLevels),
        ),
      ],
    );
  }

  Widget _legendItem(String label, Color color) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(width: 14, height: 2, color: color),
        const SizedBox(width: AppSpacing.xs + 2),
        Text(label, style: AppTextStyles.caption.copyWith(color: DsColors.textSecondary)),
      ],
    );
  }

  Widget _buildBody(List<_Candle>? candles, bool showLevels) {
    if (_loading && candles == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (candles == null || candles.isEmpty) {
      return Center(child: Text(_error ?? 'Sin velas disponibles.', style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary)));
    }

    final lows = candles.map((c) => c.low);
    final highs = candles.map((c) => c.high);
    final range = showLevels
        ? computeChartYRange(lows: lows, highs: highs, stop: widget.stop, target: widget.target)
        : ChartYRange(minY: lows.reduce((a, b) => a < b ? a : b), maxY: highs.reduce((a, b) => a > b ? a : b));

    return Container(
      decoration: BoxDecoration(color: DsColors.surfaceSunken, borderRadius: BorderRadius.circular(AppRadius.md)),
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: LayoutBuilder(
        builder: (context, constraints) {
          return Stack(
            children: [
              CandlestickChart(
                CandlestickChartData(
                  candlestickSpots: [
                    for (var i = 0; i < candles.length; i++)
                      CandlestickSpot(x: i.toDouble(), open: candles[i].open, high: candles[i].high, low: candles[i].low, close: candles[i].close),
                  ],
                  minX: -1,
                  maxX: candles.length.toDouble(),
                  minY: range.minY,
                  maxY: range.maxY,
                  gridData: const FlGridData(show: false),
                  titlesData: const FlTitlesData(show: false),
                  borderData: FlBorderData(show: false),
                  candlestickPainter: DefaultCandlestickPainter(
                    candlestickStyleProvider: (spot, i) {
                      final color = spot.isUp ? DsColors.positive : DsColors.negativeCandle;
                      return CandlestickStyle(
                        lineColor: color,
                        lineWidth: 1,
                        bodyStrokeColor: color,
                        bodyStrokeWidth: 0,
                        bodyFillColor: color,
                        bodyWidth: 6,
                        bodyRadius: 1,
                      );
                    },
                  ),
                ),
                transformationConfig: const FlTransformationConfig(scaleEnabled: false, panEnabled: false),
              ),
              if (showLevels) ...[
                _levelLine(price: widget.target, color: DsColors.positive, label: 'TP', range: range, height: constraints.maxHeight),
                _levelLine(price: widget.entry, color: DsColors.textSecondary, label: 'Señal', range: range, height: constraints.maxHeight),
                _levelLine(price: widget.stop, color: DsColors.negative, label: 'SL', range: range, height: constraints.maxHeight),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _levelLine({required double price, required Color color, required String label, required ChartYRange range, required double height}) {
    final y = priceToChartY(price, minY: range.minY, maxY: range.maxY, height: height);
    return Positioned(
      left: 0,
      right: 0,
      top: y,
      child: IgnorePointer(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(height: 1, color: color.withValues(alpha: 0.7)),
            Align(
              alignment: Alignment.centerRight,
              child: Container(
                margin: const EdgeInsets.only(top: 2, right: 4),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(4)),
                child: Text('$label ${fmtPrice(price)}', style: AppTextStyles.micro.copyWith(color: DsColors.background, fontWeight: FontWeight.w600)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
