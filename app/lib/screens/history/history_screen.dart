import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../dashboard/responsive_layout.dart';
import 'history_controller.dart';
import 'mobile_history.dart';
import 'desktop_history.dart';

class HistoryScreen extends StatelessWidget {
  final int initialPage;
  final String filter;

  const HistoryScreen({super.key, this.initialPage = 1, this.filter = 'Todos'});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => HistoryController(typeFilter: filter, page: initialPage),
      child: const ResponsiveLayout(mobile: MobileHistory(), desktop: DesktopHistory()),
    );
  }
}
