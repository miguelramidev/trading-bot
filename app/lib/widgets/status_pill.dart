import 'package:flutter/material.dart';
import '../core/theme/ds_colors.dart';
import '../core/theme/app_text_styles.dart';
import '../core/theme/app_radius.dart';

/// Los 9 estados con nombre de la sección 4 del documento de diseño. Cada uno
/// tiene su propio color Y su propio texto — nunca se distingue un estado
/// solo por color (ver principio 5: "cada estado tiene un color y un texto
/// propios, y se distingue también sin color").
enum StatusPillVariant {
  objetivo,
  stop,
  enCurso,
  pendiente,
  descartada,
  expirada,
  activa,
  desactivada,
  retirada,
}

class _PillStyle {
  final String label;
  final Color color;
  final Color background;
  const _PillStyle(this.label, this.color, this.background);
}

_PillStyle _styleFor(StatusPillVariant variant) {
  switch (variant) {
    case StatusPillVariant.objetivo:
      return _PillStyle('Objetivo tocado', DsColors.positive, DsColors.positiveTint);
    case StatusPillVariant.stop:
      return _PillStyle('Stop tocado', DsColors.negative, DsColors.negativeTint);
    case StatusPillVariant.enCurso:
      return _PillStyle('En curso', DsColors.accentText, DsColors.accentTint);
    case StatusPillVariant.pendiente:
      return _PillStyle('Pendiente', DsColors.accentText, DsColors.accentTint);
    case StatusPillVariant.descartada:
      return _PillStyle('Descartada', DsColors.textSecondary, DsColors.surfaceRaised);
    case StatusPillVariant.expirada:
      return _PillStyle('Expirada', DsColors.textTertiary, DsColors.surfaceRaised);
    case StatusPillVariant.activa:
      return _PillStyle('Activa', DsColors.positive, DsColors.positiveTint);
    case StatusPillVariant.desactivada:
      return _PillStyle('Desactivada', DsColors.textSecondary, DsColors.surfaceRaised);
    case StatusPillVariant.retirada:
      return _PillStyle('Retirada', DsColors.textTertiary, DsColors.surfaceRaised);
  }
}

/// Etiqueta de estado en forma de píldora. [label] permite texto compuesto
/// (ej. "Pendiente · vence en 57 min"); si no se pasa, usa el texto por
/// default de la variante.
class StatusPill extends StatelessWidget {
  final StatusPillVariant variant;
  final String? label;

  const StatusPill(this.variant, {super.key, this.label});

  @override
  Widget build(BuildContext context) {
    final style = _styleFor(variant);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: style.background,
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Text(
        label ?? style.label,
        style: AppTextStyles.captionStrong.copyWith(color: style.color),
      ),
    );
  }
}
