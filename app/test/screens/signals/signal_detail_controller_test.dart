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

  group('currentPrice — "Último precio" nunca sale del close de una vela', () {
    test('si el mapa trae "currentPrice" (del Inicio, de fetchTickers), se usa de entrada, antes de cualquier red', () {
      // Antes del fix, `currentPrice` arrancaba en null y solo se setaba
      // cuando el gráfico terminaba de cargar la pestaña 15m con el close de
      // la última vela CERRADA — para una señal recién generada esa vela es
      // la MISMA que la originó, así que el desplazamiento daba 0% y
      // "llegás tarde" nunca podía aparecer (bug real, confirmado con datos
      // reales 2026-10-01). Ahora el controller ya no tiene ningún camino
      // que dependa del gráfico para esto — lo prueba este mismo test: el
      // valor está disponible de inmediato, de forma síncrona, sin esperar
      // ningún gráfico ni ninguna pestaña.
      final c = SignalDetailController({'currentPrice': 103.5});
      expect(c.currentPrice, 103.5);
    });

    test('sin "currentPrice" en el mapa original, arranca en null (lo completa el ticker en vivo, async)', () {
      final c = SignalDetailController({});
      expect(c.currentPrice, isNull);
    });

    test('setCurrentPrice (usado por el ticker en vivo) actualiza el precio y la hora', () {
      final c = SignalDetailController({});
      c.setCurrentPrice(99.9);
      expect(c.currentPrice, 99.9);
      expect(c.priceUpdatedAt, isNotNull);
    });
  });

  group('isExecuting — el estado de carga siempre se reinicia (lo usan los finally de performTrade/performDiscard)', () {
    test('arranca en false', () {
      final c = SignalDetailController({});
      expect(c.isExecuting, isFalse);
    });

    test('se puede poner en true y volver a false (camino feliz y camino de error pasan por acá)', () {
      final c = SignalDetailController({});
      c.setExecuting(true);
      expect(c.isExecuting, isTrue);
      c.setExecuting(false);
      expect(c.isExecuting, isFalse);
    });
  });

  group('isLate — "llegás tarde" según el precio EN VIVO, al 30% del camino (kSignalLateThreshold)', () {
    test('LONG: precio en vivo al 30% exacto del camino a el objetivo -> llegás tarde', () {
      final c = SignalDetailController({'entry': '100', 'takeProfit': '110', 'direction': 'LONG'});
      c.setCurrentPrice(103); // (103-100)/(110-100) = 0.30
      expect(c.isLate, isTrue);
    });

    test('LONG: precio en vivo apenas por debajo del 30% -> todavía no', () {
      final c = SignalDetailController({'entry': '100', 'takeProfit': '110', 'direction': 'LONG'});
      c.setCurrentPrice(102);
      expect(c.isLate, isFalse);
    });

    test('sin precio todavía (ni del Inicio ni del ticker resuelto) -> nunca "llegás tarde" en silencio', () {
      final c = SignalDetailController({'entry': '100', 'takeProfit': '110', 'direction': 'LONG'});
      expect(c.isLate, isFalse);
    });
  });

  group('warnings — Fase 1 (bug real: se escondían detrás de "wasExecuted")', () {
    test('una señal pendiente con "warnings" estructurado las expone', () {
      final c = SignalDetailController({
        'warnings': [
          {'type': 'riesgo_macro', 'severity': 'high', 'text': 'Riesgo Macro (VETO)'},
        ],
      });
      expect(c.warnings, hasLength(1));
      expect(c.highSeverityWarnings, hasLength(1));
    });

    test('sin "warnings" pero con "reason" (señal vieja) cae a parsearlo por viñetas', () {
      final c = SignalDetailController({'reason': '• 🚨 ALERTA DE CAÍDA BRUSCA: texto'});
      expect(c.warnings, hasLength(1));
      expect(c.highSeverityWarnings, hasLength(1));
    });

    test('la advertencia se conserva después de "ejecutar" (decision pasa a Tomada): no depende de wasExecuted', () {
      // Simula el shape que llega una vez que la señal ya se ejecutó
      // (`decision` empieza con "Tomada") — antes de este fix, la única
      // sección que mostraba el `reason` quedaba gateada por `wasExecuted`,
      // así que las advertencias desaparecían exactamente en este caso.
      final c = SignalDetailController({
        'decision': 'Tomada',
        'warnings': [
          {'type': 'alerta_caida_brusca', 'severity': 'high', 'text': 'Alerta de caída'},
        ],
      });
      expect(c.wasExecuted, isTrue);
      expect(c.warnings, hasLength(1)); // sigue ahí, "warnings" no se gatea por wasExecuted
    });

    test('sin advertencias de ningún tipo -> lista vacía, no revienta', () {
      final c = SignalDetailController({});
      expect(c.warnings, isEmpty);
      expect(c.highSeverityWarnings, isEmpty);
    });
  });
}
