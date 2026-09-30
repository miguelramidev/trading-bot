/// Matemática pura del gráfico de la señal: separada del widget para poder
/// testear la posición de las líneas con precios conocidos, sin renderizar
/// nada (ver `signal_chart_view.dart`).
library;

/// Rango vertical del gráfico: cubre las velas visibles Y siempre incluye el
/// stop y el objetivo (para que sus líneas nunca queden fuera del área
/// dibujada, aunque el precio ya se haya alejado mucho de ellos), con un
/// margen de aire arriba/abajo para que las líneas extremas no queden pegadas
/// al borde.
class ChartYRange {
  final double minY;
  final double maxY;

  const ChartYRange({required this.minY, required this.maxY});
}

ChartYRange computeChartYRange({
  required Iterable<double> lows,
  required Iterable<double> highs,
  required double stop,
  required double target,
  double paddingFraction = 0.06,
}) {
  final allLows = [...lows, stop, target];
  final allHighs = [...highs, stop, target];
  final rawMin = allLows.reduce((a, b) => a < b ? a : b);
  final rawMax = allHighs.reduce((a, b) => a > b ? a : b);
  final span = rawMax - rawMin;
  final pad = span > 0 ? span * paddingFraction : (rawMax.abs() * 0.01).clamp(0.0001, double.infinity);
  return ChartYRange(minY: rawMin - pad, maxY: rawMax + pad);
}

/// Posición vertical (en píxeles, 0 = arriba) de un precio dentro de un
/// área de alto [height], dado el rango [minY]-[maxY] (`minY` abajo,
/// `maxY` arriba, como un gráfico de precios). Se clampea al área: un precio
/// fuera de rango se dibuja pegado al borde en vez de desaparecer.
double priceToChartY(double price, {required double minY, required double maxY, required double height}) {
  if (maxY == minY) return height / 2;
  final fraction = (price - minY) / (maxY - minY);
  final y = height - fraction * height;
  return y.clamp(0.0, height);
}
