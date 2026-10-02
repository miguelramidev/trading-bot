import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:app/screens/signals/signal_detail_controller.dart';
import 'package:app/screens/signals/signal_detail_sections.dart';
import 'package:app/widgets/callout.dart';

void main() {
  group('buildPriceSection — "llegás tarde" según la relación riesgo/premio EN VIVO (Regla 7, no un % fijo)', () {
    testWidgets('con la relación efectiva por debajo de 1.5, muestra el aviso de advertencia', (tester) async {
      final controller = SignalDetailController({'entry': '100', 'stopLoss': '95', 'takeProfit': '110', 'direction': 'LONG'});
      controller.setCurrentPrice(103); // riesgo=8, premio=7, relación=0.875

      await tester.pumpWidget(MaterialApp(home: Scaffold(body: buildPriceSection(controller))));

      final callout = tester.widget<Callout>(find.byType(Callout));
      expect(callout.variant, CalloutVariant.warning);
      expect(callout.message, contains('relación queda en 1 : 0.9'));
      expect(find.textContaining('desde la señal'), findsNothing);
      controller.dispose(); // cancela el Timer.periodic del ticker en vivo antes de que termine el test
    });

    testWidgets('con la relación efectiva en el mínimo (1.5 exacto) o por encima, muestra el texto neutro de siempre, sin advertencia', (tester) async {
      final controller = SignalDetailController({'entry': '100', 'stopLoss': '95', 'takeProfit': '110', 'direction': 'LONG'});
      controller.setCurrentPrice(101); // riesgo=6, premio=9, relación=1.5 exacto

      await tester.pumpWidget(MaterialApp(home: Scaffold(body: buildPriceSection(controller))));

      expect(find.byType(Callout), findsNothing);
      expect(find.textContaining('desde la señal'), findsOneWidget);
      controller.dispose();
    });

    testWidgets('sin precio todavía, no muestra ni el texto ni la advertencia', (tester) async {
      final controller = SignalDetailController({'entry': '100', 'stopLoss': '95', 'takeProfit': '110', 'direction': 'LONG'});

      await tester.pumpWidget(MaterialApp(home: Scaffold(body: buildPriceSection(controller))));

      expect(find.byType(Callout), findsNothing);
      expect(find.textContaining('desde la señal'), findsNothing);
      controller.dispose();
    });
  });

  group('buildMarginWarningSection', () {
    test('insufficient:false (o ausente) -> null, no muestra nada', () {
      expect(buildMarginWarningSection(null), isNull);
      expect(buildMarginWarningSection({'insufficient': false}), isNull);
    });

    test('insufficient:true -> Callout de advertencia con el disponible y el requerido', () {
      final widget = buildMarginWarningSection({'insufficient': true, 'availableUsd': 4.47, 'requiredUsd': 35});
      expect(widget, isA<Callout>());
      final callout = widget as Callout;
      expect(callout.variant, CalloutVariant.warning);
      expect(callout.message, contains('Disponible'));
      expect(callout.message, contains('margen de'));
    });
  });
}
