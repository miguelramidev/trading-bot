import 'package:flutter_test/flutter_test.dart';
import 'package:app/screens/history/history_mappers.dart';
import 'package:app/widgets/status_pill.dart';

void main() {
  test('mapea cada status conocido del historial', () {
    expect(statusPillVariantForHistory('TP HIT'), StatusPillVariant.objetivo);
    expect(statusPillVariantForHistory('SL HIT'), StatusPillVariant.stop);
    expect(statusPillVariantForHistory('DESCARTADO'), StatusPillVariant.descartada);
  });

  test('status desconocido o null -> descartada (nunca revienta)', () {
    expect(statusPillVariantForHistory('ALGO_NUEVO'), StatusPillVariant.descartada);
    expect(statusPillVariantForHistory(null), StatusPillVariant.descartada);
  });
}
