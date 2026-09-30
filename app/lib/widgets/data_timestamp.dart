import 'package:flutter/material.dart';
import '../core/theme/ds_colors.dart';
import '../core/theme/app_text_styles.dart';
import '../core/utils/datetime_formatter.dart';

/// Umbral de la sección 4.4: a partir de este tiempo sin actualizarse, el
/// dato se muestra atenuado.
const Duration kDataTimestampStaleAfter = Duration(minutes: 2);

/// "Datos de las HH:MM" — se atenúa (color más apagado) si [dataTime] tiene
/// más de 2 minutos respecto de [now]. [now] es opcional y solo existe para
/// poder testear la atenuación sin depender del reloj real; en producción
/// nunca se pasa (usa `DateTime.now()`).
class DataTimestamp extends StatelessWidget {
  final DateTime? dataTime;
  final DateTime? now;

  const DataTimestamp({super.key, required this.dataTime, this.now});

  bool get isStale {
    if (dataTime == null) return false;
    final reference = now ?? DateTime.now();
    return reference.difference(dataTime!) > kDataTimestampStaleAfter;
  }

  @override
  Widget build(BuildContext context) {
    return Text(
      fmtDataTime(dataTime),
      style: AppTextStyles.bodySmall.copyWith(color: isStale ? DsColors.textTertiary : DsColors.textSecondary),
    );
  }
}
