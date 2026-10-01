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

    test('sin ADX para verificar: usa boundary - intervalMs (la última vela CERRADA al evaluar, no la que contiene el momento)', () {
      // targetMs cae justo en la apertura del intervalo de 30m: la vela que lo
      // "contiene" (índice 2) todavía está en curso en ese instante — la
      // última CERRADA es la anterior (índice 1).
      expect(findSignalCandleIndex(openTimesMs: openTimes, targetMs: 1800000, intervalMs: interval), 1);
    });

    test('sin ADX para verificar: funciona igual cuando el momento cae en el medio del intervalo', () {
      expect(findSignalCandleIndex(openTimesMs: openTimes, targetMs: 1800000 + 400000, intervalMs: interval), 1);
    });

    test('lista vacía -> null', () {
      expect(findSignalCandleIndex(openTimesMs: [], targetMs: 100, intervalMs: interval), isNull);
    });

    test('el candidato cae antes de la primera vela conocida -> null (no hay dónde marcar)', () {
      expect(findSignalCandleIndex(openTimesMs: openTimes, targetMs: 0, intervalMs: interval), isNull);
    });

    test('caso real WIF: el candidato principal coincide con triggerAdx y se usa directamente', () {
      // Replica fetch_wif_signal.ts / debug_wif_marker.ts: evaluatedAt
      // 2026-10-01T11:46:23.923Z, triggerAdx guardado 25.03. La vela
      // correcta abre 11:30 UTC con ADX 25.03 (la que "contiene" el
      // momento, que abre 11:45, tiene ADX 23.68 y NO debe marcarse).
      final evaluatedAt = DateTime.utc(2026, 10, 1, 11, 46, 23, 923).millisecondsSinceEpoch;
      final candleOpens = [
        DateTime.utc(2026, 10, 1, 11, 0).millisecondsSinceEpoch,
        DateTime.utc(2026, 10, 1, 11, 15).millisecondsSinceEpoch,
        DateTime.utc(2026, 10, 1, 11, 30).millisecondsSinceEpoch,
        DateTime.utc(2026, 10, 1, 11, 45).millisecondsSinceEpoch,
        DateTime.utc(2026, 10, 1, 12, 0).millisecondsSinceEpoch,
      ];
      final adxValues = [20.0, 22.5, 25.03, 23.68, 24.0];

      final index = findSignalCandleIndex(
        openTimesMs: candleOpens,
        targetMs: evaluatedAt,
        intervalMs: interval,
        adxValues: adxValues,
        expectedAdx: 25.03,
      );

      expect(index, 2); // vela que abre 11:30, ADX 25.03 — NO la de 11:45 (índice 3)
    });

    test('evaluatedAt cae en el intervalo siguiente (lag del cron): el candidato principal no coincide y se usa la vela anterior', () {
      // El candidato "boundary - intervalMs" da la vela de 30m (ADX 30, no
      // coincide con el triggerAdx real de 20). La vela correcta, verificada
      // por ADX, es una más atrás: la de 15m.
      final adxValues = [10.0, 20.0, 30.0, 40.0, 50.0];
      final index = findSignalCandleIndex(
        openTimesMs: openTimes,
        targetMs: 2700000 + 5000, // unos segundos dentro del intervalo de 45-60m
        intervalMs: interval,
        adxValues: adxValues,
        expectedAdx: 20.0,
      );
      expect(index, 1); // vela de 15m (ADX 20), no la de 30m (ADX 30) que da la fórmula sola
    });

    test('ni el candidato principal ni el anterior coinciden con el ADX esperado -> null, nunca una marca incorrecta', () {
      final adxValues = [10.0, 20.0, 30.0, 40.0, 50.0];
      final index = findSignalCandleIndex(
        openTimesMs: openTimes,
        targetMs: 1800000,
        intervalMs: interval,
        adxValues: adxValues,
        expectedAdx: 999.0,
      );
      expect(index, isNull);
    });
  });
}
