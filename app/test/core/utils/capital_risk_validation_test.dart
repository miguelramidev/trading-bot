import 'package:flutter_test/flutter_test.dart';
import 'package:app/core/utils/capital_risk_validation.dart';

void main() {
  const valid = (montoOperacion: 35.0, maxTrades: 5, leverageMin: 1, leverageMax: 2);

  test('configuración válida -> null', () {
    expect(validateCapitalRisk(montoOperacion: valid.montoOperacion, maxTrades: valid.maxTrades, leverageMin: valid.leverageMin, leverageMax: valid.leverageMax), isNull);
  });

  test('montoOperacion cero o negativo se rechaza', () {
    expect(validateCapitalRisk(montoOperacion: 0, maxTrades: 5, leverageMin: 1, leverageMax: 2), isNotNull);
    expect(validateCapitalRisk(montoOperacion: -5, maxTrades: 5, leverageMin: 1, leverageMax: 2), isNotNull);
  });

  test('montoOperacion con 2 decimales se acepta, con 3 se rechaza', () {
    expect(validateCapitalRisk(montoOperacion: 35.55, maxTrades: 5, leverageMin: 1, leverageMax: 2), isNull);
    expect(validateCapitalRisk(montoOperacion: 35.555, maxTrades: 5, leverageMin: 1, leverageMax: 2), isNotNull);
  });

  test('maxTrades fuera de 1-10 se rechaza', () {
    expect(validateCapitalRisk(montoOperacion: 35, maxTrades: 0, leverageMin: 1, leverageMax: 2), isNotNull);
    expect(validateCapitalRisk(montoOperacion: 35, maxTrades: 11, leverageMin: 1, leverageMax: 2), isNotNull);
    expect(validateCapitalRisk(montoOperacion: 35, maxTrades: 10, leverageMin: 1, leverageMax: 2), isNull);
  });

  test('leverageMin/leverageMax fuera de 1-10 se rechazan', () {
    expect(validateCapitalRisk(montoOperacion: 35, maxTrades: 5, leverageMin: 0, leverageMax: 2), isNotNull);
    expect(validateCapitalRisk(montoOperacion: 35, maxTrades: 5, leverageMin: 1, leverageMax: 11), isNotNull);
  });

  test('leverageMin > leverageMax se rechaza', () {
    final error = validateCapitalRisk(montoOperacion: 35, maxTrades: 5, leverageMin: 8, leverageMax: 5);
    expect(error, isNotNull);
    expect(error, contains('mínimo'));
  });

  test('leverageMin == leverageMax se acepta', () {
    expect(validateCapitalRisk(montoOperacion: 35, maxTrades: 5, leverageMin: 5, leverageMax: 5), isNull);
  });
}
