import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Estilos de texto con nombre (docs/design/design-system.md, sección 2.2).
///
/// Ninguno trae color: el color lo aplica quien use el estilo (normalmente
/// con `.copyWith(color: DsColors.xxx)`), porque el mismo estilo numérico se
/// usa en distintos colores según el signo del valor o el estado.
///
/// No reemplaza `AppTheme.monoStyle` ni `Theme.of(context).textTheme.*`
/// todavía — las pantallas actuales siguen usando esos hasta que se migren.
class AppTextStyles {
  // Mono (JetBrains Mono) — números
  static TextStyle get numDisplay => GoogleFonts.jetBrainsMono(fontSize: 40, fontWeight: FontWeight.w600);
  static TextStyle get numXL => GoogleFonts.jetBrainsMono(fontSize: 32, fontWeight: FontWeight.w600);
  static TextStyle get numL => GoogleFonts.jetBrainsMono(fontSize: 24, fontWeight: FontWeight.w600);
  static TextStyle get numM => GoogleFonts.jetBrainsMono(fontSize: 20, fontWeight: FontWeight.w600);
  static TextStyle get numS => GoogleFonts.jetBrainsMono(fontSize: 14, fontWeight: FontWeight.w400);
  static TextStyle get numXS => GoogleFonts.jetBrainsMono(fontSize: 12, fontWeight: FontWeight.w400);

  // Sans (Plus Jakarta Sans) — interfaz
  static TextStyle get title => GoogleFonts.plusJakartaSans(fontSize: 24, fontWeight: FontWeight.w700);
  static TextStyle get titleMobile => GoogleFonts.plusJakartaSans(fontSize: 20, fontWeight: FontWeight.w700);
  static TextStyle get section => GoogleFonts.plusJakartaSans(fontSize: 18, fontWeight: FontWeight.w700);
  static TextStyle get sectionMobile => GoogleFonts.plusJakartaSans(fontSize: 17, fontWeight: FontWeight.w700);
  static TextStyle get cardTitle => GoogleFonts.plusJakartaSans(fontSize: 16, fontWeight: FontWeight.w700);
  static TextStyle get cardTitleMobile => GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.w700);
  static TextStyle get symbol => GoogleFonts.plusJakartaSans(fontSize: 20, fontWeight: FontWeight.w700);
  static TextStyle get symbolMobile => GoogleFonts.plusJakartaSans(fontSize: 18, fontWeight: FontWeight.w700);
  static TextStyle get body => GoogleFonts.plusJakartaSans(fontSize: 14, fontWeight: FontWeight.w400);
  static TextStyle get bodySmall => GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.w400);
  static TextStyle get caption => GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w400);
  static TextStyle get captionStrong => GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w600);
  static TextStyle get micro => GoogleFonts.plusJakartaSans(fontSize: 11, fontWeight: FontWeight.w400);
}
