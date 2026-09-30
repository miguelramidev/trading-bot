import 'package:flutter_test/flutter_test.dart';
import 'package:app/core/utils/signal_progress.dart';

void main() {
  group('computeSignalProgress', () {
    test('LONG: precio a favor, a mitad de camino', () {
      final v = computeSignalProgress(entry: 100, target: 110, price: 105);
      expect(v, closeTo(0.5, 0.0001));
    });

    test('SHORT: precio a favor, a mitad de camino (objetivo bajo la entrada)', () {
      final v = computeSignalProgress(entry: 100, target: 90, price: 95);
      expect(v, closeTo(0.5, 0.0001));
    });

    test('LONG: precio en contra de la entrada -> avance negativo', () {
      final v = computeSignalProgress(entry: 100, target: 110, price: 98);
      expect(v, closeTo(-0.2, 0.0001));
    });

    test('SHORT: precio en contra de la entrada -> avance negativo', () {
      final v = computeSignalProgress(entry: 100, target: 90, price: 102);
      expect(v, closeTo(-0.2, 0.0001));
    });

    test('ya pasó el objetivo -> mayor a 1', () {
      final v = computeSignalProgress(entry: 100, target: 110, price: 115);
      expect(v, closeTo(1.5, 0.0001));
    });

    test('entrada y objetivo iguales -> 0, no divide por cero', () {
      final v = computeSignalProgress(entry: 100, target: 100, price: 105);
      expect(v, 0);
    });
  });

  group('computeEffectiveRiskReward', () {
    test('LONG: a mitad de camino, mismo riesgo:premio que al origen (1:2 -> 0.5 restante)', () {
      final v = computeEffectiveRiskReward(stop: 95, price: 105, target: 110);
      expect(v, closeTo(0.5, 0.0001));
    });

    test('SHORT: a mitad de camino (stop sobre la entrada, objetivo debajo)', () {
      final v = computeEffectiveRiskReward(stop: 105, price: 95, target: 90);
      expect(v, closeTo(0.5, 0.0001));
    });

    test('precio en contra de la entrada: el riesgo restante se achica y la relación efectiva crece', () {
      final v = computeEffectiveRiskReward(stop: 95, price: 98, target: 110);
      expect(v, closeTo(4.0, 0.0001));
    });

    test('precio exactamente en el stop -> null, no 0 ni infinito', () {
      final v = computeEffectiveRiskReward(stop: 95, price: 95, target: 110);
      expect(v, isNull);
    });
  });
}
