import 'package:flutter_test/flutter_test.dart';
import 'package:app/core/utils/strategy_name.dart';

void main() {
  test('mapea los 4 números de estrategia según CONTEXT.md', () {
    expect(strategyName('1'), 'Tendencial');
    expect(strategyName('2'), 'Rango');
    expect(strategyName('3'), 'Macro Breakout');
    expect(strategyName('4'), 'Cazador de Liquidez');
  });

  test('un texto que ya es un nombre legible se devuelve tal cual', () {
    expect(strategyName('Tendencial'), 'Tendencial');
    expect(strategyName('Macro Breakout'), 'Macro Breakout');
  });

  test('un número desconocido se devuelve crudo, nunca se inventa un nombre', () {
    expect(strategyName('7'), '7');
  });

  test('null o vacío -> —', () {
    expect(strategyName(null), '—');
    expect(strategyName(''), '—');
  });
}
