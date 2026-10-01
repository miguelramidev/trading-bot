import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'ds_colors.dart';
import 'app_radius.dart';
import 'app_spacing.dart';

class AppTheme {
  static ThemeData get darkTheme {
    return ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: DsColors.background,
      primaryColor: DsColors.accent,

      // Tipografía General (Plus Jakarta Sans)
      textTheme: GoogleFonts.plusJakartaSansTextTheme().copyWith(
        displayLarge: GoogleFonts.plusJakartaSans(
          color: DsColors.textPrimary,
          fontSize: 32,
          fontWeight: FontWeight.bold,
          letterSpacing: -0.5,
        ),
        bodyLarge: GoogleFonts.plusJakartaSans(
          color: DsColors.textPrimary,
          fontSize: 16,
        ),
        bodyMedium: GoogleFonts.plusJakartaSans(
          color: DsColors.textSecondary,
          fontSize: 14,
        ),
      ),

      // AppBar Transparente y Minimalista
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        iconTheme: IconThemeData(color: DsColors.textPrimary),
      ),

      // Botones Elevados (Login / Acciones)
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: DsColors.accent,
          foregroundColor: DsColors.textOnAccent,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xxl, vertical: AppSpacing.lg),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.lg),
          ),
          textStyle: GoogleFonts.plusJakartaSans(
            fontWeight: FontWeight.w600,
            fontSize: 16,
          ),
        ),
      ),

      // Tarjetas
      cardTheme: CardThemeData(
        color: DsColors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.xl),
          side: const BorderSide(color: DsColors.border, width: 1),
        ),
      ),
    );
  }

  // Tipografía Monoespaciada (Para PnL, Precios, Números estáticos)
  static TextStyle get monoStyle => GoogleFonts.jetBrainsMono(
    color: DsColors.textPrimary,
    fontWeight: FontWeight.w500,
  );
}
