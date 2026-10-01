import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:app/widgets/signal_card.dart';
import 'package:app/widgets/callout.dart';
import 'package:app/core/utils/signal_warnings.dart';

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

  group('estrategia + motivo (texto simple, no es una advertencia)', () {
    testWidgets('con motivo: "Estrategia · Motivo"', (tester) async {
      await tester.pumpWidget(wrap(const SignalCard(
        symbol: 'ENA',
        isLong: true,
        strategy: 'Tendencial',
        motivo: 'MACD Zero-Cross a favor de EMA 200',
        expiresLabel: 'vence en 57 min',
        entry: 100,
        stop: 95,
        target: 110,
        btcContext: 'BTC: tendencial (ADX 27.50)',
      )));

      expect(find.text('Tendencial · MACD Zero-Cross a favor de EMA 200'), findsOneWidget);
    });

    testWidgets('sin motivo: solo la estrategia', (tester) async {
      await tester.pumpWidget(wrap(const SignalCard(
        symbol: 'ENA',
        isLong: true,
        strategy: 'Tendencial',
        expiresLabel: 'vence en 57 min',
        entry: 100,
        stop: 95,
        target: 110,
        btcContext: 'BTC: rango (ADX 16.18)',
      )));

      expect(find.text('Tendencial'), findsOneWidget);
    });
  });

  group('advertencias — distinta cantidad por tarjeta', () {
    testWidgets('sin advertencias: ningún Callout', (tester) async {
      await tester.pumpWidget(wrap(const SignalCard(
        symbol: 'ENA',
        isLong: true,
        strategy: 'Tendencial',
        expiresLabel: 'vence en 57 min',
        entry: 100,
        stop: 95,
        target: 110,
        btcContext: 'BTC: rango (ADX 16.18)',
      )));

      expect(find.byType(Callout), findsNothing);
    });

    testWidgets('una advertencia: un Callout con título corto y detalle en una sola línea', (tester) async {
      await tester.pumpWidget(wrap(SignalCard(
        symbol: 'ENA',
        isLong: true,
        strategy: 'Tendencial',
        expiresLabel: 'vence en 57 min',
        entry: 100,
        stop: 95,
        target: 110,
        btcContext: 'BTC: rango (ADX 16.18)',
        warnings: const [
          SignalWarning(type: 'veto_proteccion', severity: SignalWarningSeverity.warning, title: 'VETO DE PROTECCIÓN', detail: 'texto largo de detalle'),
        ],
      )));

      expect(find.byType(Callout), findsOneWidget);
      expect(find.text('VETO DE PROTECCIÓN'), findsOneWidget);
      final callout = tester.widget<Callout>(find.byType(Callout));
      expect(callout.maxLines, 1); // una sola línea en la tarjeta
    });

    testWidgets('varias advertencias: un Callout por cada una, ordenadas con "high" primero', (tester) async {
      await tester.pumpWidget(wrap(SignalCard(
        symbol: 'ENA',
        isLong: true,
        strategy: 'Tendencial',
        expiresLabel: 'vence en 57 min',
        entry: 100,
        stop: 95,
        target: 110,
        btcContext: 'BTC: rango (ADX 16.18)',
        warnings: const [
          SignalWarning(type: 'alineacion_macro', severity: SignalWarningSeverity.positive, title: 'Alineación Macro', detail: 'detalle'),
          SignalWarning(type: 'alerta_caida_brusca', severity: SignalWarningSeverity.high, title: 'ALERTA DE CAÍDA BRUSCA', detail: 'detalle'),
        ],
      )));

      expect(find.byType(Callout), findsNWidgets(2));
      final callouts = tester.widgetList<Callout>(find.byType(Callout)).toList();
      expect(callouts[0].variant, CalloutVariant.high); // reordenada antes que "positive"
      expect(callouts[1].variant, CalloutVariant.positive);
    });
  });

  group('Regla 5 — stop demasiado ajustado (menor al 0.5%)', () {
    testWidgets('stop a 0.15% de la entrada: aviso + botón deshabilitado, no dispara onTrade', (tester) async {
      var traded = false;
      await tester.pumpWidget(wrap(SignalCard(
        symbol: 'ENA',
        isLong: true,
        strategy: 'Tendencial',
        expiresLabel: 'vence en 57 min',
        entry: 100,
        stop: 99.85, // 0.15% de distancia, por debajo del 0.5% mínimo
        target: 110,
        btcContext: 'BTC: rango (ADX 16.18)',
        onTrade: () => traded = true,
      )));

      expect(find.text('Stop demasiado ajustado'), findsWidgets); // título del Callout y texto del botón
      await tester.tap(find.text('Stop demasiado ajustado').first, warnIfMissed: false);
      expect(traded, isFalse);
    });

    testWidgets('stop al 0.5% exacto: no es "demasiado ajustado" (límite no inclusivo)', (tester) async {
      var traded = false;
      await tester.pumpWidget(wrap(SignalCard(
        symbol: 'ENA',
        isLong: true,
        strategy: 'Tendencial',
        expiresLabel: 'vence en 57 min',
        entry: 100,
        stop: 99.5, // exactamente 0.5%
        target: 110,
        btcContext: 'BTC: rango (ADX 16.18)',
        onTrade: () => traded = true,
      )));

      expect(find.text('Stop demasiado ajustado'), findsNothing);
      await tester.tap(find.text('Revisar y operar'));
      expect(traded, isTrue);
    });

    testWidgets('stop a una distancia normal: sin aviso, botón habilitado', (tester) async {
      await tester.pumpWidget(wrap(const SignalCard(
        symbol: 'ENA',
        isLong: true,
        strategy: 'Tendencial',
        expiresLabel: 'vence en 57 min',
        entry: 100,
        stop: 95,
        target: 110,
        btcContext: 'BTC: rango (ADX 16.18)',
      )));

      expect(find.text('Stop demasiado ajustado'), findsNothing);
      expect(find.text('Revisar y operar'), findsOneWidget);
    });
  });
}
