import 'package:flutter/material.dart';
import '../core/theme/ds_colors.dart';
import '../core/theme/app_text_styles.dart';
import '../core/theme/app_radius.dart';

/// Etiqueta LONG (verde) / SHORT (rojo), texto `caption` 600 sobre tint,
/// radio `tag`.
class DirectionTag extends StatelessWidget {
  final bool isLong;

  const DirectionTag({super.key, required this.isLong});

  @override
  Widget build(BuildContext context) {
    final color = isLong ? DsColors.positive : DsColors.negative;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: isLong ? DsColors.positiveTint : DsColors.negativeTint,
        borderRadius: BorderRadius.circular(AppRadius.tag),
      ),
      child: Text(
        isLong ? 'LONG' : 'SHORT',
        style: AppTextStyles.captionStrong.copyWith(color: color),
      ),
    );
  }
}
