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

/// Índice de la vela que disparó la señal (la última CERRADA al momento de
/// evaluar, como hace `analyze.ts` — nunca la que simplemente "contiene"
/// `targetMs`, que suele ser la vela siguiente todavía en curso en ese
/// momento). Punto de partida: `boundary - intervalMs`, donde `boundary` es
/// el inicio del intervalo que contiene `targetMs`. Ese candidato se verifica
/// contra `expectedAdx` (con `adxTolerance` por redondeo); si no coincide se
/// prueba con la vela anterior; si ninguna de las dos coincide, se devuelve
/// `null` en vez de arriesgarse a marcar la vela equivocada (nunca adivinar).
///
/// Si no hay `adxValues`/`expectedAdx` para verificar (dato no disponible),
/// se usa el candidato principal sin verificación.
int? findSignalCandleIndex({
  required List<int> openTimesMs,
  required int targetMs,
  required int intervalMs,
  List<double>? adxValues,
  double? expectedAdx,
  double adxTolerance = 0.05,
}) {
  if (openTimesMs.isEmpty) return null;

  final boundary = (targetMs ~/ intervalMs) * intervalMs;
  final candidateMs = boundary - intervalMs;

  int? indexOfOpen(int openMs) {
    final idx = openTimesMs.indexOf(openMs);
    return idx >= 0 ? idx : null;
  }

  bool matchesAdx(int index) {
    if (adxValues == null || expectedAdx == null) return true;
    if (index < 0 || index >= adxValues.length) return false;
    return (adxValues[index] - expectedAdx).abs() <= adxTolerance;
  }

  final primaryIndex = indexOfOpen(candidateMs);
  if (primaryIndex != null && matchesAdx(primaryIndex)) return primaryIndex;

  final fallbackIndex = indexOfOpen(candidateMs - intervalMs);
  if (fallbackIndex != null && matchesAdx(fallbackIndex)) return fallbackIndex;

  return null;
}
