import 'package:flutter/material.dart';
import '../../widgets/callout.dart';

/// Advertencias de la señal (Fase 1): condiciones de riesgo macro, reversa
/// de estrategia, alertas de caída/rebote brusco — antes solo vivían
/// mezcladas dentro de `reason`, y se perdían al ejecutar/descartar porque
/// ese mismo campo se pisa con el resultado de la ejecución (truncado a 100
/// caracteres). Ahora viajan aparte en `warnings` (backend: `signalWarnings.ts`).
enum SignalWarningSeverity { info, warning, high, positive }

class SignalWarning {
  final String type;
  final SignalWarningSeverity severity;
  final String text;

  const SignalWarning({required this.type, required this.severity, required this.text});
}

CalloutVariant calloutVariantFor(SignalWarningSeverity severity) => switch (severity) {
      SignalWarningSeverity.high => CalloutVariant.high,
      SignalWarningSeverity.warning => CalloutVariant.warning,
      SignalWarningSeverity.positive => CalloutVariant.positive,
      SignalWarningSeverity.info => CalloutVariant.info,
    };

IconData calloutIconFor(SignalWarningSeverity severity) => switch (severity) {
      SignalWarningSeverity.high => Icons.error_outline,
      SignalWarningSeverity.warning => Icons.warning_amber_rounded,
      SignalWarningSeverity.positive => Icons.check_circle_outline,
      SignalWarningSeverity.info => Icons.info_outline,
    };

SignalWarningSeverity _severityFromJson(String? raw) => switch (raw) {
      "high" => SignalWarningSeverity.high,
      "warning" => SignalWarningSeverity.warning,
      "positive" => SignalWarningSeverity.positive,
      _ => SignalWarningSeverity.info,
    };

/// Mismo criterio que el emoji de cada viñeta que arma `analyze.ts` hoy:
/// 🚨 high, ⚠️/🛑 warning, ✅ positive, 🔥 info (reversa de estrategia) — lo
/// que no matchea ningún emoji conocido (ej. la línea "Motivo: ...") cae en
/// info.
SignalWarningSeverity _severityFromEmoji(String text) {
  if (text.startsWith('🚨')) return SignalWarningSeverity.high;
  if (text.startsWith('⚠️') || text.startsWith('🛑')) return SignalWarningSeverity.warning;
  if (text.startsWith('✅')) return SignalWarningSeverity.positive;
  return SignalWarningSeverity.info;
}

/// Punto de entrada único: usa `warningsJson` (señales nuevas, de la
/// columna estructurada) si viene; si no, cae a parsear `reason` por
/// viñetas (señales viejas) — así ambas se ven igual en la UI.
List<SignalWarning> parseSignalWarnings({List<dynamic>? warningsJson, String? reason}) {
  if (warningsJson != null) {
    return warningsJson.map((raw) {
      final map = raw as Map<String, dynamic>;
      return SignalWarning(
        type: map['type']?.toString() ?? '',
        severity: _severityFromJson(map['severity']?.toString()),
        text: map['text']?.toString() ?? '',
      );
    }).toList();
  }
  return parseWarningsFromReason(reason);
}

/// `reason` de una señal vieja es el resultado de `analyze.ts`:
/// `rawWarnings.map(w => "• " + w).join('\n\n')` — cada viñeta separada por
/// doble salto de línea, empezando con "• ".
List<SignalWarning> parseWarningsFromReason(String? reason) {
  if (reason == null || reason.trim().isEmpty) return [];
  return reason
      .split('\n\n')
      .map((part) => part.trim())
      .where((part) => part.isNotEmpty)
      .map((part) {
        final cleaned = part.startsWith('•') ? part.substring(1).trim() : part;
        return SignalWarning(type: 'legacy', severity: _severityFromEmoji(cleaned), text: cleaned);
      })
      .where((w) => w.text.isNotEmpty)
      .toList();
}
