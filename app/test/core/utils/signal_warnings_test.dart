import 'package:flutter_test/flutter_test.dart';
import 'package:app/core/utils/signal_warnings.dart';
import 'package:app/widgets/callout.dart';

void main() {
  group('parseSignalWarnings — con "warnings" estructurado (señales nuevas)', () {
    test('usa warningsJson cuando viene, ignora "reason"', () {
      final warnings = parseSignalWarnings(
        warningsJson: [
          {'type': 'riesgo_macro', 'severity': 'high', 'text': 'Riesgo Macro (VETO): texto'},
          {'type': 'alineacion_macro', 'severity': 'positive', 'text': 'Alineación Macro: texto'},
        ],
        reason: '• Esto no debería usarse',
      );
      expect(warnings, hasLength(2));
      expect(warnings[0].severity, SignalWarningSeverity.high);
      expect(warnings[1].severity, SignalWarningSeverity.positive);
    });

    test('severidad desconocida en el JSON cae a info, no revienta', () {
      final warnings = parseSignalWarnings(warningsJson: [
        {'type': 'x', 'severity': 'algo_raro', 'text': 'texto'},
      ]);
      expect(warnings[0].severity, SignalWarningSeverity.info);
    });

    test('calloutVariantFor mapea 1 a 1 con CalloutVariant', () {
      expect(calloutVariantFor(SignalWarningSeverity.high), CalloutVariant.high);
      expect(calloutVariantFor(SignalWarningSeverity.warning), CalloutVariant.warning);
      expect(calloutVariantFor(SignalWarningSeverity.positive), CalloutVariant.positive);
      expect(calloutVariantFor(SignalWarningSeverity.info), CalloutVariant.info);
    });
  });

  group('parseWarningsFromReason — señales viejas, con textos reales de reason', () {
    test('caso real ICP (id 739): Motivo + reversa de estrategia (🔥 -> info)', () {
      const reason = '• Motivo: Inversión por convergencia Alcista 1D+4H (BTC Fuerte a Corto Plazo)\n'
          '\n'
          '• 🔥 ESTRATEGIA 3 (MACRO BREAKOUT): El bot detectó un setup técnico en contra, pero como Bitcoin está fuertemente ALCISTA en 1D y 4H, ¡hemos INVERTIDO la señal para cazar la ruptura!';
      final warnings = parseWarningsFromReason(reason);
      expect(warnings, hasLength(2));
      expect(warnings[0].text, 'Motivo: Inversión por convergencia Alcista 1D+4H (BTC Fuerte a Corto Plazo)');
      expect(warnings[0].severity, SignalWarningSeverity.info); // sin emoji reconocido
      expect(warnings[1].text, startsWith('🔥 ESTRATEGIA 3 (MACRO BREAKOUT)'));
      expect(warnings[1].severity, SignalWarningSeverity.info); // 🔥 -> info
    });

    test('caso real TRUMP/XLM: Motivo + veto de protección (🛑 -> warning)', () {
      const reason = '• Motivo: MACD Zero-Cross a favor de EMA 200\n'
          '\n'
          '• 🛑 VETO DE PROTECCIÓN: BTC es Alcista (1D) y la moneda (4H) también, pero BTC está CAYENDO a corto plazo (15m). Se cancela la Inversión a LONG para no atrapar el cuchillo cayendo.';
      final warnings = parseWarningsFromReason(reason);
      expect(warnings, hasLength(2));
      expect(warnings[1].severity, SignalWarningSeverity.warning);
    });

    test('🚨 (alerta de caída/rebote) -> high', () {
      final warnings = parseWarningsFromReason(
        '• 🚨 ALERTA DE CAÍDA BRUSCA: Bitcoin está retrocediendo con fuerza en 15m.',
      );
      expect(warnings[0].severity, SignalWarningSeverity.high);
    });

    test('⚠️ (riesgo mitigado/macro) -> warning', () {
      final warnings = parseWarningsFromReason(
        '• ⚠️ Riesgo Macro mitigado: BTC está ALCISTA, pero esta moneda tiene CORRELACIÓN NEGATIVA.',
      );
      expect(warnings[0].severity, SignalWarningSeverity.warning);
    });

    test('✅ (alineación macro) -> positive', () {
      final warnings = parseWarningsFromReason(
        '• ✅ Alineación Macro: BTC está fuertemente ALCISTA en el gráfico diario.',
      );
      expect(warnings[0].severity, SignalWarningSeverity.positive);
    });

    test('null o vacío -> lista vacía, no revienta', () {
      expect(parseWarningsFromReason(null), isEmpty);
      expect(parseWarningsFromReason(''), isEmpty);
      expect(parseWarningsFromReason('   '), isEmpty);
    });

    test('reason sin viñetas (texto plano de una señal muy vieja) -> una sola advertencia info', () {
      final warnings = parseWarningsFromReason('Señal generada por MACD Zero-Cross');
      expect(warnings, hasLength(1));
      expect(warnings[0].severity, SignalWarningSeverity.info);
    });
  });
}
