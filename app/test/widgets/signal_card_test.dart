import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:app/widgets/signal_card.dart';

void main() {
  Widget wrap(Widget child) => MaterialApp(home: Scaffold(body: SingleChildScrollView(child: child)));

  testWidgets('muestra símbolo, dirección, estrategia, vencimiento, niveles y R:R (diseño 1:2)', (tester) async {
    await tester.pumpWidget(wrap(const SignalCard(
      symbol: 'ENA',
      isLong: true,
      strategy: 'Tendencial',
      expiresLabel: 'vence en 57 min',
      entry: 100,
      stop: 95,
      target: 110,
      btcContext: 'BTC en rango · tendencia 4h alcista',
    )));

    expect(find.text('ENA'), findsOneWidget);
    expect(find.text('LONG'), findsOneWidget);
    expect(find.text('Tendencial'), findsOneWidget);
    expect(find.text('vence en 57 min'), findsOneWidget);
    expect(find.text('BTC en rango · tendencia 4h alcista'), findsOneWidget);
    expect(find.text('1 : 2.0'), findsOneWidget); // stop -5, objetivo +10 -> riesgo:premio 1:2
  });

  testWidgets('sin precio actual: no muestra ningún aviso de desplazamiento', (tester) async {
    await tester.pumpWidget(wrap(const SignalCard(
      symbol: 'ENA',
      isLong: true,
      strategy: 'Tendencial',
      expiresLabel: 'vence en 57 min',
      entry: 100,
      stop: 95,
      target: 110,
      btcContext: 'BTC en rango',
    )));

    expect(find.textContaining('Desde la señal'), findsNothing);
    expect(find.textContaining('ya recorrió'), findsNothing);
  });

  testWidgets('avance menor al 30%: aviso informativo, no de advertencia', (tester) async {
    // entrada 100, objetivo 110, precio 102 -> avance 20%
    await tester.pumpWidget(wrap(const SignalCard(
      symbol: 'ENA',
      isLong: true,
      strategy: 'Tendencial',
      expiresLabel: 'vence en 57 min',
      entry: 100,
      stop: 95,
      target: 110,
      currentPrice: 102,
      btcContext: 'BTC en rango',
    )));

    expect(find.textContaining('Desde la señal'), findsOneWidget);
    expect(find.textContaining('20% del camino al objetivo'), findsOneWidget);
    expect(find.textContaining('ya recorrió'), findsNothing);
  });

  testWidgets('avance de 30% o más: aviso de advertencia con la relación efectiva', (tester) async {
    // entrada 100, objetivo 110, stop 95, precio 105 -> avance 50%, riesgo restante 10, premio restante 5 -> 1:0.5
    await tester.pumpWidget(wrap(const SignalCard(
      symbol: 'ZEC',
      isLong: true,
      strategy: 'Macro Breakout',
      expiresLabel: 'vence en 38 min',
      entry: 100,
      stop: 95,
      target: 110,
      currentPrice: 105,
      btcContext: 'BTC en rango',
    )));

    expect(find.textContaining('ya recorrió el 50%'), findsOneWidget);
    expect(find.textContaining('1 : 0.5'), findsOneWidget);
  });

  testWidgets('Descartar y Revisar y operar disparan sus callbacks', (tester) async {
    var discarded = false;
    var traded = false;
    await tester.pumpWidget(wrap(SignalCard(
      symbol: 'ENA',
      isLong: true,
      strategy: 'Tendencial',
      expiresLabel: 'vence en 57 min',
      entry: 100,
      stop: 95,
      target: 110,
      btcContext: 'BTC en rango',
      onDiscard: () => discarded = true,
      onTrade: () => traded = true,
    )));

    await tester.tap(find.text('Descartar'));
    await tester.tap(find.text('Revisar y operar'));
    expect(discarded, isTrue);
    expect(traded, isTrue);
  });

  testWidgets('sin margen (canTrade false): el botón muestra el motivo y no dispara onTrade', (tester) async {
    var traded = false;
    await tester.pumpWidget(wrap(SignalCard(
      symbol: 'ENA',
      isLong: true,
      strategy: 'Tendencial',
      expiresLabel: 'vence en 57 min',
      entry: 100,
      stop: 95,
      target: 110,
      btcContext: 'BTC en rango',
      canTrade: false,
      cannotTradeReason: 'Sin margen disponible',
      onTrade: () => traded = true,
    )));

    expect(find.text('Sin margen disponible'), findsOneWidget);
    await tester.tap(find.text('Sin margen disponible'), warnIfMissed: false);
    expect(traded, isFalse);
  });
}
