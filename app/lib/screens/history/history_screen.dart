import 'package:flutter/material.dart';
import 'dart:convert';
import '../../core/network/api_client.dart';
import '../dashboard/responsive_layout.dart';
import 'mobile_history.dart';
import 'desktop_history.dart';

class HistoryScreen extends StatefulWidget {
  final int initialPage;
  const HistoryScreen({super.key, this.initialPage = 1});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  Map<String, dynamic>? _stats;
  Map<String, dynamic>? _pagination;
  List<dynamic> _trades = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchHistory(widget.initialPage);
  }

  @override
  void didUpdateWidget(covariant HistoryScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialPage != widget.initialPage) {
      _fetchHistory(widget.initialPage);
    }
  }

  Future<void> _fetchHistory(int page) async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiClient.get('/api/history?page=$page&limit=20');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (mounted) {
          setState(() {
            _stats = data['stats'];
            _pagination = data['pagination'];
            _trades = data['trades'] ?? [];
            _isLoading = false;
          });
        }
      } else {
        if (mounted) setState(() => _isLoading = false);
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading && _trades.isEmpty) {
      return const Scaffold(
        backgroundColor: Color(0xFF0F172A),
        body: Center(child: CircularProgressIndicator(color: Color(0xFF10B981))),
      );
    }

    return ResponsiveLayout(
      mobile: MobileHistory(stats: _stats, trades: _trades, pagination: _pagination),
      desktop: DesktopHistory(stats: _stats, trades: _trades, pagination: _pagination),
    );
  }
}
