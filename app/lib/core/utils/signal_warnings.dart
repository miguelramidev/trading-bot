import 'package:flutter/material.dart';
import '../../widgets/callout.dart';
import '../constants/trading_constants.dart';

/// Advertencias de la señal (Fase 1): condiciones de riesgo macro, reversa
/// de estrategia, alertas de caída/rebote brusco — antes solo vivían
/// mezcladas dentro de `reason`, y se perdían al ejecutar/descartar porque
/// ese mismo campo se pisa con el resultado de la ejecución (truncado a 100
/// caracteres). Ahora viajan aparte en `warnings` (backend: `signalWarnings.ts`).
///
/// `high` es más urgente que `warning` (ej. riesgo macro en veto, alerta de
/// caída/rebote brusco). `positive` es una confirmación tranquilizadora (ej.
/// alineación macro a favor) — nunca "falta de riesgo", solo "esto juega a
/// favor".
enum SignalWarningSeverity { info, warning, high, positive }

/// Orden de prioridad para mostrarlas: la más urgente primero.
int _severityOrder(SignalWarningSeverity s) => switch (s) {
      SignalWarningSeverity.high => 0,
      SignalWarningSeverity.warning => 1,
      SignalWarningSeverity.positive => 2,
      SignalWarningSeverity.info => 3,
    };

class SignalWarning {
  final String type;
  final SignalWarningSeverity severity;
  /// Título corto (ej. "Riesgo Macro (VETO)") — para la tarjeta.
  final String title;
  /// El detalle (ej. "BTC está ALCISTA en 1D, pero no hay fuerza en 4H...").
  /// Junto con `title` arman el texto completo, sin el emoji duplicado (el
  /// ícono del `Callout` ya lo reemplaza).
  final String detail;

  const SignalWarning({required this.type, required this.severity, required this.title, required this.detail});
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
/// 🚨 high, ⚠️/🛑 warning, ✅ positive, 🔥 info (reversa de estrategia).
SignalWarningSeverity _severityFromEmoji(String text) {
  if (text.startsWith('🚨')) return SignalWarningSeverity.high;
  if (text.startsWith('⚠️') || text.startsWith('🛑')) return SignalWarningSeverity.warning;
  if (text.startsWith('✅')) return SignalWarningSeverity.positive;
  return SignalWarningSeverity.info;
}

const _knownEmojis = ['🚨', '⚠️', '🛑', '✅', '🔥'];

String _stripLeadingEmoji(String text) {
  var result = text.trim();
  for (final e in _knownEmojis) {
    if (result.startsWith(e)) return result.substring(e.length).trim();
  }
  return result;
}

/// Las viñetas que arma `analyze.ts` siempre vienen como
/// `<b>Título corto:</b> Detalle...` — al sacar el HTML, el ":" sigue
/// marcando dónde termina el título. Sin ":" (no debería pasar, pero por
/// si acaso), todo el texto queda como título y el detalle vacío.
({String title, String detail}) _splitTitleDetail(String rawText) {
  final withoutEmoji = _stripLeadingEmoji(rawText);
  final colonIndex = withoutEmoji.indexOf(':');
  if (colonIndex == -1) return (title: withoutEmoji, detail: '');
  return (title: withoutEmoji.substring(0, colonIndex).trim(), detail: withoutEmoji.substring(colonIndex + 1).trim());
}

List<SignalWarning> _sorted(List<SignalWarning> warnings) {
  final copy = [...warnings];
  copy.sort((a, b) => _severityOrder(a.severity).compareTo(_severityOrder(b.severity)));
  return copy;
}

/// Punto de entrada único: usa `warningsJson` (señales nuevas, de la
/// columna estructurada) si viene; si no, cae a parsear `reason` por
/// viñetas (señales viejas) — así ambas se ven igual en la UI. Siempre
/// devuelve la lista ordenada por severidad (más urgente primero).
List<SignalWarning> parseSignalWarnings({List<dynamic>? warningsJson, String? reason}) {
  if (warningsJson != null) {
    final warnings = warningsJson.map((raw) {
      final map = raw as Map<String, dynamic>;
      final (:title, :detail) = _splitTitleDetail(map['text']?.toString() ?? '');
      return SignalWarning(type: map['type']?.toString() ?? '', severity: _severityFromJson(map['severity']?.toString()), title: title, detail: detail);
    }).toList();
    return _sorted(warnings);
  }
  return parseWarningsFromReason(reason);
}

/// El motivo corto de la estrategia (ej. "MACD Zero-Cross a favor de EMA
/// 200") — la primera viñeta de `reason`, que siempre empieza con "Motivo: ".
/// No es una advertencia: se muestra aparte, como texto simple junto a la
/// estrategia (ver `signal_card.dart`).
String? extractMotivo(String? reason) {
  if (reason == null) return null;
  for (final part in reason.split('\n\n')) {
    final cleaned = part.trim().replaceFirst(RegExp(r'^•\s*'), '');
    if (cleaned.startsWith('Motivo:')) return cleaned.substring('Motivo:'.length).trim();
  }
  return null;
}

/// Permite re-ordenar una lista de advertencias después de agregarle una
/// sintética (ej. la de Regla 5, abajo) sin reimplementar el criterio.
List<SignalWarning> sortSignalWarnings(List<SignalWarning> warnings) => _sorted(warnings);

/// Regla 5: si la distancia del stop al precio de entrada es menor a
/// `kMinStopDistancePct`, el bot va a rechazar la operación —
/// `Trader.executeTrade` (`src/bot/trader.ts`, `MIN_SL_DISTANCE_PCT`) la
/// corta antes de colocar ninguna orden. Se avisa ANTES de que el usuario
/// intente, en vez de dejarlo descubrirlo con un rechazo de Binance.
bool isStopTooTight({required double entry, required double stop}) {
  if (entry == 0) return false;
  return (stop - entry).abs() / entry < kMinStopDistancePct;
}

/// Advertencia sintética (no viene del backend) para el caso de arriba —
/// mismo severidad "high" que un riesgo macro en veto, porque de verdad
/// bloquea la operación, no es solo un "ojo con esto".
SignalWarning buildStopTooTightWarning() => const SignalWarning(
      type: 'stop_demasiado_ajustado',
      severity: SignalWarningSeverity.high,
      title: 'Stop demasiado ajustado',
      detail: 'El bot va a rechazar esta operación.',
    );

/// `reason` de una señal vieja es el resultado de `analyze.ts`:
/// `rawWarnings.map(w => "• " + w).join('\n\n')` — cada viñeta separada por
/// doble salto de línea, empezando con "• ". La viñeta de "Motivo: ..." se
/// excluye (no es una advertencia, ver `extractMotivo`). Devuelve la lista
/// ordenada por severidad.
List<SignalWarning> parseWarningsFromReason(String? reason) {
  if (reason == null || reason.trim().isEmpty) return [];
  final warnings = reason
      .split('\n\n')
      .map((part) => part.trim().replaceFirst(RegExp(r'^•\s*'), ''))
      .where((part) => part.isNotEmpty && !part.startsWith('Motivo:'))
      .map((cleaned) {
        final severity = _severityFromEmoji(cleaned);
        final (:title, :detail) = _splitTitleDetail(cleaned);
        return SignalWarning(type: 'legacy', severity: severity, title: title, detail: detail);
      })
      .where((w) => w.title.isNotEmpty)
      .toList();
  return _sorted(warnings);
}
