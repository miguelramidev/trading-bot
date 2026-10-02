import '../../widgets/status_pill.dart';

/// Mapea el `status` que manda `GET /api/history` ("TP HIT" / "SL HIT" /
/// "DESCARTADO" — formato histórico del backend, distinto de las claves
/// 'objetivo'/'stop'/'descartada' que usa `recentActivity` del dashboard) a
/// la variante del componente compartido.
StatusPillVariant statusPillVariantForHistory(String? status) {
  switch (status) {
    case 'TP HIT':
      return StatusPillVariant.objetivo;
    case 'SL HIT':
      return StatusPillVariant.stop;
    case 'RECHAZADO':
      return StatusPillVariant.rechazada;
    case 'DESCARTADO':
    default:
      return StatusPillVariant.descartada;
  }
}
