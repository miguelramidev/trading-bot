import 'package:flutter/material.dart';
import '../dashboard/responsive_layout.dart';
import 'mobile_trade_detail.dart';
import 'desktop_trade_detail.dart';

class TradeDetailScreen extends StatelessWidget {
  final Map<String, dynamic> trade;

  const TradeDetailScreen({super.key, required this.trade});

  @override
  Widget build(BuildContext context) {
    return ResponsiveLayout(
      mobile: MobileTradeDetail(trade: trade),
      desktop: DesktopTradeDetail(trade: trade),
    );
  }
}
