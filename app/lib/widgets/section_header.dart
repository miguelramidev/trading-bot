import 'package:flutter/material.dart';
import '../core/theme/ds_colors.dart';
import '../core/theme/app_text_styles.dart';
import '../core/theme/app_spacing.dart';

/// Título de sección, con un contador opcional al lado y un link opcional a
/// la derecha (ej. "Posiciones abiertas · 1" ... "Ver historial").
class SectionHeader extends StatelessWidget {
  final String title;
  final String? count;
  final String? linkLabel;
  final VoidCallback? onLinkTap;
  final bool mobile;

  const SectionHeader({
    super.key,
    required this.title,
    this.count,
    this.linkLabel,
    this.onLinkTap,
    this.mobile = false,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Text(title, style: (mobile ? AppTextStyles.sectionMobile : AppTextStyles.section).copyWith(color: DsColors.textPrimary)),
            if (count != null) ...[
              const SizedBox(width: AppSpacing.md),
              Text(count!, style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary)),
            ],
          ],
        ),
        if (linkLabel != null)
          SelectionContainer.disabled(
            child: MouseRegion(
              cursor: SystemMouseCursors.click,
              child: GestureDetector(
                onTap: onLinkTap,
                child: Text(linkLabel!, style: AppTextStyles.body.copyWith(color: DsColors.accentText)),
              ),
            ),
          ),
      ],
    );
  }
}
