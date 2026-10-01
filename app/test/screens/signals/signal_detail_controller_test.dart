import 'package:flutter_test/flutter_test.dart';
import 'package:app/screens/signals/signal_detail_controller.dart';
import 'package:app/core/utils/signal_status.dart';

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

  group('status — lee decision/isActiveTrade del shape que llegue (3 formatos de origen)', () {
    test('caso real WIF: decision "Tomada -> Cerrada (TP Tocado)" ya en el mapa original -> terminada, no expirada', () {
      // Los 3 orígenes (pendiente del Inicio, posición abierta, Historial)
      // ahora mandan `decision`/`isActiveTrade` directamente (ver
      // DashboardController/HistoryController) — el bug real era que el
      // getter leía del mapa `signal` crudo en vez de `_resolved` (la copia
      // que además se completa con el backfill de /api/history/:id);
      // ambos deben coincidir apenas se construye el controller.
      final c = SignalDetailController({
        'decision': 'Tomada -> Cerrada (TP Tocado)',
        'isActiveTrade': false,
        'date': '2026-10-01T11:46:23.923Z',
      });
      expect(c.status, SignalDetailStatus.terminada);
    });

    test('posición activa (decision "Tomada", isActiveTrade true) -> activa', () {
      final c = SignalDetailController({
        'decision': 'Tomada',
        'isActiveTrade': true,
        'evaluatedAt': '2026-10-01T11:46:23.923Z',
      });
      expect(c.status, SignalDetailStatus.activa);
    });

    test('señal pendiente (sin decision) y reciente -> pendiente', () {
      final c = SignalDetailController({'evaluatedAt': DateTime.now().toIso8601String()});
      expect(c.status, SignalDetailStatus.pendiente);
    });
  });

  group('wasExecuted', () {
    test('decision empieza con "Tomada" -> true', () {
      final c = SignalDetailController({'decision': 'Tomada -> Cerrada (TP Tocado)'});
      expect(c.wasExecuted, isTrue);
    });

    test('decision "Descartada" -> false', () {
      final c = SignalDetailController({'decision': 'Descartada'});
      expect(c.wasExecuted, isFalse);
    });

    test('sin decision (pendiente) -> false', () {
      final c = SignalDetailController({});
      expect(c.wasExecuted, isFalse);
    });
  });
}
