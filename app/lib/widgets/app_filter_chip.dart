import 'package:flutter/material.dart';
import '../core/theme/ds_colors.dart';
import '../core/theme/app_text_styles.dart';
import '../core/theme/app_radius.dart';

/// Filtro del historial (pastilla). Se llama `AppFilterChip`, no `FilterChip`,
/// porque ese nombre ya lo usa Flutter Material — para no pisarlo ni generar
/// una colisión de import ambigua.
class AppFilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const AppFilterChip({super.key, required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          height: 38,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected ? DsColors.surfaceRaised : Colors.transparent,
            borderRadius: BorderRadius.circular(AppRadius.pill),
            border: Border.all(color: selected ? DsColors.borderStrong : DsColors.border),
          ),
          child: Text(
            label,
            style: AppTextStyles.body.copyWith(
              color: selected ? DsColors.textPrimary : DsColors.textSecondary,
              fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
            ),
          ),
        ),
      ),
    );
  }
}
