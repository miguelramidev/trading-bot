import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:app/widgets/sl_tp_range_bar.dart';

void main() {
  group('computeRangeFraction', () {
    test('LONG: precio a mitad de camino entre stop y objetivo', () {
      final v = computeRangeFraction(stop: 90, target: 110, price: 100);
      expect(v, closeTo(0.5, 0.0001));
    });

    test('LONG: precio en el stop -> 0; en el objetivo -> 1', () {
      expect(computeRangeFraction(stop: 90, target: 110, price: 90), closeTo(0, 0.0001));
      expect(computeRangeFraction(stop: 90, target: 110, price: 110), closeTo(1, 0.0001));
    });

    test('SHORT: mismo cálculo sin invertir nada a mano (objetivo numéricamente menor al stop)', () {
      // Réplica del ejemplo de ZAMA en la maqueta: stop 0.078670, entrada 0.079680, objetivo 0.082270 (LONG, referencia)
      final entryFraction = computeRangeFraction(stop: 0.078670, target: 0.082270, price: 0.079680);
      expect(entryFraction, closeTo(0.2806, 0.001)); // ~28%, como en la maqueta

      // Ahora en SHORT: stop por encima de la entrada, objetivo por debajo.
      final v = computeRangeFraction(stop: 105, target: 90, price: 97.5);
      expect(v, closeTo(0.5, 0.0001));
    });

    test('stop y objetivo iguales -> 0, no divide por cero', () {
      expect(computeRangeFraction(stop: 100, target: 100, price: 105), 0);
    });
  });

  group('SlTpRangeBar (widget)', () {
    testWidgets('LONG: construye sin errores y muestra los niveles', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 300,
              child: SlTpRangeBar(stop: 90, entry: 95, target: 110, price: 100),
            ),
          ),
        ),
      );
      expect(find.textContaining('Stop'), findsOneWidget);
      expect(find.textContaining('Objetivo'), findsOneWidget);
    });

    testWidgets('SHORT: construye sin errores con stop sobre la entrada y objetivo debajo', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 300,
              child: SlTpRangeBar(stop: 105, entry: 100, target: 90, price: 97, isShort: true),
            ),
          ),
        ),
      );
      expect(find.textContaining('Stop'), findsOneWidget);
      expect(find.textContaining('Objetivo'), findsOneWidget);
    });

    testWidgets('precio más allá del objetivo no rompe el layout (se clampea)', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 300,
              child: SlTpRangeBar(stop: 90, entry: 95, target: 110, price: 200),
            ),
          ),
        ),
      );
      expect(tester.takeException(), isNull);
    });
  });
}
