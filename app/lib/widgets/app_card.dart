import 'package:flutter/material.dart';
import '../core/theme/ds_colors.dart';
import '../core/theme/app_radius.dart';
import '../core/theme/app_spacing.dart';

/// Contenedor base del sistema de diseño: fondo `surface`, borde `border`,
/// radio `xl`. Base de casi todos los demás componentes (`AppCard` es la
/// "tarjeta" que la sección 4 del documento de diseño da por sentada en cada
/// uno de los demás).
class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;

  const AppCard({super.key, required this.child, this.padding});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding ?? const EdgeInsets.all(AppSpacing.xxl),
      decoration: BoxDecoration(
        color: DsColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.xl),
        border: Border.all(color: DsColors.border),
      ),
      child: child,
    );
  }
}
