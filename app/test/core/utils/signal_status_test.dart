import 'package:flutter_test/flutter_test.dart';
import 'package:app/core/utils/signal_status.dart';

void main() {
  final now = DateTime(2026, 9, 30, 12, 0, 0);

  group('computeSignalDetailStatus', () {
    test('sin decisión y reciente -> pendiente', () {
      final status = computeSignalDetailStatus(decision: null, isActiveTrade: false, evaluatedAt: now, now: now);
      expect(status, SignalDetailStatus.pendiente);
    });

    test('sin decisión y vencida (60 min o más) -> expirada', () {
      final status = computeSignalDetailStatus(
        decision: null,
        isActiveTrade: false,
        evaluatedAt: now.subtract(const Duration(minutes: 61)),
        now: now,
      );
      expect(status, SignalDetailStatus.expirada);
    });

    test('Descartada sin cierre -> descartada', () {
      final status = computeSignalDetailStatus(decision: 'Descartada', isActiveTrade: false, evaluatedAt: now, now: now);
      expect(status, SignalDetailStatus.descartada);
    });

    test('Rechazada (protección de executeTrade) -> descartada (mismo estado, no se puede volver a operar)', () {
      final status = computeSignalDetailStatus(decision: 'Rechazada', isActiveTrade: false, evaluatedAt: now, now: now);
      expect(status, SignalDetailStatus.descartada);
      expect(canOperateSignal(status), isFalse);
    });

    // Regla 8 de RULES.md (maxSignalAgeMinutes de GET /api/users/config): el botón de operar
    // se deshabilita con el umbral que mande el backend, no solo con el default de 60 min.
    test('window configurable (Regla 8): 61 min es "reciente" con una ventana de 90, "vencida" con la de 60 (default)', () {
      final evaluatedAt = now.subtract(const Duration(minutes: 61));

      final withDefaultWindow = computeSignalDetailStatus(decision: null, isActiveTrade: false, evaluatedAt: evaluatedAt, now: now);
      expect(withDefaultWindow, SignalDetailStatus.expirada);
      expect(canOperateSignal(withDefaultWindow), isFalse);

      final withWiderWindow = computeSignalDetailStatus(
        decision: null,
        isActiveTrade: false,
        evaluatedAt: evaluatedAt,
        now: now,
        window: const Duration(minutes: 90),
      );
      expect(withWiderWindow, SignalDetailStatus.pendiente);
      expect(canOperateSignal(withWiderWindow), isTrue);
    });

    test('Tomada y todavía activa -> activa', () {
      final status = computeSignalDetailStatus(decision: 'Tomada', isActiveTrade: true, evaluatedAt: now, now: now);
      expect(status, SignalDetailStatus.activa);
    });

    test('Tomada pero ya no activa (dato inconsistente) -> terminada', () {
      final status = computeSignalDetailStatus(decision: 'Tomada', isActiveTrade: false, evaluatedAt: now, now: now);
      expect(status, SignalDetailStatus.terminada);
    });

    test('Tomada -> Cerrada (TP Tocado) -> terminada', () {
      final status = computeSignalDetailStatus(decision: 'Tomada -> Cerrada (TP Tocado)', isActiveTrade: false, evaluatedAt: now, now: now);
      expect(status, SignalDetailStatus.terminada);
    });

    test('Descartada -> Cerrada (SL Tocado) -> terminada (no descartada)', () {
      final status = computeSignalDetailStatus(decision: 'Descartada -> Cerrada (SL Tocado)', isActiveTrade: false, evaluatedAt: now, now: now);
      expect(status, SignalDetailStatus.terminada);
    });

    test('caso real WIF (01/10 11:46, Tomada -> Cerrada con +\$0.50): terminada, nunca expirada', () {
      // Antes del fix, el Detalle de señal abierto desde el Historial
      // mostraba "Expirada" para esta señal ya ejecutada y cerrada, porque
      // el controller leía `decision`/`isActiveTrade` del mapa original en
      // vez de `_resolved` (ver signal_detail_controller.dart). Acá se
      // prueba la función pura con la decisión real tal cual vino de la DB.
      final evaluatedAt = DateTime.utc(2026, 10, 1, 11, 46, 23, 923);
      final status = computeSignalDetailStatus(
        decision: 'Tomada -> Cerrada (TP Tocado)',
        isActiveTrade: false,
        evaluatedAt: evaluatedAt,
        now: evaluatedAt.add(const Duration(hours: 2)), // mucho después de los 60 min de "pendiente"
      );
      expect(status, SignalDetailStatus.terminada);
    });
  });

  group('canOperateSignal', () {
    test('solo pendiente se puede operar', () {
      expect(canOperateSignal(SignalDetailStatus.pendiente), isTrue);
      expect(canOperateSignal(SignalDetailStatus.activa), isFalse);
      expect(canOperateSignal(SignalDetailStatus.terminada), isFalse);
      expect(canOperateSignal(SignalDetailStatus.descartada), isFalse);
      expect(canOperateSignal(SignalDetailStatus.expirada), isFalse);
    });
  });
}
