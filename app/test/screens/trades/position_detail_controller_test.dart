import 'package:flutter_test/flutter_test.dart';
import 'package:app/screens/trades/position_detail_controller.dart';

void main() {
  group('isLong', () {
    test('lee "side" (posición abierta, de /api/dashboard)', () {
      final c = PositionDetailController({'side': 'long'}, isClosed: true);
      expect(c.isLong, isTrue);
      final s = PositionDetailController({'side': 'short'}, isClosed: true);
      expect(s.isLong, isFalse);
    });

    test('sin "side", cae a "direction" (trade cerrado, de /api/history)', () {
      final c = PositionDetailController({'direction': 'LONG'}, isClosed: true);
      expect(c.isLong, isTrue);
      final s = PositionDetailController({'direction': 'SHORT'}, isClosed: true);
      expect(s.isLong, isFalse);
    });
  });

  group('entry / lastPrice — shapes distintos entre abierta y cerrada', () {
    test('posición abierta: entryPrice / markPrice', () {
      final c = PositionDetailController({'entryPrice': '100.5', 'markPrice': '103.2'}, isClosed: false);
      expect(c.entry, 100.5);
      expect(c.lastPrice, 103.2);
    });

    test('trade cerrado: entry / executedExitPrice', () {
      final c = PositionDetailController({'entry': '100.5', 'executedExitPrice': '110.0'}, isClosed: true);
      expect(c.entry, 100.5);
      expect(c.lastPrice, 110.0);
    });

    test('sin precio de salida conocido, lastPrice cae a entry', () {
      final c = PositionDetailController({'entry': '100.5'}, isClosed: true);
      expect(c.lastPrice, 100.5);
    });
  });

  group('pnlUsd / pnlPct', () {
    test('abierta: unrealizedPnl / percentage', () {
      final c = PositionDetailController({'unrealizedPnl': 4.2, 'percentage': 1.5}, isClosed: false);
      expect(c.pnlUsd, 4.2);
      expect(c.pnlPct, 1.5);
    });

    test('cerrada: realizedPnl / realizedRoi', () {
      final c = PositionDetailController({'realizedPnl': '-2.1', 'realizedRoi': '-3.0'}, isClosed: true);
      expect(c.pnlUsd, -2.1);
      expect(c.pnlPct, -3.0);
    });
  });

  group('projection (margen/apalancamiento)', () {
    test('null si falta margen o apalancamiento (siempre el caso en cerradas hoy)', () {
      final c = PositionDetailController({'entry': '100', 'stopLoss': '95', 'takeProfit': '110', 'direction': 'LONG'}, isClosed: true);
      expect(c.projection, isNull);
    });

    test('se calcula si hay margen y apalancamiento (posición abierta)', () {
      final c = PositionDetailController({
        'entryPrice': '100',
        'stopLoss': '95',
        'takeProfit': '110',
        'side': 'long',
        'initialMargin': 35,
        'leverage': 2,
      }, isClosed: false);
      expect(c.projection, isNotNull);
      expect(c.projection!.notionalUsd, 70);
    });
  });

  group('signalId', () {
    test('posición abierta: campo "signalId"', () {
      final c = PositionDetailController({'signalId': 42}, isClosed: false);
      expect(c.signalId, 42);
    });

    test('trade cerrado: el propio "id" de la fila de signal_history', () {
      final c = PositionDetailController({'id': 17}, isClosed: true);
      expect(c.signalId, 17);
    });

    test('sin ninguno de los dos -> null', () {
      final c = PositionDetailController({}, isClosed: true);
      expect(c.signalId, isNull);
    });
  });

  group('stopLossMismatch', () {
    test('false sin datos de protección todavía', () {
      final c = PositionDetailController({'entry': '100', 'stopLoss': '95'}, isClosed: true);
      expect(c.stopLossMismatch, isFalse);
    });
  });
}
