import 'package:flutter_test/flutter_test.dart';
import 'package:app/screens/signals/signal_chart_math.dart';

void main() {
  group('computeChartYRange', () {
    test('el rango incluye el stop y el objetivo aunque estén fuera de las velas', () {
      final range = computeChartYRange(lows: [100, 101], highs: [102, 103], stop: 90, target: 120, paddingFraction: 0);
      expect(range.minY, lessThanOrEqualTo(90));
      expect(range.maxY, greaterThanOrEqualTo(120));
    });

    test('sin padding, el rango es exactamente min/max de velas+stop+objetivo', () {
      final range = computeChartYRange(lows: [50], highs: [60], stop: 55, target: 58, paddingFraction: 0);
      expect(range.minY, 50);
      expect(range.maxY, 60);
    });

    test('con padding, deja aire arriba y abajo', () {
      final range = computeChartYRange(lows: [100], highs: [110], stop: 100, target: 110, paddingFraction: 0.1);
      expect(range.minY, lessThan(100));
      expect(range.maxY, greaterThan(110));
      expect(range.maxY - range.minY, closeTo(10 + 10 * 0.1 * 2, 1e-9));
    });
  });

  group('priceToChartY', () {
    test('precio en el máximo -> arriba del todo (y=0)', () {
      expect(priceToChartY(110, minY: 90, maxY: 110, height: 200), 0);
    });

    test('precio en el mínimo -> abajo del todo (y=height)', () {
      expect(priceToChartY(90, minY: 90, maxY: 110, height: 200), 200);
    });

    test('precio a mitad de camino -> mitad de la altura', () {
      expect(priceToChartY(100, minY: 90, maxY: 110, height: 200), closeTo(100, 1e-9));
    });

    test('precio conocido fuera del centro: verifica la posición exacta', () {
      // rango 0.078670–0.082270 (ejemplo real de la maqueta ZAMA), precio 0.079680 (entrada, ~28% del camino)
      final y = priceToChartY(0.079680, minY: 0.078670, maxY: 0.082270, height: 440);
      // fraction = (0.079680-0.078670)/(0.082270-0.078670) = 0.28056; y = 440 - 0.28056*440
      expect(y, closeTo(440 - 0.28056 * 440, 0.5));
    });

    test('precio fuera de rango se clampea al borde, no desaparece', () {
      expect(priceToChartY(200, minY: 90, maxY: 110, height: 200), 0);
      expect(priceToChartY(0, minY: 90, maxY: 110, height: 200), 200);
    });

    test('minY == maxY (degenerado) -> mitad de la altura, no divide por cero', () {
      expect(priceToChartY(100, minY: 100, maxY: 100, height: 200), 100);
    });
  });

  group('findSignalCandleIndex', () {
    const interval = 900000; // 15m en ms
    final openTimes = [0, 900000, 1800000, 2700000, 3600000]; // 5 velas de 15m

    test('encuentra la vela que contiene el momento exacto de apertura', () {
      expect(findSignalCandleIndex(openTimesMs: openTimes, targetMs: 1800000, intervalMs: interval), 2);
    });

    test('encuentra la vela cuando el momento cae en el medio, no en la apertura', () {
      expect(findSignalCandleIndex(openTimesMs: openTimes, targetMs: 1800000 + 400000, intervalMs: interval), 2);
    });

    test('el final exacto del rango (última vela + su duración) ya no está adentro', () {
      expect(findSignalCandleIndex(openTimesMs: openTimes, targetMs: 3600000 + interval, intervalMs: interval), isNull);
    });

    test('justo antes de que termine la última vela sí está adentro', () {
      expect(findSignalCandleIndex(openTimesMs: openTimes, targetMs: 3600000 + interval - 1, intervalMs: interval), 4);
    });

    test('antes de la primera vela -> null (la señal no está en el rango visible)', () {
      expect(findSignalCandleIndex(openTimesMs: openTimes, targetMs: -1, intervalMs: interval), isNull);
    });

    test('lista vacía -> null', () {
      expect(findSignalCandleIndex(openTimesMs: [], targetMs: 100, intervalMs: interval), isNull);
    });
  });
}
