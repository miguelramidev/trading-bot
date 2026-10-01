import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:app/screens/signals/signal_detail_controller.dart';
import 'package:app/screens/signals/signal_detail_sections.dart';
import 'package:app/widgets/callout.dart';

void main() {
  group('buildPriceSection — "llegás tarde" (bug real: existía en el Inicio pero no acá)', () {
    testWidgets('con el precio en vivo al 30% o más del camino, muestra el aviso de advertencia', (tester) async {
      final controller = SignalDetailController({'entry': '100', 'takeProfit': '110', 'direction': 'LONG'});
      controller.setCurrentPrice(103); // (103-100)/(110-100) = 0.30 = kSignalLateThreshold

      await tester.pumpWidget(MaterialApp(home: Scaffold(body: buildPriceSection(controller))));

      final callout = tester.widget<Callout>(find.byType(Callout));
      expect(callout.variant, CalloutVariant.warning);
      expect(callout.message, contains('recorrió el 30%'));
      expect(find.textContaining('desde la señal'), findsNothing);
      controller.dispose(); // cancela el Timer.periodic del ticker en vivo antes de que termine el test
    });

    testWidgets('con el precio por debajo del 30%, muestra el texto neutro de siempre, sin advertencia', (tester) async {
      final controller = SignalDetailController({'entry': '100', 'takeProfit': '110', 'direction': 'LONG'});
      controller.setCurrentPrice(101);

      await tester.pumpWidget(MaterialApp(home: Scaffold(body: buildPriceSection(controller))));

      expect(find.byType(Callout), findsNothing);
      expect(find.textContaining('desde la señal'), findsOneWidget);
      controller.dispose();
    });

    testWidgets('sin precio todavía, no muestra ni el texto ni la advertencia', (tester) async {
      final controller = SignalDetailController({'entry': '100', 'takeProfit': '110', 'direction': 'LONG'});

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
