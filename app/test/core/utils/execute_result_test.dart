// Cubre los 4 estados de "resultado" de POST /execute, el fallback a
// "status" para un backend viejo, un valor desconocido, y el caso de
// timeout/error de red/respuesta no parseable.

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:toastification/toastification.dart';

import 'package:app/core/utils/execute_result.dart';

Widget _harness(void Function(BuildContext) onPressed) {
  return ToastificationWrapper(
    child: MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => ElevatedButton(
            onPressed: () => onPressed(context),
            child: const Text('go'),
          ),
        ),
      ),
    ),
  );
}

void main() {
  group('parseExecuteResult', () {
    test('resultado: ejecutado', () {
      expect(parseExecuteResult({'resultado': 'ejecutado'}), ExecuteResult.ejecutado);
    });

    test('resultado: rechazado', () {
      expect(parseExecuteResult({'resultado': 'rechazado'}), ExecuteResult.rechazado);
    });

    test('resultado: advertencia', () {
      expect(parseExecuteResult({'resultado': 'advertencia'}), ExecuteResult.advertencia);
    });

    test('resultado: critico', () {
      expect(parseExecuteResult({'resultado': 'critico'}), ExecuteResult.critico);
    });

    test('resultado desconocido cae en advertencia, nunca en rechazado', () {
      // Un valor que no reconocemos no debe hacernos suponer que no hay
      // posición abierta: ese es justamente el supuesto peligroso.
      expect(parseExecuteResult({'resultado': 'algo_nuevo_del_backend'}), ExecuteResult.advertencia);
    });

    test('sin "resultado", status success cae en ejecutado (backend viejo)', () {
      expect(parseExecuteResult({'status': 'success'}), ExecuteResult.ejecutado);
    });

    test('sin "resultado", status error cae en rechazado (backend viejo)', () {
      expect(parseExecuteResult({'status': 'error'}), ExecuteResult.rechazado);
    });
  });

  group('showExecuteResult', () {
    // El texto del toast vive dentro de un Offstage interno de `toastification`
    // (usado para medir tamaño), por eso hace falta skipOffstage: false. Después
    // de comprobar, se drena el timer de auto-cierre para no terminar el test
    // con un Timer pendiente.
    testWidgets('ejecutado muestra un toast', (tester) async {
      await tester.pumpWidget(_harness((ctx) => showExecuteResult(ctx, ExecuteResult.ejecutado, '¡Trade ejecutado en Binance!')));
      await tester.tap(find.text('go'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('¡Trade ejecutado en Binance!', skipOffstage: false), findsOneWidget);
      await tester.pump(const Duration(seconds: 5));
    });

    testWidgets('rechazado muestra un toast', (tester) async {
      await tester.pumpWidget(_harness((ctx) => showExecuteResult(ctx, ExecuteResult.rechazado, 'Rechazado: minNotional no cubierto')));
      await tester.tap(find.text('go'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('Rechazado: minNotional no cubierto', skipOffstage: false), findsOneWidget);
      await tester.pump(const Duration(seconds: 5));
    });

    testWidgets('advertencia muestra un toast', (tester) async {
      await tester.pumpWidget(_harness((ctx) => showExecuteResult(ctx, ExecuteResult.advertencia, 'Falló el TP, el SL quedó puesto')));
      await tester.tap(find.text('go'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('Falló el TP, el SL quedó puesto', skipOffstage: false), findsOneWidget);
      await tester.pump(const Duration(seconds: 7));
    });

    testWidgets('critico muestra un diálogo modal que no se cierra solo ni tocando afuera', (tester) async {
      await tester.pumpWidget(_harness((ctx) => showExecuteResult(ctx, ExecuteResult.critico, 'Falló el SL y también el cierre de emergencia')));
      await tester.tap(find.text('go'));
      await tester.pumpAndSettle();

      expect(find.text('Alerta crítica'), findsOneWidget);
      expect(find.textContaining('Falló el SL y también el cierre de emergencia'), findsOneWidget);

      // barrierDismissible: false — tocar afuera no lo cierra.
      await tester.tapAt(const Offset(5, 5));
      await tester.pumpAndSettle();
      expect(find.text('Alerta crítica'), findsOneWidget);

      // Solo se cierra tocando el botón "Entendido".
      await tester.tap(find.text('Entendido'));
      await tester.pumpAndSettle();
      expect(find.text('Alerta crítica'), findsNothing);
    });
  });

  group('cierre automático del toast — bug real: se quedaba pegado con el mouse encima', () {
    // `toastification` pausa el cierre automático mientras el mouse está
    // arriba del toast por default (`pauseOnHover: true`) — justo después de
    // tocar "Confirmar" en el modal de ejecutar, el mouse suele quedar cerca
    // de donde aparece el toast, y si no se mueve, nunca se cerraba solo
    // (había que recargar la página). `AppToast` ahora pasa
    // `pauseOnHover: false` explícitamente: este test simula el mouse
    // quedando apoyado arriba del toast y comprueba que igual se cierra solo.
    testWidgets('con el mouse encima todo el tiempo, el toast de éxito igual se cierra solo', (tester) async {
      await tester.pumpWidget(_harness((ctx) => showExecuteResult(ctx, ExecuteResult.ejecutado, 'listo')));
      await tester.tap(find.text('go'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      final toastFinder = find.text('listo', skipOffstage: false);
      expect(toastFinder, findsOneWidget);

      final gesture = await tester.createGesture(kind: PointerDeviceKind.mouse);
      addTearDown(gesture.removePointer);
      await gesture.addPointer(location: tester.getCenter(toastFinder));
      await tester.pump();

      // autoCloseDuration de "ejecutado" es 4s — con margen de sobra.
      await tester.pump(const Duration(seconds: 5));

      expect(find.text('listo', skipOffstage: false), findsNothing);
    });

    testWidgets('con el mouse encima todo el tiempo, el toast de advertencia igual se cierra solo', (tester) async {
      await tester.pumpWidget(_harness((ctx) => showExecuteResult(ctx, ExecuteResult.advertencia, 'ojo')));
      await tester.tap(find.text('go'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      final toastFinder = find.text('ojo', skipOffstage: false);
      final gesture = await tester.createGesture(kind: PointerDeviceKind.mouse);
      addTearDown(gesture.removePointer);
      await gesture.addPointer(location: tester.getCenter(toastFinder));
      await tester.pump();

      // autoCloseDuration de "advertencia" es 6s.
      await tester.pump(const Duration(seconds: 7));

      expect(find.text('ojo', skipOffstage: false), findsNothing);
    });
  });

  testWidgets('timeout/error de red/respuesta no parseable muestra advertencia, nunca rechazado', (tester) async {
    await tester.pumpWidget(_harness((ctx) => showUnconfirmedExecuteWarning(ctx)));
    await tester.tap(find.text('go'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.textContaining('No se pudo confirmar el resultado', skipOffstage: false), findsOneWidget);
    expect(find.textContaining('Rechazado'), findsNothing);
    await tester.pump(const Duration(seconds: 7));
  });
}
