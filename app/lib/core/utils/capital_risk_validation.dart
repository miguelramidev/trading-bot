/// Mismos límites que `CapitalRiskSchema` del backend
/// (`src/api/modules/users/infrastructure/configValidation.ts`, hallazgo M6):
/// valida en la app antes de mandar el PUT, para no depender del 400 del
/// servidor para dar feedback inmediato. El backend sigue siendo la
/// autoridad — esto es una copia a propósito, no un reemplazo.
String? validateCapitalRisk({
  required double montoOperacion,
  required int maxTrades,
  required int leverageMin,
  required int leverageMax,
}) {
  if (montoOperacion <= 0) return 'El monto por operación debe ser mayor a 0.';
  if ((montoOperacion - (montoOperacion * 100).round() / 100).abs() > 1e-9) {
    return 'El monto por operación admite como máximo 2 decimales.';
  }
  if (maxTrades < 1 || maxTrades > 10) return 'Las operaciones simultáneas deben estar entre 1 y 10.';
  if (leverageMin < 1 || leverageMin > 10) return 'El apalancamiento mínimo debe estar entre 1 y 10.';
  if (leverageMax < 1 || leverageMax > 10) return 'El apalancamiento máximo debe estar entre 1 y 10.';
  if (leverageMin > leverageMax) return 'El apalancamiento mínimo no puede ser mayor que el máximo.';
  return null;
}
