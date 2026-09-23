import 'package:flutter/material.dart';
import 'dashboard/responsive_layout.dart';
import 'dashboard/mobile_dashboard.dart';
import 'dashboard/desktop_dashboard.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const ResponsiveLayout(
      mobile: MobileDashboard(),
      desktop: DesktopDashboard(),
    );
  }
}
