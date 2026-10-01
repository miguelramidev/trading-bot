import 'package:flutter_test/flutter_test.dart';
import 'package:app/screens/history/history_row_data.dart';

void main() {
  test('parsea una fila ejecutada completa', () {
    final row = HistoryRowData.fromTrade({
      'id': 17,
      'symbol': 'ENA/USDT:USDT',
      'direction': 'LONG',
      'strategy': 'Tendencial',
      'entryPrice': '0.6121',
      'exitPrice': '0.6255',
      'status': 'TP HIT',
      'pnl': 0.5,
      'roi': 1.43,
      'date': '2026-09-29T22:31:00.000Z',
      'leverage': 2,
    });
    expect(row.id, 17);
    expect(row.symbol, 'ENA/USDT:USDT');
    expect(row.isLong, isTrue);
    expect(row.pnl, 0.5);
    expect(row.isDiscarded, isFalse);
    expect(row.leverage, 2);
  });

  test('una fila descartada se marca isDiscarded', () {
    final row = HistoryRowData.fromTrade({'status': 'DESCARTADO', 'pnl': 0, 'roi': 0});
    expect(row.isDiscarded, isTrue);
  });

  test('campos faltantes caen a valores seguros, nunca revienta', () {
    final row = HistoryRowData.fromTrade({});
    expect(row.id, isNull);
    expect(row.symbol, '—');
    expect(row.isLong, isFalse);
    expect(row.pnl, isNull);
    expect(row.date, isNull);
    expect(row.isDiscarded, isTrue); // sin status -> default DESCARTADO
  });
}
