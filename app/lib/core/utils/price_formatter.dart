/// Formats a price with dynamic precision based on its magnitude.
/// Matches the backend `fmt()` logic in analyze.ts.
///
/// Examples:
///   fmtPrice(0.000012) → "0.00001200"  (PEPE, SHIB)
///   fmtPrice(0.0022)   → "0.002200"    (ONE, LUNC)
///   fmtPrice(1.2345)   → "1.234500"    (ADA, SUI)
///   fmtPrice(3.456)    → "3.45600"     (XRP)
///   fmtPrice(65.43)    → "65.4300"     (SOL, AVAX)
///   fmtPrice(3000.12)  → "3000.12"     (ETH, BTC)
String fmtPrice(dynamic raw) {
  if (raw == null) return '-';
  final double? n = double.tryParse(raw.toString().replaceAll(',', ''));
  if (n == null) return raw.toString();

  final int decimals;
  if (n < 0.001) {
    decimals = 8;
  } else if (n < 0.1) {
    decimals = 6;
  } else if (n < 1) {
    decimals = 6;
  } else if (n < 10) {
    decimals = 5;
  } else if (n < 100) {
    decimals = 4;
  } else {
    decimals = 2;
  }

  return n.toStringAsFixed(decimals);
}
