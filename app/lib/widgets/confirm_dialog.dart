import 'package:flutter/material.dart';
import '../core/theme/ds_colors.dart';
import '../core/theme/app_text_styles.dart';
import '../core/theme/app_spacing.dart';
import '../core/theme/app_radius.dart';
import '../core/utils/result_formatter.dart';
import '../core/utils/signal_warnings.dart';
import 'app_buttons.dart';
import 'app_filter_chip.dart';
import 'callout.dart';
import 'direction_tag.dart';

/// Motivos de descarte de un toque (sección "Descartar" del documento de
/// diseño): reemplazan el texto libre. `otro` no abre un campo de texto —
/// se manda tal cual como `reason`, igual que el resto.
enum DiscardReason { llegoTarde, noConvenceContexto, sinMargen, otro }

extension DiscardReasonLabel on DiscardReason {
  String get label {
    switch (this) {
      case DiscardReason.llegoTarde:
        return 'Llegó tarde';
      case DiscardReason.noConvenceContexto:
        return 'No me convence el contexto';
      case DiscardReason.sinMargen:
        return 'Sin margen';
      case DiscardReason.otro:
        return 'Otro';
    }
  }
}

Widget _dialogShell({required String title, required Widget content, required List<Widget> actions}) {
  return Builder(
    builder: (context) {
      // Mismo breakpoint que `ResponsiveLayout`: en escritorio el modal no
      // se estira a lo ancho de la pantalla, queda centrado y legible; en
      // celular sí ocupa el ancho, con el margen que ya da `Dialog` por
      // default (`insetPadding`).
      final isDesktop = MediaQuery.of(context).size.width >= 900;
      return Dialog(
        backgroundColor: DsColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.xl), side: const BorderSide(color: DsColors.border)),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: isDesktop ? 480 : double.infinity),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.xl),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppTextStyles.cardTitle.copyWith(color: DsColors.textPrimary)),
                const SizedBox(height: AppSpacing.lg),
                content,
                const SizedBox(height: AppSpacing.xl),
                Row(children: actions),
              ],
            ),
          ),
        ),
      );
    },
  );
}

/// Resultado de `showDiscardConfirmDialog`: si se confirmó, y con qué motivo
/// (`null` si no se eligió ninguno — el campo es opcional).
class DiscardConfirmResult {
  final bool confirmed;
  final String? reason;

  const DiscardConfirmResult({required this.confirmed, this.reason});
}

/// Diálogo de confirmación antes de descartar: reutilizable (Inicio y
/// Detalle de señal).
Future<DiscardConfirmResult> showDiscardConfirmDialog(BuildContext context, {required String symbol}) async {
  DiscardReason? selected;
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (dialogContext) {
      return StatefulBuilder(
        builder: (context, setState) {
          return _dialogShell(
            title: 'Descartar $symbol',
            content: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Motivo (opcional)', style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary)),
                const SizedBox(height: AppSpacing.sm),
                Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: DiscardReason.values
                      .map((r) => AppFilterChip(
                            label: r.label,
                            selected: selected == r,
                            onTap: () => setState(() => selected = selected == r ? null : r),
                          ))
                      .toList(),
                ),
              ],
            ),
            actions: [
              Expanded(child: SecondaryButton(label: 'Cancelar', onPressed: () => Navigator.of(dialogContext).pop(false))),
              const SizedBox(width: AppSpacing.md),
              Expanded(child: DangerButton(label: 'Descartar', onPressed: () => Navigator.of(dialogContext).pop(true))),
            ],
          );
        },
      );
    },
  );
  if (confirmed != true) return const DiscardConfirmResult(confirmed: false);
  return DiscardConfirmResult(confirmed: true, reason: selected?.label);
}

/// Diálogo de confirmación antes de ejecutar: resumen de símbolo,
/// dirección, margen, apalancamiento y resultado si toca el stop/objetivo.
Future<bool> showExecuteConfirmDialog(
  BuildContext context, {
  required String symbol,
  required bool isLong,
  required double marginUsd,
  required int leverageMin,
  required int leverageMax,
  required double stopResultUsd,
  required double targetResultUsd,
  List<SignalWarning> highSeverityWarnings = const [],
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => _dialogShell(
      title: 'Operar $symbol',
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Arriba de todo, antes que cualquier otra cosa del resumen: si la
          // señal tiene advertencias de riesgo alto, esta es la última
          // chance de verlas antes de confirmar.
          for (final w in highSeverityWarnings) ...[
            Callout(variant: calloutVariantFor(w.severity), icon: calloutIconFor(w.severity), message: w.text),
            const SizedBox(height: AppSpacing.md),
          ],
          Row(children: [DirectionTag(isLong: isLong), const SizedBox(width: AppSpacing.sm), Text(symbol, style: AppTextStyles.body.copyWith(color: DsColors.textPrimary))]),
          const SizedBox(height: AppSpacing.lg),
          _summaryRow('Margen', fmtUsd(marginUsd, signed: false)),
          const SizedBox(height: AppSpacing.sm),
          _summaryRow('Apalancamiento', 'x$leverageMin'),
          const SizedBox(height: AppSpacing.sm),
          _summaryRow('Si toca el stop', fmtUsd(stopResultUsd), color: DsColors.negative),
          const SizedBox(height: AppSpacing.sm),
          _summaryRow('Si toca el objetivo', fmtUsd(targetResultUsd), color: DsColors.positive),
          const SizedBox(height: AppSpacing.md),
          Text(
            'Calculado con el apalancamiento mínimo (x$leverageMin). Puede subir hasta x$leverageMax si Binance lo exige para el tamaño mínimo de la orden.',
            style: AppTextStyles.caption.copyWith(color: DsColors.textTertiary),
          ),
        ],
      ),
      actions: [
        Expanded(child: SecondaryButton(label: 'Cancelar', onPressed: () => Navigator.of(dialogContext).pop(false))),
        const SizedBox(width: AppSpacing.md),
        Expanded(child: PrimaryButton(label: 'Confirmar', onPressed: () => Navigator.of(dialogContext).pop(true))),
      ],
    ),
  );
  return confirmed == true;
}

Widget _summaryRow(String label, String value, {Color? color}) {
  return Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text(label, style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary)),
      Text(value, style: AppTextStyles.numS.copyWith(color: color ?? DsColors.textPrimary)),
    ],
  );
}
