import '../../widgets/status_pill.dart';

/// Mapea la clave de estado que manda `GET /api/dashboard` en
/// `recentActivity[].status` (ver `dashboardHelpers.ts` en el backend,
/// `mapDecisionToStatus`) a la variante del componente compartido.
StatusPillVariant statusPillVariantFromKey(String? key) {
  switch (key) {
    case 'objetivo':
      return StatusPillVariant.objetivo;
    case 'stop':
      return StatusPillVariant.stop;
    case 'enCurso':
      return StatusPillVariant.enCurso;
    case 'pendiente':
      return StatusPillVariant.pendiente;
    case 'descartada':
    default:
      return StatusPillVariant.descartada;
  }
}

bool isLongDirection(dynamic direction) => direction?.toString().toUpperCase() == 'LONG';

/// Sección 4 del documento de diseño: "el vencimiento se calcula en la app
/// desde la hora de la señal (vence a los 60 min); se pinta en `warning`
/// cuando quedan menos de 15 min".
const Duration kSignalExpiryWindow = Duration(minutes: 60);
const Duration kSignalExpirySoonThreshold = Duration(minutes: 15);

class SignalExpiry {
  final String label;
  final bool soon;
  final bool expired;

  const SignalExpiry({required this.label, required this.soon, required this.expired});
}

/// [now] es opcional para poder testear sin depender del reloj real (mismo
/// patrón que `DataTimestamp`).
SignalExpiry computeSignalExpiry(DateTime evaluatedAt, {DateTime? now}) {
  final reference = now ?? DateTime.now();
  final remaining = kSignalExpiryWindow - reference.difference(evaluatedAt);

  if (remaining.inSeconds <= 0) {
    return const SignalExpiry(label: 'Vencida', soon: false, expired: true);
  }

  final minutes = remaining.inMinutes;
  return SignalExpiry(
    label: 'vence en $minutes min',
    soon: remaining <= kSignalExpirySoonThreshold,
    expired: false,
  );
}
