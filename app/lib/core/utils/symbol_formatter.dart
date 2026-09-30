/// Símbolos de señales/trades vienen en formato ccxt ("ZAMA/USDT:USDT").
/// Para mostrar al usuario, se usa solo el activo base ("ZAMA").
String fmtSymbol(dynamic raw) {
  if (raw == null) return '—';
  final text = raw.toString();
  if (text.isEmpty) return '—';
  return text.split('/').first;
}
