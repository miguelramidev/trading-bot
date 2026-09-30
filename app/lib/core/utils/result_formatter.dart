/// `—` para cualquier dato nulo o no calculable. Función propia (en vez de un
/// `??` disperso por las pantallas) para que sea consistente y fácil de
/// encontrar: nunca se muestra un valor por defecto (`?? 0`, `?? 1`) como si
/// fuera un dato real.
String fmtMissing([String placeholder = '—']) => placeholder;

/// Formatea un resultado en USDT con signo tipográfico explícito
/// (`+$0.08`, `−$0.32`); cero sin signo (`$0.00`). Con `signed: false` (para
/// balances, nunca resultados) tampoco antepone signo a los positivos.
String fmtUsd(double? value, {bool signed = true}) {
  if (value == null) return fmtMissing();
  final abs = value.abs().toStringAsFixed(2);
  if (!signed || value == 0) return '\$$abs';
  return value > 0 ? '+\$$abs' : '−\$$abs'; // signo menos tipográfico (−), no un guion
}

/// Formatea un porcentaje de resultado con signo (`+0.24%`, `−1.50%`); cero
/// sin signo (`0.00%`).
String fmtPct(double? value) {
  if (value == null) return fmtMissing();
  final abs = value.abs().toStringAsFixed(2);
  if (value == 0) return '$abs%';
  return value > 0 ? '+$abs%' : '−$abs%';
}
