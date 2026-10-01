/// Nombre real de cada estrategia (ver CONTEXT.md y `src/cron/analyze.ts`
/// del backend): el bot guarda `strategy` como número ("1", "2", "3") en
/// algunas señales y como texto (`regime`, ya legible) en otras. Esta
/// función normaliza ambos casos: si es un número conocido lo traduce, si
/// ya es texto lo deja tal cual (nunca inventa un nombre para un número
/// que no reconoce — lo devuelve crudo para no ocultar un dato raro).
String strategyName(String? raw) {
  if (raw == null || raw.isEmpty) return '—';
  switch (raw) {
    case '1':
      return 'Tendencial';
    case '2':
      return 'Rango';
    case '3':
      return 'Macro Breakout';
    case '4':
      return 'Cazador de Liquidez';
    default:
      return raw;
  }
}
