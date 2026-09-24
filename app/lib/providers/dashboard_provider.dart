import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../core/network/api_client.dart';

import 'package:firebase_auth/firebase_auth.dart';

class DashboardProvider extends ChangeNotifier {
  bool isLoading = true;
  bool setupRequired = false;
  double balance = 0.0;
  double unrealizedPnl = 0.0;
  double pnlPercent = 0.0;
  int openTradesCount = 0;
  List<dynamic> positions = [];
  String userName = 'Fondo Alpha';
  double freeBalance = 0.0;
  double usedBalance = 0.0;
  List<dynamic> signals = [];
  List<dynamic> chartData = [];

  bool _hasFetched = false;

  Future<void> fetchDashboardData({bool forceRefresh = false}) async {
    if (_hasFetched && !forceRefresh) return; // Preservar estado
    
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      isLoading = false;
      notifyListeners();
      return;
    }

    if (forceRefresh) {
      isLoading = true;
      notifyListeners();
    }

    try {
      final response = await ApiClient.get('/api/dashboard');

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['status'] == 'setup_required') {
          setupRequired = true;
        } else {
          setupRequired = false;
          balance = (data['balance'] ?? 0).toDouble();
          unrealizedPnl = (data['unrealizedPnl'] ?? 0).toDouble();
          pnlPercent = (data['unrealizedPnlPercent'] ?? 0).toDouble();
          openTradesCount = data['openTrades'] ?? 0;
          positions = data['positions'] ?? [];
          userName = data['userName'] ?? 'Usuario';
          freeBalance = (data['freeBalance'] ?? 0).toDouble();
          usedBalance = (data['usedBalance'] ?? 0).toDouble();
          signals = data['signals'] ?? [];
          chartData = data['chartData'] ?? [];
        }
        _hasFetched = true;
      }
    } catch (e) {
      // Manejar error silenciosamente
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }
}
