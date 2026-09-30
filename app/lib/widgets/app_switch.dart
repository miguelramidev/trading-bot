import 'package:flutter/material.dart';
import '../core/theme/ds_colors.dart';

/// Switch del sistema de diseño: activo en `accent`.
class AppSwitch extends StatelessWidget {
  final bool value;
  final ValueChanged<bool>? onChanged;

  const AppSwitch({super.key, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Switch(
      value: value,
      onChanged: onChanged,
      activeThumbColor: DsColors.accent,
    );
  }
}
