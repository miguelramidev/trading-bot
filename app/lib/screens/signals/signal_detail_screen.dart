import 'package:flutter/material.dart';
import '../dashboard/responsive_layout.dart';
import 'desktop_signal_detail.dart';
import 'mobile_signal_detail.dart';

class SignalDetailScreen extends StatelessWidget {
  final Map<String, dynamic> signal;

  const SignalDetailScreen({super.key, required this.signal});

  @override
  Widget build(BuildContext context) {
    return ResponsiveLayout(
      mobile: MobileSignalDetail(signal: signal),
      desktop: DesktopSignalDetail(signal: signal),
    );
  }
}
