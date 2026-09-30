import 'package:flutter_test/flutter_test.dart';
import 'package:app/core/utils/datetime_formatter.dart';

void main() {
  group('fmtDataTime', () {
    test('null -> —', () {
      expect(fmtDataTime(null), '—');
    });

    test('formatea HH:MM en hora local, con ceros a la izquierda', () {
      final dt = DateTime(2026, 9, 30, 9, 5);
      expect(fmtDataTime(dt), 'Datos de las 09:05');
    });

    test('mediodía y medianoche', () {
      expect(fmtDataTime(DateTime(2026, 9, 30, 12, 0)), 'Datos de las 12:00');
      expect(fmtDataTime(DateTime(2026, 9, 30, 0, 0)), 'Datos de las 00:00');
    });
  });
}
