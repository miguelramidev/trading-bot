import 'package:flutter/material.dart';
import '../dashboard/responsive_layout.dart';
import 'mobile_trade_detail.dart';
import 'desktop_trade_detail.dart';

class TradeDetailScreen extends StatelessWidget {
  final Map<String, dynamic> trade;

  final bool isClosed;
  const TradeDetailScreen({super.key, required this.trade, this.isClosed = false});

  @override
  Widget build(BuildContext context) {
    return ResponsiveLayout(
      mobile: MobileTradeDetail(trade: trade, isClosed: isClosed),
      desktop: DesktopTradeDetail(trade: trade, isClosed: isClosed),
    );
  }
}
