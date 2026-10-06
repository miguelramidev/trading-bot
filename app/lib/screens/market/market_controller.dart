import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../../core/network/api_client.dart';

/// Estado del tablero de posicionamiento (`GET /api/market/positioning`),
/// compartido entre `mobile_market.dart` y `desktop_market.dart`. El backend
/// cachea 5 minutos y la señal cambia cada 4 h: no hace falta polling, se
/// actualiza al abrir la pantalla y con el botón de refrescar.
class MarketController extends ChangeNotifier {
  MarketController() {
    fetch();
  }

  bool isLoading = true;
  String? errorMessage;
  Map<String, dynamic>? data;

  List<Map<String, dynamic>> get rows => _list('rows');
  List<Map<String, dynamic>> get summaries => _list('summaries', shadow: true);
  List<Map<String, dynamic>> get openShadow => _list('open', shadow: true);
  List<Map<String, dynamic>> get recentShadow => _list('recent', shadow: true);
  double get posThreshold => (data?['thresholds']?['pos'] as num?)?.toDouble() ?? 2.0;
  double get carryThreshold => (data?['thresholds']?['carryAnnual'] as num?)?.toDouble() ?? 0.15;
  DateTime? get barClose => DateTime.tryParse(data?['barClose']?.toString() ?? '');

  List<Map<String, dynamic>> _list(String key, {bool shadow = false}) {
    final source = shadow ? data?['shadow'] : data;
    return ((source?[key] as List?) ?? const []).cast<Map<String, dynamic>>();
  }

  Future<void> fetch() async {
    isLoading = true;
    notifyListeners();
    try {
      final res = await ApiClient.get('/api/market/positioning');
      if (res.statusCode == 200) {
        data = jsonDecode(res.body) as Map<String, dynamic>;
        errorMessage = null;
      } else {
        errorMessage = 'No se pudo cargar el posicionamiento del mercado.';
      }
    } catch (e) {
      errorMessage = 'No se pudo conectar con el servidor.';
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }
}
