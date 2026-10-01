import 'package:flutter/material.dart';
import '../core/theme/ds_colors.dart';
import '../core/theme/app_text_styles.dart';
import '../core/theme/app_spacing.dart';
import '../core/theme/app_radius.dart';

/// Campo con etiqueta arriba y sufijo de unidad opcional (USDT, x).
class LabeledField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final String? suffix;
  final TextInputType? keyboardType;
  final bool enabled;
  final ValueChanged<String>? onChanged;

  const LabeledField({
    super.key,
    required this.label,
    required this.controller,
    this.suffix,
    this.keyboardType,
    this.enabled = true,
    this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: AppTextStyles.caption.copyWith(color: DsColors.textSecondary)),
        const SizedBox(height: AppSpacing.sm),
        TextField(
          controller: controller,
          enabled: enabled,
          keyboardType: keyboardType,
          onChanged: onChanged,
          style: AppTextStyles.numS.copyWith(color: DsColors.textPrimary),
          decoration: InputDecoration(
            filled: true,
            fillColor: DsColors.inputBackground,
            suffixText: suffix,
            suffixStyle: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary),
            contentPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppRadius.md),
              borderSide: const BorderSide(color: DsColors.border),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppRadius.md),
              borderSide: const BorderSide(color: DsColors.border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppRadius.md),
              borderSide: const BorderSide(color: DsColors.accent),
            ),
          ),
        ),
      ],
    );
  }
}
