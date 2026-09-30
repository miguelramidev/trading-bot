/// Cuánto camino recorrió el precio hacia el objetivo desde que se generó la
/// señal, como fracción de la distancia entrada→objetivo. Funciona igual para
/// LONG y SHORT sin necesidad de invertir el signo a mano: si el objetivo
/// queda por debajo de la entrada (SHORT), un precio que bajó da un avance
/// positivo igual que un precio que sube en LONG, porque numerador y
/// denominador quedan negativos los dos.
///
/// 0 = no se movió desde la entrada. 1 = ya llegó al objetivo. Puede ser
/// negativo (se movió en contra) o mayor a 1 (ya pasó el objetivo).
///
/// Devuelve 0 si entrada y objetivo son el mismo precio (no hay camino que
/// recorrer, así que no hay avance que calcular).
double computeSignalProgress({
  required double entry,
  required double target,
  required double price,
}) {
  final denom = target - entry;
  if (denom == 0) return 0;
  return (price - entry) / denom;
}

/// La relación riesgo:premio que queda si se entra AHORA al precio actual,
/// en vez de al precio de la señal — "si llegás tarde, ¿cuánto rinde
/// realmente entrar ya?". `reward / risk`, con los dos en valor absoluto para
/// no depender de la dirección.
///
/// Devuelve `null` si el precio actual coincide exactamente con el stop
/// (riesgo cero): la relación no está definida, no hay un número honesto que
/// mostrar — nunca se debe convertir ese caso en un `0` o un valor gigante
/// arbitrario.
double? computeEffectiveRiskReward({
  required double stop,
  required double price,
  required double target,
}) {
  final risk = (price - stop).abs();
  if (risk == 0) return null;
  final reward = (target - price).abs();
  return reward / risk;
}
