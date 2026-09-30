import 'package:flutter/material.dart';
import '../core/theme/ds_colors.dart';
import '../core/theme/app_text_styles.dart';
import '../core/theme/app_spacing.dart';
import '../widgets/widgets.dart';

/// Catálogo del sistema de diseño: muestra cada componente de `lib/widgets/`
/// con datos de ejemplo en sus variantes. Solo existe en modo debug — ver
/// el registro condicional de su ruta en `main.dart` (`if (kDebugMode)`).
/// No es una pantalla de producto, así que no sigue el patrón mobile/desktop
/// del resto de la app.
class ComponentCatalogScreen extends StatefulWidget {
  const ComponentCatalogScreen({super.key});

  @override
  State<ComponentCatalogScreen> createState() => _ComponentCatalogScreenState();
}

class _ComponentCatalogScreenState extends State<ComponentCatalogScreen> {
  bool _switchValue = true;
  int _segmentIndex = 0;
  int _filterIndex = 0;
  final _fieldController = TextEditingController(text: '10');

  @override
  void dispose() {
    _fieldController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DsColors.background,
      appBar: AppBar(
        backgroundColor: DsColors.background,
        title: const Text('Catálogo de componentes (solo debug)'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.xl),
        children: [
          _section('StatusPill — las 9 variantes', Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: StatusPillVariant.values.map((v) => StatusPill(v)).toList(),
          )),
          _section('StatusPill — texto compuesto', const StatusPill(StatusPillVariant.pendiente, label: 'Pendiente · vence en 57 min')),
          _section('DirectionTag', const Row(children: [DirectionTag(isLong: true), SizedBox(width: AppSpacing.sm), DirectionTag(isLong: false)])),
          _section('SectionHeader', SectionHeader(title: 'Posiciones abiertas', count: '1', linkLabel: 'Ver historial', onLinkTap: () {})),
          _section('MetricBlock', const Row(
            children: [
              MetricBlock(label: 'Balance total', value: '\$1,204.50', secondaryLine: '+\$40.12 hoy', sign: MetricSign.positive),
              SizedBox(width: AppSpacing.xxl),
              MetricBlock(label: 'PnL no realizado', value: '−\$12.30', sign: MetricSign.negative),
            ],
          )),
          _section('SlTpRangeBar — LONG', const SlTpRangeBar(stop: 90, entry: 95, target: 110, price: 100)),
          _section('SlTpRangeBar — SHORT', const SlTpRangeBar(stop: 105, entry: 100, target: 90, price: 97, isShort: true)),
          _section('SignalCard — informativo (avance < 30%)', const SignalCard(
            symbol: 'ENA',
            isLong: true,
            strategy: 'Tendencial',
            expiresLabel: 'vence en 57 min',
            entry: 100,
            stop: 95,
            target: 110,
            currentPrice: 102,
            btcContext: 'BTC en rango · tendencia 4h alcista',
          )),
          _section('SignalCard — advertencia (avance ≥ 30%)', const SignalCard(
            symbol: 'ZEC',
            isLong: true,
            strategy: 'Macro Breakout',
            expiresLabel: 'vence en 38 min',
            expiresSoon: true,
            entry: 100,
            stop: 95,
            target: 110,
            currentPrice: 105,
            btcContext: 'BTC en rango',
          )),
          _section('SignalCard — sin margen (canTrade false)', const SignalCard(
            symbol: 'SOL',
            isLong: false,
            strategy: 'Caza de liquidez',
            expiresLabel: 'vence en 12 min',
            entry: 180,
            stop: 186,
            target: 168,
            btcContext: 'BTC breakout macro',
            canTrade: false,
            cannotTradeReason: 'Sin margen disponible',
          )),
          _section('PositionCard', PositionCard(
            symbol: 'BTC',
            isLong: true,
            strategy: 'Tendencial',
            leverage: 10,
            marginMode: 'Aislado',
            entry: 62000,
            lastPrice: 63500,
            stop: 60500,
            target: 66000,
            pnlUsd: 40.12,
            pnlPct: 2.3,
            onTap: () {},
          )),
          _section('OutcomeBlock', const Row(
            children: [
              Expanded(child: OutcomeBlock(label: 'Si toca el stop', amountUsd: -32.5, price: 60500, distancePct: -2.4, isPositive: false)),
              SizedBox(width: AppSpacing.md),
              Expanded(child: OutcomeBlock(label: 'Si toca el objetivo', amountUsd: 80, price: 66000, distancePct: 6.5, isPositive: true)),
            ],
          )),
          _section('Callout — info', const Callout(message: 'Desde la señal: +2.00%, un 20% del camino al objetivo.')),
          _section('Callout — warning', const Callout(
            variant: CalloutVariant.warning,
            icon: Icons.warning_amber_rounded,
            message: 'El precio ya recorrió el 50% hacia el objetivo. Si entrás ahora, la relación queda en 1 : 0.5.',
          )),
          _section('Botones', Row(
            children: [
              Expanded(child: PrimaryButton(label: 'Revisar y operar', onPressed: () {})),
              const SizedBox(width: AppSpacing.md),
              Expanded(child: SecondaryButton(label: 'Descartar', onPressed: () {})),
            ],
          )),
          _section('PrimaryButton — deshabilitado con motivo', const PrimaryButton(label: 'Revisar y operar', onPressed: null, disabledReason: 'Sin margen disponible')),
          _section('DangerButton', DangerButton(label: 'Cerrar posición a mercado', onPressed: () {})),
          _section('AppCard', const AppCard(child: Text('Contenido dentro de un AppCard', style: TextStyle(color: DsColors.textPrimary)))),
          _section('SegmentedControl', SegmentedControl(
            options: const ['15m', '4h', '1d', 'BTC 1d'],
            selectedIndex: _segmentIndex,
            onChanged: (i) => setState(() => _segmentIndex = i),
          )),
          _section('AppFilterChip', Wrap(
            spacing: AppSpacing.sm,
            children: ['Todos', 'Tomadas', 'Descartadas'].asMap().entries.map((e) {
              return AppFilterChip(label: e.value, selected: _filterIndex == e.key, onTap: () => setState(() => _filterIndex = e.key));
            }).toList(),
          )),
          _section('AppSwitch', AppSwitch(value: _switchValue, onChanged: (v) => setState(() => _switchValue = v))),
          _section('LabeledField', LabeledField(label: 'Apalancamiento', controller: _fieldController, suffix: 'x')),
          _section('DataTimestamp — fresco / atenuado', Row(
            children: [
              DataTimestamp(dataTime: DateTime.now()),
              const SizedBox(width: AppSpacing.xxl),
              DataTimestamp(dataTime: DateTime.now().subtract(const Duration(minutes: 5))),
            ],
          )),
          _section('EmptyState', EmptyState(message: 'Todavía no hay señales.', actionLabel: 'Actualizar', onAction: () {})),
          _section('ErrorState', ErrorState(message: 'No se pudo cargar el trade.', actionLabel: 'Reintentar', onAction: () {})),
        ],
      ),
    );
  }

  Widget _section(String title, Widget child) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xxxl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: AppTextStyles.captionStrong.copyWith(color: DsColors.textSecondary)),
          const SizedBox(height: AppSpacing.md),
          child,
        ],
      ),
    );
  }
}
