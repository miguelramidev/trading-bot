import 'package:flutter/material.dart';
import '../core/theme/ds_colors.dart';
import '../core/theme/app_text_styles.dart';
import '../core/utils/result_formatter.dart';

/// Fracción de la barra (0 = stop, 1 = objetivo) a la que corresponde
/// [price]. Es la misma fórmula para LONG y SHORT sin invertir nada a mano:
/// si el objetivo queda numéricamente por debajo del stop (SHORT), el
/// numerador y el denominador quedan negativos los dos y el resultado sigue
/// siendo la fracción correcta de 0 a 1.
///
/// No se clampea acá a propósito — quien dibuja la barra decide si recorta
/// visualmente un precio que ya pasó el objetivo o el stop.
double computeRangeFraction({
  required double stop,
  required double target,
  required double price,
}) {
  final denom = target - stop;
  if (denom == 0) return 0;
  return (price - stop) / denom;
}

/// Barra del stop al objetivo (sección 4 del documento de diseño): tramo
/// stop→entrada en tint rojo, entrada→objetivo en tint verde, marca gris en
/// la entrada y punto claro en el último precio.
class SlTpRangeBar extends StatelessWidget {
  final double stop;
  final double entry;
  final double target;
  final double price;
  final bool isShort;
  final bool showLevelLabels;

  const SlTpRangeBar({
    super.key,
    required this.stop,
    required this.entry,
    required this.target,
    required this.price,
    this.isShort = false,
    this.showLevelLabels = true,
  });

  double get _entryFraction => computeRangeFraction(stop: stop, target: target, price: entry).clamp(0.0, 1.0);
  double get _priceFraction => computeRangeFraction(stop: stop, target: target, price: price).clamp(0.0, 1.0);

  @override
  Widget build(BuildContext context) {
    final entryFrac = _entryFraction;
    final priceFrac = _priceFraction;
    final slDistancePct = entry == 0 ? null : ((stop - entry) / entry) * 100;
    final tpDistancePct = entry == 0 ? null : ((target - entry) / entry) * 100;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        LayoutBuilder(
          builder: (context, constraints) {
            final width = constraints.maxWidth;
            return SizedBox(
              height: 22,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  Positioned(
                    left: 0,
                    right: 0,
                    top: 8,
                    child: Container(height: 6, decoration: BoxDecoration(color: DsColors.divider, borderRadius: BorderRadius.circular(999))),
                  ),
                  Positioned(
                    left: 0,
                    width: width * entryFrac,
                    top: 8,
                    child: Container(height: 6, decoration: BoxDecoration(color: DsColors.negativeTint, borderRadius: const BorderRadius.horizontal(left: Radius.circular(999)))),
                  ),
                  Positioned(
                    left: width * entryFrac,
                    right: 0,
                    top: 8,
                    child: Container(height: 6, decoration: BoxDecoration(color: DsColors.positiveTintSoft, borderRadius: const BorderRadius.horizontal(right: Radius.circular(999)))),
                  ),
                  Positioned(
                    left: (width * entryFrac - 1).clamp(0.0, width),
                    top: 2,
                    child: Container(width: 2, height: 18, color: DsColors.textSecondary),
                  ),
                  Positioned(
                    left: (width * priceFrac - 8).clamp(0.0, width),
                    top: 2,
                    child: Container(
                      width: 16,
                      height: 16,
                      decoration: BoxDecoration(
                        color: DsColors.textPrimary,
                        shape: BoxShape.circle,
                        border: Border.all(color: DsColors.surface, width: 3),
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
        if (showLevelLabels) ...[
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Stop ${slDistancePct != null ? fmtPct(slDistancePct) : fmtMissing()}',
                  overflow: TextOverflow.ellipsis,
                  style: AppTextStyles.numXS.copyWith(color: DsColors.negative),
                ),
              ),
              Expanded(
                child: Text(
                  'Objetivo ${tpDistancePct != null ? fmtPct(tpDistancePct) : fmtMissing()}',
                  textAlign: TextAlign.right,
                  overflow: TextOverflow.ellipsis,
                  style: AppTextStyles.numXS.copyWith(color: DsColors.positive),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}
