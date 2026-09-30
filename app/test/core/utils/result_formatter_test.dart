import 'package:flutter_test/flutter_test.dart';
import 'package:app/core/utils/result_formatter.dart';

void main() {
  group('fmtMissing', () {
    test('devuelve el placeholder por default', () {
      expect(fmtMissing(), '—');
    });

    test('acepta un placeholder propio', () {
      expect(fmtMissing('N/D'), 'N/D');
    });
  });

  group('fmtUsd', () {
    test('null -> —', () {
      expect(fmtUsd(null), '—');
    });

    test('positivo -> signo más', () {
      expect(fmtUsd(0.08), '+\$0.08');
    });

    test('negativo -> signo menos tipográfico, no un guion', () {
      expect(fmtUsd(-0.32), '−\$0.32');
    });

    test('cero -> sin signo', () {
      expect(fmtUsd(0), '\$0.00');
    });

    test('signed:false -> nunca antepone signo, ni a un positivo', () {
      expect(fmtUsd(40.12, signed: false), '\$40.12');
      expect(fmtUsd(0, signed: false), '\$0.00');
    });
  });

  group('fmtPct', () {
    test('null -> —', () {
      expect(fmtPct(null), '—');
    });

    test('positivo -> signo más', () {
      expect(fmtPct(0.24), '+0.24%');
    });

    test('negativo -> signo menos tipográfico', () {
      expect(fmtPct(-1.5), '−1.50%');
    });

    test('cero -> sin signo', () {
      expect(fmtPct(0), '0.00%');
    });
  });
}
