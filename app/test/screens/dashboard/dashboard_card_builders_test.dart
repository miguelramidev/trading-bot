import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:app/providers/dashboard_provider.dart';
import 'package:app/screens/dashboard/dashboard_card_builders.dart';

// Cubre el mapeo provider.marginWarning -> SignalCard.cannotTradeReason, que
// no tenía ningún test propio (ver auditoría de avisos 2026-10-01): tanto
// `computeMarginWarning` (backend) como el render de `cannotTradeReason`
// dentro de `SignalCard` ya estaban cubiertos por separado, pero nada
// probaba que este mapeo intermedio siguiera funcionando.
void main() {
  Map<String, dynamic> pendingSignal() => {
        'id': 739,
        'symbol': 'ICP/USDT:USDT',
        'direction': 'LONG',
        'strategy': '1',
        'entry': '3.26',
        'stopLoss': '3.23',
        'takeProfit': '3.31',
        'evaluatedAt': DateTime.now().toIso8601String(),
        'btcRegime': 'Rango (16.18)',
      };

  testWidgets('marginWarning insufficient:true -> el botón muestra "Sin margen disponible" y queda deshabilitado', (tester) async {
    final provider = DashboardProvider()..marginWarning = {'insufficient': true, 'availableUsd': 4.47, 'requiredUsd': 35};

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(builder: (context) => buildSignalCard(context, provider, pendingSignal())),
        ),
      ),
    );

    expect(find.text('Sin margen disponible'), findsOneWidget);
    expect(find.text('Revisar y operar'), findsNothing);
  });

  testWidgets('sin marginWarning (o insufficient:false) -> botón habilitado con su label normal', (tester) async {
    final provider = DashboardProvider();

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(builder: (context) => buildSignalCard(context, provider, pendingSignal())),
        ),
      ),
    );

    expect(find.text('Revisar y operar'), findsOneWidget);
    expect(find.text('Sin margen disponible'), findsNothing);
  });
}
