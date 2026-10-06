import 'package:flutter/material.dart';
import '../../core/theme/ds_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/utils/datetime_formatter.dart';
import '../../core/utils/price_formatter.dart';
import '../../core/utils/symbol_formatter.dart';
import '../../widgets/widgets.dart';
import 'market_controller.dart';

// Secciones del tablero de posicionamiento, compartidas por las variantes
// mobile/desktop. Los textos explican qué es cada número: es una
// herramienta para decidir, no una señal de ejecución.

const _strategyNames = {
  'POS_ls_h18': 'Posicionamiento saturado (72 h)',
  'CARRY_t15_top30': 'Carry de funding',
};

String _pct(num? v, {int decimals = 2}) {
  if (v == null) return '—';
  final x = v * 100;
  return '${x >= 0 ? '+' : ''}${x.toStringAsFixed(decimals)}%';
}

String _shortDate(String? iso) {
  final d = DateTime.tryParse(iso ?? '')?.toLocal();
  if (d == null) return '—';
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(d.day)}/${two(d.month)} ${two(d.hour)}:${two(d.minute)}';
}

Widget buildMarketIntro(MarketController c) {
  return Callout(
    title: '¿Qué muestra esta pantalla?',
    message:
        'Saturación (z): qué tan cargadas están las cuentas de Binance hacia un lado, comparado con sus últimos 30 días. '
        'Por encima de +${c.posThreshold.toStringAsFixed(1)} hay muchas cuentas en largo: históricamente esas monedas rindieron menos que el mercado en las 72 h siguientes. '
        'Por debajo de −${c.posThreshold.toStringAsFixed(1)} el efecto contrario fue más débil. '
        'El modo sombra registra estas señales sin operar, para medirlas con datos nuevos.',
  );
}

Widget buildShadowSummaries(MarketController c, {required bool mobile}) {
  final cards = c.summaries.map((s) {
    final closed = (s['closed'] as num?)?.toInt() ?? 0;
    final wins = (s['wins'] as num?)?.toInt() ?? 0;
    final sum = (s['netPctSum'] as num?)?.toDouble() ?? 0;
    final avg = (s['netPctAvg'] as num?)?.toDouble();
    final since = s['since'] as String?;
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_strategyNames[s['strategy']] ?? s['strategy'].toString(), style: AppTextStyles.cardTitle.copyWith(color: DsColors.textPrimary)),
          const SizedBox(height: AppSpacing.xs),
          Text(since == null ? 'Sin señales todavía' : 'Desde ${_shortDate(since)}', style: AppTextStyles.caption.copyWith(color: DsColors.textTertiary)),
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.xxl,
            runSpacing: AppSpacing.md,
            children: [
              MetricBlock(label: 'Abiertas', value: '${s['open'] ?? 0}', valueStyle: AppTextStyles.numM),
              MetricBlock(label: 'Cerradas', value: '$closed', secondaryLine: closed > 0 ? '$wins ganadas' : null, valueStyle: AppTextStyles.numM),
              MetricBlock(
                label: 'Neto acumulado',
                value: closed > 0 ? _pct(sum) : '—',
                secondaryLine: avg != null ? '${_pct(avg)} por operación' : null,
                sign: closed == 0 ? MetricSign.neutral : (sum >= 0 ? MetricSign.positive : MetricSign.negative),
                valueStyle: AppTextStyles.numM,
              ),
            ],
          ),
        ],
      ),
    );
  }).toList();
  if (mobile) {
    return Column(children: [for (final card in cards) Padding(padding: const EdgeInsets.only(bottom: AppSpacing.md), child: card)]);
  }
  return Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [for (var i = 0; i < cards.length; i++) ...[if (i > 0) const SizedBox(width: AppSpacing.lg), Expanded(child: cards[i])]],
  );
}

/// Barra horizontal centrada en 0 que se tiñe al pasar el umbral.
class _ZBar extends StatelessWidget {
  final double z;
  final double threshold;
  const _ZBar({required this.z, required this.threshold});

  @override
  Widget build(BuildContext context) {
    const maxAbs = 3.5;
    final frac = (z.abs() / maxAbs).clamp(0.0, 1.0);
    final hot = z.abs() > threshold;
    final color = hot ? (z > 0 ? DsColors.negative : DsColors.positive) : DsColors.textTertiary;
    return SizedBox(
      height: 8,
      child: LayoutBuilder(builder: (context, box) {
        final half = box.maxWidth / 2;
        return Stack(children: [
          Positioned.fill(child: Container(decoration: BoxDecoration(color: DsColors.surfaceSunken, borderRadius: BorderRadius.circular(4)))),
          Positioned(left: half - 0.5, top: 0, bottom: 0, child: Container(width: 1, color: DsColors.border)),
          Positioned(
            left: z >= 0 ? half : half - half * frac,
            width: half * frac,
            top: 0,
            bottom: 0,
            child: Container(decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(4))),
          ),
        ]);
      }),
    );
  }
}

Widget buildPositioningTable(MarketController c, {required bool mobile}) {
  final rows = c.rows;
  if (rows.isEmpty) return const EmptyState(message: 'Sin datos de posicionamiento por ahora.');
  return AppCard(
    padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
    child: Column(
      children: [
        for (var i = 0; i < rows.length; i++) ...[
          if (i > 0) const Divider(height: 1, color: DsColors.dividerSubtle),
          _positioningRow(c, rows[i], mobile: mobile),
        ],
      ],
    ),
  );
}

Widget _positioningRow(MarketController c, Map<String, dynamic> r, {required bool mobile}) {
  final z = (r['z'] as num).toDouble();
  final signal = r['posSignal'] as String?;
  final funding = (r['funding7dAnnual'] as num?)?.toDouble();
  final carry = r['carryActive'] == true;
  final symbol = Text(fmtSymbol(r['symbol']), style: AppTextStyles.body.copyWith(color: DsColors.textPrimary, fontWeight: FontWeight.w600));
  final zText = Text('${z >= 0 ? '+' : ''}${z.toStringAsFixed(2)}', style: AppTextStyles.numS.copyWith(color: z.abs() > c.posThreshold ? (z > 0 ? DsColors.negative : DsColors.positive) : DsColors.textSecondary));
  final fundingText = Text(
    funding == null ? '—' : '${_pct(funding, decimals: 1)} anual',
    style: AppTextStyles.caption.copyWith(color: carry ? DsColors.warning : DsColors.textSecondary),
  );
  final tag = signal == null ? const SizedBox(width: 52) : DirectionTag(isLong: signal == 'long');

  if (mobile) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [Expanded(child: symbol), zText, const SizedBox(width: AppSpacing.md), tag]),
          const SizedBox(height: AppSpacing.sm),
          _ZBar(z: z, threshold: c.posThreshold),
          const SizedBox(height: AppSpacing.sm),
          Row(children: [
            Text('Ratio ${((r['ratio'] as num?) ?? 0).toStringAsFixed(2)}', style: AppTextStyles.caption.copyWith(color: DsColors.textSecondary)),
            const SizedBox(width: AppSpacing.md),
            Expanded(child: fundingText),
            Text(fmtPrice(r['price']), style: AppTextStyles.numXS.copyWith(color: DsColors.textTertiary)),
          ]),
        ],
      ),
    );
  }
  return Padding(
    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl, vertical: AppSpacing.md),
    child: Row(
      children: [
        SizedBox(width: 32, child: Text('${r['rank']}', style: AppTextStyles.caption.copyWith(color: DsColors.textTertiary))),
        SizedBox(width: 120, child: symbol),
        SizedBox(width: 110, child: Text(fmtPrice(r['price']), style: AppTextStyles.numXS.copyWith(color: DsColors.textSecondary))),
        Expanded(child: _ZBar(z: z, threshold: c.posThreshold)),
        const SizedBox(width: AppSpacing.lg),
        SizedBox(width: 56, child: zText),
        SizedBox(width: 72, child: Text(((r['ratio'] as num?) ?? 0).toStringAsFixed(2), style: AppTextStyles.numXS.copyWith(color: DsColors.textSecondary))),
        SizedBox(width: 130, child: fundingText),
        tag,
      ],
    ),
  );
}

Widget buildShadowPositions(MarketController c, {required bool mobile}) {
  final open = c.openShadow;
  final recent = c.recentShadow;
  if (open.isEmpty && recent.isEmpty) {
    return const EmptyState(message: 'El modo sombra todavía no registró operaciones.', icon: Icons.hourglass_empty);
  }
  Widget line(Map<String, dynamic> s, {required bool closed}) {
    final net = double.tryParse(s['netPct']?.toString() ?? '');
    final name = s['strategy'] == 'CARRY_t15_top30' ? 'Carry' : 'POS';
    final detail = closed
        ? 'Cerró ${_shortDate(s['exitTime'] as String?)} · ${s['exitReason'] == 'stop' ? 'stop' : s['exitReason'] == 'time' ? '72 h' : 'funding bajo'}'
        : (s['exitDue'] != null ? 'Vence ${_shortDate(s['exitDue'] as String?)}' : 'Abierta desde ${_shortDate(s['entryTime'] as String?)}');
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: mobile ? AppSpacing.lg : AppSpacing.xl, vertical: AppSpacing.md),
      child: Row(
        children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Text(fmtSymbol(s['symbol']), style: AppTextStyles.body.copyWith(color: DsColors.textPrimary, fontWeight: FontWeight.w600)),
                const SizedBox(width: AppSpacing.sm),
                Text(name, style: AppTextStyles.caption.copyWith(color: DsColors.textTertiary)),
              ]),
              const SizedBox(height: 2),
              Text('Entrada ${fmtPrice(s['entryPrice'])} · $detail', style: AppTextStyles.caption.copyWith(color: DsColors.textSecondary)),
            ]),
          ),
          if (closed)
            Text(_pct(net), style: AppTextStyles.numS.copyWith(color: (net ?? 0) >= 0 ? DsColors.positive : DsColors.negative))
          else
            DirectionTag(isLong: s['side'] == 'long'),
        ],
      ),
    );
  }

  return Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      if (open.isNotEmpty) ...[
        SectionHeader(title: 'Abiertas (virtuales)', count: '${open.length}', mobile: mobile),
        const SizedBox(height: AppSpacing.md),
        AppCard(padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm), child: Column(children: [for (final s in open) line(s, closed: false)])),
        const SizedBox(height: AppSpacing.xl),
      ],
      if (recent.isNotEmpty) ...[
        SectionHeader(title: 'Cerradas recientes', count: '${recent.length}', mobile: mobile),
        const SizedBox(height: AppSpacing.md),
        AppCard(padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm), child: Column(children: [for (final s in recent) line(s, closed: true)])),
      ],
    ],
  );
}

String marketDataLabel(MarketController c) => fmtDataTime(c.barClose);
