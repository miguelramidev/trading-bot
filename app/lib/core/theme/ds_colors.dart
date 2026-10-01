import 'package:flutter/material.dart';

/// Paleta del sistema de diseño (docs/design/design-system.md, sección 2.1).
/// Única paleta de la app — `AppColors` (la paleta vieja, con nombres
/// repetidos pero valores distintos) se borró una vez migrada la última
/// pantalla que la usaba.
class DsColors {
  // Fondos
  static const Color background = Color(0xFF0E1116);
  static const Color surface = Color(0xFF151A21);
  static const Color surfaceRaised = Color(0xFF1B222B);
  static const Color surfaceSunken = Color(0xFF11151B);
  static const Color inputBackground = Color(0xFF0E1116);

  // Bordes
  static const Color border = Color(0xFF262E39);
  static const Color borderStrong = Color(0xFF3A4553);
  static const Color divider = Color(0xFF222A34);
  static const Color dividerSubtle = Color(0xFF1E252E);

  // Texto
  static const Color textPrimary = Color(0xFFE6EAF0);
  static const Color textSecondary = Color(0xFF9AA4B2);
  static const Color textTertiary = Color(0xFF7A8594);
  static const Color textSubtle = Color(0xFFC9D1DB);
  static const Color textOnAccent = Color(0xFF0B1220);

  // Acento
  static const Color accent = Color(0xFF4C9AFF);
  static const Color accentText = Color(0xFF8CC2FF);

  // Estados de trading
  static const Color positive = Color(0xFF3FD089);
  static const Color negative = Color(0xFFFF8A80);
  static const Color negativeCandle = Color(0xFFFF6B61);
  static const Color warning = Color(0xFFF2B441);
  static const Color critical = Color(0xFFD50000);

  static const Color buttonLight = Color(0xFFF1F3F6);

  // Tints translúcidos (siempre sobre `surface`)
  static Color get positiveTint => positive.withValues(alpha: 0.12);
  static Color get negativeTint => negativeCandle.withValues(alpha: 0.12);
  static Color get negativeTintBlock => negativeCandle.withValues(alpha: 0.08); // "si toca el stop"
  static Color get accentTint => accent.withValues(alpha: 0.14);
  static Color get warningTint => warning.withValues(alpha: 0.10);
  static Color get positiveTintSoft => positive.withValues(alpha: 0.08); // "si toca el objetivo"
}
