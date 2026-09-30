import 'result_formatter.dart';

/// "Datos de las HH:MM", en hora local del dispositivo. `—` si no hay hora.
String fmtDataTime(DateTime? dataTime) {
  if (dataTime == null) return fmtMissing();
  final local = dataTime.toLocal();
  final hh = local.hour.toString().padLeft(2, '0');
  final mm = local.minute.toString().padLeft(2, '0');
  return 'Datos de las $hh:$mm';
}
