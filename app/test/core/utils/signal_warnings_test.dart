import 'package:flutter_test/flutter_test.dart';
import 'package:app/core/utils/signal_warnings.dart';
import 'package:app/widgets/callout.dart';

void main() {
  group('parseSignalWarnings — con "warnings" estructurado (señales nuevas)', () {
    test('usa warningsJson cuando viene, ignora "reason", separa título y detalle por el ":"', () {
      final warnings = parseSignalWarnings(
        warningsJson: [
          {'type': 'alineacion_macro', 'severity': 'positive', 'text': 'Alineación Macro: BTC está fuertemente ALCISTA.'},
          {'type': 'riesgo_macro', 'severity': 'high', 'text': 'Riesgo Macro (VETO): BTC está ALCISTA en 1D, pero no hay fuerza en 4H.'},
        ],
        reason: '• Esto no debería usarse',
      );
      // Ordenadas por severidad: high primero, aunque en el JSON venía segunda.
      expect(warnings, hasLength(2));
      expect(warnings[0].severity, SignalWarningSeverity.high);
      expect(warnings[0].title, 'Riesgo Macro (VETO)');
      expect(warnings[0].detail, 'BTC está ALCISTA en 1D, pero no hay fuerza en 4H.');
      expect(warnings[1].severity, SignalWarningSeverity.positive);
      expect(warnings[1].title, 'Alineación Macro');
    });

    test('severidad desconocida en el JSON cae a info, no revienta', () {
      final warnings = parseSignalWarnings(warningsJson: [
        {'type': 'x', 'severity': 'algo_raro', 'text': 'Título: texto'},
      ]);
      expect(warnings[0].severity, SignalWarningSeverity.info);
    });

    test('texto sin ":" -> todo el texto queda como título, detalle vacío', () {
      final warnings = parseSignalWarnings(warningsJson: [
        {'type': 'x', 'severity': 'info', 'text': 'Sin dos puntos acá'},
      ]);
      expect(warnings[0].title, 'Sin dos puntos acá');
      expect(warnings[0].detail, '');
    });

    test('calloutVariantFor mapea 1 a 1 con CalloutVariant', () {
      expect(calloutVariantFor(SignalWarningSeverity.high), CalloutVariant.high);
      expect(calloutVariantFor(SignalWarningSeverity.warning), CalloutVariant.warning);
      expect(calloutVariantFor(SignalWarningSeverity.positive), CalloutVariant.positive);
      expect(calloutVariantFor(SignalWarningSeverity.info), CalloutVariant.info);
    });
  });

  group('parseWarningsFromReason — señales viejas, con textos reales de reason', () {
    test('caso real ICP (id 739): excluye el "Motivo" (no es una advertencia), reversa de estrategia (🔥 -> info) sin el emoji duplicado', () {
      const reason = '• Motivo: Inversión por convergencia Alcista 1D+4H (BTC Fuerte a Corto Plazo)\n'
          '\n'
          '• 🔥 ESTRATEGIA 3 (MACRO BREAKOUT): El bot detectó un setup técnico en contra, pero como Bitcoin está fuertemente ALCISTA en 1D y 4H, ¡hemos INVERTIDO la señal para cazar la ruptura!';
      final warnings = parseWarningsFromReason(reason);
      expect(warnings, hasLength(1)); // el "Motivo" no cuenta como advertencia
      expect(warnings[0].severity, SignalWarningSeverity.info); // 🔥 -> info
      expect(warnings[0].title, 'ESTRATEGIA 3 (MACRO BREAKOUT)');
      expect(warnings[0].detail, startsWith('El bot detectó un setup técnico en contra'));
      expect(warnings[0].detail, isNot(contains('🔥'))); // sin el emoji duplicado
    });

    test('caso real TRUMP/XLM: veto de protección (🛑 -> warning)', () {
      const reason = '• Motivo: MACD Zero-Cross a favor de EMA 200\n'
          '\n'
          '• 🛑 VETO DE PROTECCIÓN: BTC es Alcista (1D) y la moneda (4H) también, pero BTC está CAYENDO a corto plazo (15m). Se cancela la Inversión a LONG para no atrapar el cuchillo cayendo.';
      final warnings = parseWarningsFromReason(reason);
      expect(warnings, hasLength(1));
      expect(warnings[0].severity, SignalWarningSeverity.warning);
      expect(warnings[0].title, 'VETO DE PROTECCIÓN');
    });

    test('🚨 (alerta de caída/rebote) -> high', () {
      final warnings = parseWarningsFromReason(
        '• 🚨 ALERTA DE CAÍDA BRUSCA: Bitcoin está retrocediendo con fuerza en 15m.',
      );
      expect(warnings[0].severity, SignalWarningSeverity.high);
      expect(warnings[0].title, 'ALERTA DE CAÍDA BRUSCA');
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

    test('varias advertencias reales juntas quedan ordenadas por severidad (high primero)', () {
      const reason = '• Motivo: MACD Zero-Cross a favor de EMA 200\n'
          '\n'
          '• ✅ Alineación Macro: texto\n'
          '\n'
          '• 🚨 ALERTA DE CAÍDA BRUSCA: texto\n'
          '\n'
          '• ⚠️ Riesgo Macro (VETO): texto';
      final warnings = parseWarningsFromReason(reason);
      expect(warnings.map((w) => w.severity).toList(), [
        SignalWarningSeverity.high,
        SignalWarningSeverity.warning,
        SignalWarningSeverity.positive,
      ]);
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

  group('extractMotivo', () {
    test('caso real ICP: saca el texto después de "Motivo: "', () {
      const reason = '• Motivo: Inversión por convergencia Alcista 1D+4H (BTC Fuerte a Corto Plazo)\n'
          '\n'
          '• 🔥 ESTRATEGIA 3 (MACRO BREAKOUT): texto';
      expect(extractMotivo(reason), 'Inversión por convergencia Alcista 1D+4H (BTC Fuerte a Corto Plazo)');
    });

    test('sin "Motivo:" en ninguna viñeta -> null', () {
      expect(extractMotivo('• 🚨 ALERTA DE CAÍDA BRUSCA: texto'), isNull);
    });

    test('reason null -> null', () {
      expect(extractMotivo(null), isNull);
    });
  });
}
