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

  /// Duración de una vela de esta pestaña, en ms — para ubicar la vela de la
  /// señal y para darle margen a `endTime` al pedir las velas.
  int get intervalMs => switch (this) {
        _ChartTab.m15 => 15 * 60 * 1000,
        _ChartTab.h4 => 4 * 60 * 60 * 1000,
        _ChartTab.d1 => 24 * 60 * 60 * 1000,
        _ChartTab.btc1d => 24 * 60 * 60 * 1000,
      };
}

class _Candle {
  final int time;
  final double open, high, low, close, volume;
  const _Candle({required this.time, required this.open, required this.high, required this.low, required this.close, required this.volume});
}

/// EMA200 + MACD(12,26,9) + ADX(14) del símbolo operado (pestaña 15m), o
/// EMA20/50/200 de BTC en 1D (pestaña BTC 1d, solo para señales de Macro
/// Breakout) — lo que `GET /api/market/klines?indicators=...` devuelva.
class _Indicators {
  final List<double>? ema200;
  final List<double>? ema50;
  final List<double>? ema20;
  final List<double>? macdHistogram;
  final List<double>? macdLine;
  final List<double>? macdSignal;
  final List<double>? adx;

  const _Indicators({this.ema200, this.ema50, this.ema20, this.macdHistogram, this.macdLine, this.macdSignal, this.adx});

  bool get isEmpty => ema200 == null && ema50 == null && ema20 == null && macdHistogram == null && adx == null;
}

class _TabData {
  final List<_Candle> candles;
  final _Indicators indicators;
  const _TabData({required this.candles, required this.indicators});
}

/// Gráfico de la señal (sección 4.5 del documento de diseño), compartido
/// entre mobile y desktop: pestañas 15m/4h/1d/BTC 1d que piden sus velas
/// recién cuando se abren (se cachean por pestaña, no se vuelven a pedir).
///
/// Sobre la pestaña 15m del símbolo operado se superponen los indicadores
/// que de verdad usa la estrategia activa (EMA200, MACD(12,26,9), ADX(14)
/// con el umbral de 25) — no EMA21/Bollinger/RSI, que se calculan pero no
/// condicionan la entrada (ver CONTEXT.md). Para una señal de Macro
/// Breakout, la pestaña BTC 1d muestra en cambio las EMAs de BTC que esa
/// estrategia usa para alinear el régimen macro.
///
/// Usa `fl_chart` (`CandlestickChart`), no `k_chart`: expone `minY`/`maxY`
/// explícitos (el rango vertical siempre puede incluir el stop/objetivo/
/// EMA200) y no tiene pan/zoom propio que pueda desincronizar las
/// superposiciones.
class SignalChartView extends StatefulWidget {
  final String symbol;
  final double entry;
  final double stop;
  final double target;
  final String strategy;
  final DateTime? evaluatedAt;

  /// ADX guardado al generar la señal (`triggerAdx`): se usa para verificar
  /// que la vela candidata a marcar en el gráfico (calculada a partir de
  /// `evaluatedAt`) sea de verdad la que disparó la señal, en vez de
  /// confiar ciegamente en la fórmula (ver `findSignalCandleIndex`).
  final double? triggerAdx;

  const SignalChartView({
    super.key,
    required this.symbol,
    required this.entry,
    required this.stop,
    required this.target,
    required this.strategy,
    this.evaluatedAt,
    this.triggerAdx,
  });

  @override
  State<SignalChartView> createState() => _SignalChartViewState();
}

class _SignalChartViewState extends State<SignalChartView> {
  _ChartTab _tab = _ChartTab.m15;
  final Map<_ChartTab, _TabData> _cache = {};
  bool _loading = false;
  String? _error;

  /// Columna reservada a la derecha para el eje de precios (estilo
  /// TradingView): las velas terminan antes de ahí, y las etiquetas de
  /// SL/entrada/TP viven en esa columna, sin cortarse contra el borde. El
  /// ancho se adapta al precio más largo que de verdad se va a mostrar — un
  /// ancho fijo partía en dos renglones las etiquetas de pares de precio muy
  /// bajo (ej. "0.00001234").
  static const double _minPriceAxisWidth = 48;
  static const double _maxPriceAxisWidth = 120;

  double get _priceAxisWidth {
    if (_tab.isBtc) return _minPriceAxisWidth; // BTC 1d no muestra niveles de precio.
    return _computeAxisWidthForLabels([fmtPrice(widget.target), fmtPrice(widget.entry), fmtPrice(widget.stop)]);
  }

  /// Mismo estilo/padding que el badge de `_levelLabel`: el ancho tiene que
  /// alcanzarle al texto REAL que ese badge va a dibujar, no a una
  /// aproximación.
  double _computeAxisWidthForLabels(List<String> labels) {
    double maxTextWidth = 0;
    for (final label in labels) {
      final painter = TextPainter(
        text: TextSpan(text: label, style: AppTextStyles.micro.copyWith(fontWeight: FontWeight.w600)),
        textDirection: TextDirection.ltr,
      )..layout();
      if (painter.width > maxTextWidth) maxTextWidth = painter.width;
    }
    const horizontalBadgePadding = 6.0 * 2; // Container padding del badge (_levelLabel)
    const leftMargin = 4.0; // margin left del badge dentro de la columna
    const breathingRoom = 8.0; // que no quede pegado al borde derecho
    final computed = maxTextWidth + horizontalBadgePadding + leftMargin + breathingRoom;
    return computed.clamp(_minPriceAxisWidth, _maxPriceAxisWidth);
  }

  double _chartWidth(double totalWidth) => (totalWidth - _priceAxisWidth).clamp(0.0, totalWidth);

  /// Reserva la misma columna del eje (vacía, sin etiquetas) en los paneles
  /// que no tienen niveles de precio propios (MACD/ADX/volumen), para que
  /// sus velas/barras terminen exactamente donde terminan las del panel de
  /// precio — alineación vertical entre todos los paneles, estilo TradingView.
  Widget _withAxisGutter(double totalWidth, double height, Widget Function(double chartWidth) builder) {
    final chartWidth = _chartWidth(totalWidth);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(width: chartWidth, height: height, child: builder(chartWidth)),
        SizedBox(width: _priceAxisWidth, height: height),
      ],
    );
  }

  bool get _isMacroBreakout => widget.strategy.toLowerCase().contains('macro') || widget.strategy == '3';

  @override
  void initState() {
    super.initState();
    _loadTab(_tab);
  }

  String get _cleanSymbol => widget.symbol.split(':').first.replaceAll('/', '');

  /// Solo la pestaña 15m del símbolo operado trae los indicadores reales de
  /// la estrategia; BTC 1d los trae solo para Macro Breakout; el resto es
  /// velas y volumen nomás.
  List<String> _indicatorKeysFor(_ChartTab tab) {
    if (tab == _ChartTab.m15) return const ['ema200', 'macd', 'adx'];
    if (tab == _ChartTab.btc1d && _isMacroBreakout) return const ['ema20', 'ema50', 'ema200'];
    return const [];
  }

  Future<void> _loadTab(_ChartTab tab) async {
    if (_cache.containsKey(tab)) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final symbol = tab.isBtc ? 'BTCUSDT' : _cleanSymbol;
      final indicatorKeys = _indicatorKeysFor(tab);
      final query = <String, String>{
        'symbol': symbol,
        'interval': tab.interval,
        'limit': '100',
        if (indicatorKeys.isNotEmpty) 'indicators': indicatorKeys.join(','),
        if (widget.evaluatedAt != null)
          'endTime': '${widget.evaluatedAt!.millisecondsSinceEpoch + tab.intervalMs * 2}',
      };
      final queryString = query.entries.map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}').join('&');
      final res = await ApiClient.get('/api/market/klines?$queryString');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final tabData = _parseTabData(data);
        if (!mounted) return;
        setState(() => _cache[tab] = tabData);
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

  /// Sin `indicators`, la respuesta es un array crudo (lista); con
  /// `indicators`, es `{candles, indicators}`. Mismo endpoint, dos formas.
  _TabData _parseTabData(dynamic data) {
    final rawCandles = data is List ? data : (data['candles'] as List);
    final candles = rawCandles
        .map((e) => _Candle(
              time: int.parse(e[0].toString()),
              open: double.parse(e[1].toString()),
              high: double.parse(e[2].toString()),
              low: double.parse(e[3].toString()),
              close: double.parse(e[4].toString()),
              volume: double.parse(e[5].toString()),
            ))
        .toList();

    if (data is! Map || data['indicators'] == null) {
      return _TabData(candles: candles, indicators: const _Indicators());
    }
    final ind = data['indicators'] as Map<String, dynamic>;
    List<double>? asList(dynamic v) => (v as List?)?.map((x) => (x as num).toDouble()).toList();
    final macd = ind['macd'] as Map<String, dynamic>?;
    final adx = ind['adx'] as Map<String, dynamic>?;
    return _TabData(
      candles: candles,
      indicators: _Indicators(
        ema200: asList(ind['ema200']),
        ema50: asList(ind['ema50']),
        ema20: asList(ind['ema20']),
        macdHistogram: asList(macd?['histogram']),
        macdLine: asList(macd?['macdLine']),
        macdSignal: asList(macd?['signalLine']),
        adx: asList(adx?['adx']),
      ),
    );
  }

  void _onTabSelected(int index) {
    final tab = _ChartTab.values[index];
    setState(() => _tab = tab);
    _loadTab(tab);
  }

  @override
  Widget build(BuildContext context) {
    final data = _cache[_tab];
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
            Flexible(child: _buildLegend(data, showLevels)),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        _buildBody(data, showLevels),
      ],
    );
  }

  Widget _buildLegend(_TabData? data, bool showLevels) {
    final items = <Widget>[];
    if (showLevels) {
      items.addAll([
        _legendItem('Objetivo', DsColors.positive),
        _legendItem('Entrada', DsColors.textSecondary),
        _legendItem('Stop', DsColors.negative),
      ]);
    }
    if (data != null && !data.indicators.isEmpty) {
      if (data.indicators.ema200 != null) items.add(_legendItem('EMA200', DsColors.warning));
      if (data.indicators.ema50 != null) items.add(_legendItem('EMA50', DsColors.accentText));
      if (data.indicators.ema20 != null) items.add(_legendItem('EMA20', DsColors.positive));
      if (data.indicators.macdHistogram != null) items.add(_legendItem('MACD', DsColors.accentText));
      if (data.indicators.adx != null) items.add(_legendItem('ADX', DsColors.warning));
    }
    if (items.isEmpty) return const SizedBox.shrink();
    return Wrap(spacing: AppSpacing.md, runSpacing: AppSpacing.xs, alignment: WrapAlignment.end, children: items);
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

  Widget _buildBody(_TabData? data, bool showLevels) {
    if (_loading && data == null) {
      return const SizedBox(height: 360, child: Center(child: CircularProgressIndicator()));
    }
    if (data == null || data.candles.isEmpty) {
      return SizedBox(
        height: 360,
        child: Center(child: Text(_error ?? 'Sin velas disponibles.', style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary))),
      );
    }

    final candles = data.candles;
    // Paneles propios de MACD/ADX: se muestran siempre que se hayan PEDIDO
    // para esta pestaña, no solo cuando el backend devolvió datos — si no
    // hay historia suficiente, el panel lo dice en vez de desaparecer en
    // silencio (ver `_buildMacdPanel`/`_buildAdxPanel`).
    final requestedKeys = _indicatorKeysFor(_tab);
    final showMacdPanel = requestedKeys.contains('macd');
    final showAdxPanel = requestedKeys.contains('adx');

    int? signalIndex;
    if (widget.evaluatedAt != null) {
      signalIndex = findSignalCandleIndex(
        openTimesMs: candles.map((c) => c.time).toList(),
        targetMs: widget.evaluatedAt!.millisecondsSinceEpoch,
        intervalMs: _tab.intervalMs,
        // El ADX guardado (triggerAdx) corresponde a la vela de 15m que
        // disparó la señal: solo sirve para verificar en esa pestaña.
        adxValues: _tab == _ChartTab.m15 ? data.indicators.adx : null,
        expectedAdx: _tab == _ChartTab.m15 ? widget.triggerAdx : null,
      );
    }

    return Column(
      children: [
        _buildPricePanel(candles, data.indicators, showLevels, signalIndex, requestedKeys),
        const SizedBox(height: AppSpacing.sm),
        if (showMacdPanel) ...[
          _buildMacdPanel(candles, data.indicators, signalIndex),
          const SizedBox(height: AppSpacing.sm),
        ],
        if (showAdxPanel) ...[
          _buildAdxPanel(candles, data.indicators, signalIndex),
          const SizedBox(height: AppSpacing.sm),
        ],
        _buildVolumePanel(candles, signalIndex),
      ],
    );
  }

  Widget _buildPricePanel(List<_Candle> candles, _Indicators indicators, bool showLevels, int? signalIndex, List<String> requestedKeys) {
    final lows = candles.map((c) => c.low);
    final highs = candles.map((c) => c.high);
    var range = showLevels
        ? computeChartYRange(lows: lows, highs: highs, stop: widget.stop, target: widget.target)
        : ChartYRange(minY: lows.reduce((a, b) => a < b ? a : b), maxY: highs.reduce((a, b) => a > b ? a : b));

    // El rango también tiene que incluir las EMAs superpuestas, si las hay.
    final emaValues = [...?indicators.ema200, ...?indicators.ema50, ...?indicators.ema20].where((v) => v > 0);
    if (emaValues.isNotEmpty) {
      final minEma = emaValues.reduce((a, b) => a < b ? a : b);
      final maxEma = emaValues.reduce((a, b) => a > b ? a : b);
      range = ChartYRange(minY: range.minY < minEma ? range.minY : minEma, maxY: range.maxY > maxEma ? range.maxY : maxEma);
    }

    // Historia insuficiente para alguna EMA pedida (símbolo recién listado
    // en Binance, sin las velas que ese período necesita): el backend manda
    // `null` para esa serie puntual — se avisa en vez de omitirla en silencio.
    final missingEma = <String>[
      if (requestedKeys.contains('ema200') && indicators.ema200 == null) 'EMA200',
      if (requestedKeys.contains('ema50') && indicators.ema50 == null) 'EMA50',
      if (requestedKeys.contains('ema20') && indicators.ema20 == null) 'EMA20',
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          height: 320,
          decoration: BoxDecoration(color: DsColors.surfaceSunken, borderRadius: BorderRadius.circular(AppRadius.md)),
          padding: const EdgeInsets.all(AppSpacing.sm),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final chartWidth = _chartWidth(constraints.maxWidth);
              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: chartWidth,
                    height: constraints.maxHeight,
                    child: Stack(
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
                        if (signalIndex != null) _signalMarker(signalIndex, candles.length, chartWidth, constraints.maxHeight),
                        if (indicators.ema200 != null)
                          _priceLineOverlay(indicators.ema200!, DsColors.warning, candles.length, chartWidth, constraints.maxHeight, range),
                        if (indicators.ema50 != null)
                          _priceLineOverlay(indicators.ema50!, DsColors.accentText, candles.length, chartWidth, constraints.maxHeight, range),
                        if (indicators.ema20 != null)
                          _priceLineOverlay(indicators.ema20!, DsColors.positive, candles.length, chartWidth, constraints.maxHeight, range),
                        if (showLevels) ...[
                          _levelLineSegment(price: widget.target, color: DsColors.positive, range: range, height: constraints.maxHeight),
                          _levelLineSegment(price: widget.entry, color: DsColors.textSecondary, range: range, height: constraints.maxHeight),
                          _levelLineSegment(price: widget.stop, color: DsColors.negative, range: range, height: constraints.maxHeight),
                        ],
                      ],
                    ),
                  ),
                  SizedBox(
                    width: _priceAxisWidth,
                    height: constraints.maxHeight,
                    child: showLevels
                        ? Stack(
                            children: [
                              _levelLabel(price: widget.target, color: DsColors.positive, range: range, height: constraints.maxHeight),
                              _levelLabel(price: widget.entry, color: DsColors.textSecondary, range: range, height: constraints.maxHeight),
                              _levelLabel(price: widget.stop, color: DsColors.negative, range: range, height: constraints.maxHeight),
                            ],
                          )
                        : null,
                  ),
                ],
              );
            },
          ),
        ),
        if (missingEma.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          Text(
            'Historia insuficiente para ${missingEma.join(", ")}.',
            style: AppTextStyles.caption.copyWith(color: DsColors.textTertiary),
          ),
        ],
      ],
    );
  }

  /// Polilínea de una EMA sobre el panel de precio, con el mismo sistema de
  /// coordenadas que las líneas de stop/entrada/objetivo.
  Widget _priceLineOverlay(List<double> values, Color color, int candleCount, double width, double height, ChartYRange range) {
    return IgnorePointer(
      child: CustomPaint(
        size: Size(width, height),
        painter: _PolylinePainter(
          values: values,
          color: color,
          candleCount: candleCount,
          range: range,
        ),
      ),
    );
  }

  Widget _signalMarker(int index, int candleCount, double width, double height) {
    final x = (index + 0.5) / candleCount * width;
    return Positioned(
      left: x - 1,
      top: 0,
      bottom: 0,
      child: IgnorePointer(
        child: Container(width: 1.5, color: DsColors.accentText.withValues(alpha: 0.6)),
      ),
    );
  }

  /// Solo la línea horizontal del nivel (stop/entrada/objetivo) — va en el
  /// área de velas. La etiqueta con el precio va aparte, en la columna del
  /// eje (`_levelLabel`), para que nunca se corte contra el borde.
  Widget _levelLineSegment({required double price, required Color color, required ChartYRange range, required double height}) {
    final y = priceToChartY(price, minY: range.minY, maxY: range.maxY, height: height);
    return Positioned(
      left: 0,
      right: 0,
      top: y,
      child: IgnorePointer(child: Container(height: 1, color: color.withValues(alpha: 0.7))),
    );
  }

  /// Etiqueta de precio en la columna del eje (estilo TradingView): a la
  /// misma altura que su línea en `_levelLineSegment`, pero en su propia
  /// columna reservada — nunca compite por espacio con las velas ni se
  /// corta contra el borde derecho.
  Widget _levelLabel({required double price, required Color color, required ChartYRange range, required double height}) {
    final y = priceToChartY(price, minY: range.minY, maxY: range.maxY, height: height);
    return Positioned(
      left: 0,
      right: 0,
      top: (y - 9).clamp(0.0, height - 18),
      child: IgnorePointer(
        child: Align(
          alignment: Alignment.centerLeft,
          child: Container(
            margin: const EdgeInsets.only(left: 4),
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
            decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(4)),
            child: Text(fmtPrice(price), style: AppTextStyles.micro.copyWith(color: DsColors.background, fontWeight: FontWeight.w600)),
          ),
        ),
      ),
    );
  }

  /// Panel vacío con un aviso, en vez de un panel sin nada adentro: para
  /// cuando el indicador se pidió pero el backend mandó `null` (sin
  /// historia suficiente para ese período — ver `computeKlineIndicators`).
  Widget _insufficientHistoryPanel(String label) {
    return Container(
      height: 120,
      decoration: BoxDecoration(color: DsColors.surfaceSunken, borderRadius: BorderRadius.circular(AppRadius.md)),
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Center(
        child: Text('Historia insuficiente para $label.', style: AppTextStyles.caption.copyWith(color: DsColors.textTertiary)),
      ),
    );
  }

  /// MACD (histograma + línea + señal), panel propio con su propia escala.
  Widget _buildMacdPanel(List<_Candle> candles, _Indicators indicators, int? signalIndex) {
    if (indicators.macdHistogram == null) return _insufficientHistoryPanel('MACD');

    return Container(
      height: 120,
      decoration: BoxDecoration(color: DsColors.surfaceSunken, borderRadius: BorderRadius.circular(AppRadius.md)),
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final macdValues = [...?indicators.macdHistogram, ...?indicators.macdLine, ...?indicators.macdSignal];
          final macdRange = macdValues.isNotEmpty
              ? ChartYRange(
                  minY: macdValues.reduce((a, b) => a < b ? a : b) * 1.1,
                  maxY: macdValues.reduce((a, b) => a > b ? a : b) * 1.1,
                )
              : const ChartYRange(minY: -1, maxY: 1);

          return _withAxisGutter(constraints.maxWidth, constraints.maxHeight, (chartWidth) {
            return Stack(
              children: [
                if (indicators.macdHistogram != null) _histogramBars(indicators.macdHistogram!, macdRange, candles.length, chartWidth, constraints.maxHeight),
                if (indicators.macdLine != null)
                  _priceLineOverlay(indicators.macdLine!, DsColors.textSecondary, candles.length, chartWidth, constraints.maxHeight, macdRange),
                if (indicators.macdSignal != null)
                  _priceLineOverlay(indicators.macdSignal!, DsColors.accentText, candles.length, chartWidth, constraints.maxHeight, macdRange),
                if (signalIndex != null) _signalMarker(signalIndex, candles.length, chartWidth, constraints.maxHeight),
              ],
            );
          });
        },
      ),
    );
  }

  /// ADX con el umbral de 25 que usa la Estrategia 1/3 como filtro de
  /// régimen, panel propio con su propia escala.
  Widget _buildAdxPanel(List<_Candle> candles, _Indicators indicators, int? signalIndex) {
    final adxValues = indicators.adx;
    if (adxValues == null) return _insufficientHistoryPanel('ADX');

    final adxAtSignal = (signalIndex != null && signalIndex < adxValues.length) ? adxValues[signalIndex] : null;

    return Container(
      height: 120,
      decoration: BoxDecoration(color: DsColors.surfaceSunken, borderRadius: BorderRadius.circular(AppRadius.md)),
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (adxAtSignal != null)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.xs),
              child: Text('ADX en la señal: ${adxAtSignal.toStringAsFixed(1)}', style: AppTextStyles.caption.copyWith(color: DsColors.textSecondary)),
            ),
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final adxRange = ChartYRange(minY: 0, maxY: [...adxValues, 25].reduce((a, b) => a > b ? a : b) * 1.1);

                return _withAxisGutter(constraints.maxWidth, constraints.maxHeight, (chartWidth) {
                  return Stack(
                    children: [
                      _priceLineOverlay(adxValues, DsColors.warning, candles.length, chartWidth, constraints.maxHeight, adxRange),
                      _thresholdLine(25, adxRange, constraints.maxHeight, 'ADX 25'),
                      if (signalIndex != null) _signalMarker(signalIndex, candles.length, chartWidth, constraints.maxHeight),
                    ],
                  );
                });
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _histogramBars(List<double> values, ChartYRange range, int candleCount, double width, double height) {
    return IgnorePointer(
      child: CustomPaint(
        size: Size(width, height),
        painter: _HistogramPainter(values: values, range: range, candleCount: candleCount),
      ),
    );
  }

  Widget _thresholdLine(double value, ChartYRange range, double height, String label) {
    final y = priceToChartY(value, minY: range.minY, maxY: range.maxY, height: height);
    return Positioned(
      left: 0,
      right: 0,
      top: y,
      child: IgnorePointer(
        child: Container(height: 1, color: DsColors.warning.withValues(alpha: 0.5)),
      ),
    );
  }

  Widget _buildVolumePanel(List<_Candle> candles, int? signalIndex) {
    final maxVol = candles.map((c) => c.volume).reduce((a, b) => a > b ? a : b);
    return Container(
      height: 70,
      decoration: BoxDecoration(color: DsColors.surfaceSunken, borderRadius: BorderRadius.circular(AppRadius.md)),
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: LayoutBuilder(
        builder: (context, constraints) {
          return _withAxisGutter(constraints.maxWidth, constraints.maxHeight, (chartWidth) {
            return Stack(
              children: [
                CustomPaint(
                  size: Size(chartWidth, constraints.maxHeight),
                  painter: _VolumeBarsPainter(candles: candles, maxVolume: maxVol == 0 ? 1 : maxVol),
                ),
                if (signalIndex != null) _signalMarker(signalIndex, candles.length, chartWidth, constraints.maxHeight),
              ],
            );
          });
        },
      ),
    );
  }
}

class _PolylinePainter extends CustomPainter {
  final List<double> values;
  final Color color;
  final int candleCount;
  final ChartYRange range;

  _PolylinePainter({required this.values, required this.color, required this.candleCount, required this.range});

  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty || candleCount == 0) return;
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.5
      ..style = PaintingStyle.stroke;
    final path = Path();
    for (var i = 0; i < values.length; i++) {
      if (values[i] == 0 && i < values.length - 1 && values[i + 1] == 0) continue; // placeholders de calentamiento, si quedara alguno
      final x = (i + 0.5) / candleCount * size.width;
      final y = priceToChartY(values[i], minY: range.minY, maxY: range.maxY, height: size.height);
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _PolylinePainter oldDelegate) =>
      oldDelegate.values != values || oldDelegate.color != color || oldDelegate.range.minY != range.minY || oldDelegate.range.maxY != range.maxY;
}

class _HistogramPainter extends CustomPainter {
  final List<double> values;
  final ChartYRange range;
  final int candleCount;

  _HistogramPainter({required this.values, required this.range, required this.candleCount});

  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty || candleCount == 0) return;
    final zeroY = priceToChartY(0, minY: range.minY, maxY: range.maxY, height: size.height);
    final barWidth = (size.width / candleCount) * 0.6;
    for (var i = 0; i < values.length; i++) {
      final x = (i + 0.5) / candleCount * size.width;
      final y = priceToChartY(values[i], minY: range.minY, maxY: range.maxY, height: size.height);
      final paint = Paint()..color = values[i] >= 0 ? DsColors.positive.withValues(alpha: 0.7) : DsColors.negative.withValues(alpha: 0.7);
      canvas.drawRect(Rect.fromLTRB(x - barWidth / 2, y < zeroY ? y : zeroY, x + barWidth / 2, y < zeroY ? zeroY : y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant _HistogramPainter oldDelegate) => oldDelegate.values != values;
}

class _VolumeBarsPainter extends CustomPainter {
  final List<_Candle> candles;
  final double maxVolume;

  _VolumeBarsPainter({required this.candles, required this.maxVolume});

  @override
  void paint(Canvas canvas, Size size) {
    if (candles.isEmpty) return;
    final barWidth = (size.width / candles.length) * 0.6;
    final paint = Paint()..color = DsColors.textTertiary.withValues(alpha: 0.6);
    for (var i = 0; i < candles.length; i++) {
      final x = (i + 0.5) / candles.length * size.width;
      final barHeight = (candles[i].volume / maxVolume) * size.height;
      canvas.drawRect(Rect.fromLTRB(x - barWidth / 2, size.height - barHeight, x + barWidth / 2, size.height), paint);
    }
  }

  @override
  bool shouldRepaint(covariant _VolumeBarsPainter oldDelegate) => oldDelegate.candles != candles;
}
