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
