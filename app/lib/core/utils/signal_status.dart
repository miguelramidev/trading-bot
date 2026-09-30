import 'dashboard_mappers.dart';

/// Estado de una señal en la pantalla de detalle. Reemplaza la lógica que
/// estaba duplicada (y basada en strings sueltos) en
/// `mobile_signal_detail.dart`/`desktop_signal_detail.dart`.
enum SignalDetailStatus { pendiente, activa, terminada, descartada, expirada }

/// `decision` pasa por: null (pendiente) -> "Tomada"/"Descartada" -> (al
/// cerrar, ver `analyze.ts`) "Tomada -> Cerrada (TP/SL Tocado)" o
/// "Descartada -> Cerrada (...)". Cualquier decisión con "->" ya cerró, así
/// que cuenta como terminada sin importar de qué lado arrancó.
SignalDetailStatus computeSignalDetailStatus({
  required String? decision,
  required bool isActiveTrade,
  required DateTime evaluatedAt,
  DateTime? now,
}) {
  if (decision == null) {
    final expiry = computeSignalExpiry(evaluatedAt, now: now);
    return expiry.expired ? SignalDetailStatus.expirada : SignalDetailStatus.pendiente;
  }
  if (decision.contains('->')) return SignalDetailStatus.terminada;
  if (decision == 'Descartada') return SignalDetailStatus.descartada;
  if (decision == 'Tomada') return isActiveTrade ? SignalDetailStatus.activa : SignalDetailStatus.terminada;
  return SignalDetailStatus.terminada;
}

/// Solo una señal pendiente (y no vencida) se puede operar.
bool canOperateSignal(SignalDetailStatus status) => status == SignalDetailStatus.pendiente;
