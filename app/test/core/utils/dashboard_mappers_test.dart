import 'package:flutter_test/flutter_test.dart';
import 'package:app/core/utils/dashboard_mappers.dart';
import 'package:app/widgets/status_pill.dart';

void main() {
  group('statusPillVariantFromKey', () {
    test('mapea cada clave conocida', () {
      expect(statusPillVariantFromKey('objetivo'), StatusPillVariant.objetivo);
      expect(statusPillVariantFromKey('stop'), StatusPillVariant.stop);
      expect(statusPillVariantFromKey('enCurso'), StatusPillVariant.enCurso);
      expect(statusPillVariantFromKey('pendiente'), StatusPillVariant.pendiente);
      expect(statusPillVariantFromKey('descartada'), StatusPillVariant.descartada);
    });

    test('clave desconocida o null -> descartada (nunca revienta)', () {
      expect(statusPillVariantFromKey('algo-nuevo'), StatusPillVariant.descartada);
      expect(statusPillVariantFromKey(null), StatusPillVariant.descartada);
    });
  });

  group('isLongDirection', () {
    test('LONG en mayúsculas o minúsculas -> true', () {
      expect(isLongDirection('LONG'), isTrue);
      expect(isLongDirection('long'), isTrue);
    });

    test('SHORT o null -> false', () {
      expect(isLongDirection('SHORT'), isFalse);
      expect(isLongDirection(null), isFalse);
    });
  });

  group('computeSignalExpiry', () {
    final now = DateTime(2026, 9, 30, 12, 0, 0);

    test('recién creada -> vence en 60 min, no soon', () {
      final e = computeSignalExpiry(now, now: now);
      expect(e.label, 'vence en 60 min');
      expect(e.soon, isFalse);
      expect(e.expired, isFalse);
    });

    test('a los 50 min transcurridos -> quedan 10, soon', () {
      final e = computeSignalExpiry(now.subtract(const Duration(minutes: 50)), now: now);
      expect(e.label, 'vence en 10 min');
      expect(e.soon, isTrue);
      expect(e.expired, isFalse);
    });

    test('exactamente a los 60 min -> vencida', () {
      final e = computeSignalExpiry(now.subtract(const Duration(minutes: 60)), now: now);
      expect(e.expired, isTrue);
      expect(e.label, 'Vencida');
    });

    test('más allá de los 60 min -> vencida', () {
      final e = computeSignalExpiry(now.subtract(const Duration(minutes: 90)), now: now);
      expect(e.expired, isTrue);
    });
  });
}
