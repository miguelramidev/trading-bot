import 'package:flutter/material.dart';
import 'responsive_layout.dart';
import 'mobile_settings.dart';
import 'desktop_settings.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const ResponsiveLayout(
      mobile: MobileSettings(),
      desktop: DesktopSettings(),
    );
  }
}
