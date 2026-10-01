import 'package:flutter_test/flutter_test.dart';
import 'package:app/core/utils/trade_projection.dart';

void main() {
  group('computeTradeProjection', () {
    test('nocional = margen * apalancamiento', () {
      final p = computeTradeProjection(entry: 100, stop: 95, target: 110, marginUsd: 35, leverage: 2, isLong: true, feeRate: 0);
      expect(p.notionalUsd, 70);
    });

    test('LONG: el objetivo da ganancia y el stop da pérdida', () {
      final p = computeTradeProjection(entry: 100, stop: 95, target: 110, marginUsd: 35, leverage: 1, isLong: true, feeRate: 0);
      // positionSize = 35/100 = 0.35
      expect(p.targetResultUsd, closeTo(0.35 * 10, 1e-9)); // (110-100)*0.35
      expect(p.stopResultUsd, closeTo(0.35 * -5, 1e-9)); // (95-100)*0.35
    });

    test('SHORT: el objetivo (precio más bajo) da ganancia y el stop (precio más alto) da pérdida', () {
      final p = computeTradeProjection(entry: 100, stop: 105, target: 90, marginUsd: 35, leverage: 1, isLong: false, feeRate: 0);
      expect(p.targetResultUsd, closeTo(0.35 * 10, 1e-9)); // entry(100) - target(90) = +10
      expect(p.stopResultUsd, closeTo(0.35 * -5, 1e-9)); // entry(100) - stop(105) = -5
    });

    test('la comisión resta magnitud a ambos resultados (ganancia y pérdida)', () {
      final sinComision = computeTradeProjection(entry: 100, stop: 95, target: 110, marginUsd: 35, leverage: 1, isLong: true, feeRate: 0);
      final conComision = computeTradeProjection(entry: 100, stop: 95, target: 110, marginUsd: 35, leverage: 1, isLong: true, feeRate: 0.001);
      final fee = 35 * 0.001;
      expect(conComision.targetResultUsd, closeTo(sinComision.targetResultUsd - fee, 1e-9));
      expect(conComision.stopResultUsd, closeTo(sinComision.stopResultUsd - fee, 1e-9));
    });

    test('mayor apalancamiento agranda el resultado proporcionalmente', () {
      final x1 = computeTradeProjection(entry: 100, stop: 95, target: 110, marginUsd: 35, leverage: 1, isLong: true, feeRate: 0);
      final x2 = computeTradeProjection(entry: 100, stop: 95, target: 110, marginUsd: 35, leverage: 2, isLong: true, feeRate: 0);
      expect(x2.targetResultUsd, closeTo(x1.targetResultUsd * 2, 1e-9));
    });

    test('usa la comisión por defecto si no se pasa feeRate', () {
      final p = computeTradeProjection(entry: 100, stop: 95, target: 110, marginUsd: 35, leverage: 1, isLong: true);
      expect(p.targetResultUsd, lessThan(0.35 * 10));
    });
  });

  group('computeOutcomeFromQuantity — no depende de margen/apalancamiento (bug real: desaparecía sin leverage)', () {
    test('LONG: objetivo da ganancia, stop da pérdida — mismo tamaño real para los dos', () {
      final target = computeOutcomeFromQuantity(quantity: 10, entry: 100, level: 110, isLong: true, feeRate: 0);
      final stop = computeOutcomeFromQuantity(quantity: 10, entry: 100, level: 95, isLong: true, feeRate: 0);
      expect(target, closeTo(10 * 10, 1e-9)); // 10 * (110-100)
      expect(stop, closeTo(10 * -5, 1e-9)); // 10 * (95-100)
    });

    test('SHORT: el objetivo (precio más bajo) da ganancia, el stop (precio más alto) da pérdida', () {
      final target = computeOutcomeFromQuantity(quantity: 10, entry: 100, level: 90, isLong: false, feeRate: 0);
      final stop = computeOutcomeFromQuantity(quantity: 10, entry: 100, level: 105, isLong: false, feeRate: 0);
      expect(target, closeTo(10 * 10, 1e-9)); // entry(100) - level(90) = +10
      expect(stop, closeTo(10 * -5, 1e-9)); // entry(100) - level(105) = -5
    });

    test('la comisión se calcula sobre el nocional (cantidad * entrada), no sobre un margen', () {
      final sinComision = computeOutcomeFromQuantity(quantity: 10, entry: 100, level: 110, isLong: true, feeRate: 0);
      final conComision = computeOutcomeFromQuantity(quantity: 10, entry: 100, level: 110, isLong: true, feeRate: 0.001);
      final notional = 10 * 100; // cantidad * entrada, no margen * apalancamiento
      expect(conComision, closeTo(sinComision - notional * 0.001, 1e-9));
    });

    test('usa la comisión por defecto si no se pasa feeRate', () {
      final result = computeOutcomeFromQuantity(quantity: 10, entry: 100, level: 110, isLong: true);
      expect(result, lessThan(10 * 10));
    });
  });
}
