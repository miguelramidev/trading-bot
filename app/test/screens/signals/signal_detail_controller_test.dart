import 'package:flutter_test/flutter_test.dart';
import 'package:app/screens/signals/signal_detail_controller.dart';

void main() {
  // La carga de config de usuario y el backfill de contexto llaman a
  // ApiClient (red real), pero esas llamadas están en sus propios
  // try/catch internos — no deberían tirar al construir el controller.
  // Estos tests solo miran los getters síncronos que no dependen de que
  // esas llamadas terminen.

  group('entry — shapes distintos según de dónde se navegó', () {
    test('señal pendiente del Inicio: columna "entry"', () {
      final c = SignalDetailController({'entry': '100.5'});
      expect(c.entry, 100.5);
    });

    test('desde posición/historial: "entryPrice" (nombre de la respuesta HTTP)', () {
      final c = SignalDetailController({'entryPrice': '100.5'});
      expect(c.entry, 100.5);
    });

    test('sin ninguno de los dos -> 0, no revienta', () {
      final c = SignalDetailController({});
      expect(c.entry, 0);
    });
  });

  group('evaluatedAt — shapes distintos', () {
    test('señal pendiente: "evaluatedAt"', () {
      final c = SignalDetailController({'evaluatedAt': '2026-09-30T12:00:00.000Z'});
      expect(c.evaluatedAt, isNotNull);
    });

    test('desde historial: "date" (el historial no manda "evaluatedAt")', () {
      final c = SignalDetailController({'date': '2026-09-30T12:00:00.000Z'});
      expect(c.evaluatedAt, isNotNull);
    });
  });

  group('strategy', () {
    test('un número de estrategia se traduce con strategyName()', () {
      final c = SignalDetailController({'strategy': '1'});
      expect(c.strategy, 'Tendencial');
    });

    test('sin strategy ni regime -> —', () {
      final c = SignalDetailController({});
      expect(c.strategy, '—');
    });
  });
}
