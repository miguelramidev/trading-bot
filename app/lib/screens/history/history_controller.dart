import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../../core/network/api_client.dart';

/// Estado y fetch del Historial, compartido entre `mobile_history.dart` y
/// `desktop_history.dart`. Las métricas (`stats`) siguen a período + búsqueda
/// de activo/estrategia; el filtro de tipo (Todas/Ejecutadas/Descartadas)
/// solo acota la lista — ver `historyHelpers.ts` del lado del backend, que
/// aplica exactamente la misma separación.
class HistoryController extends ChangeNotifier {
  HistoryController({String typeFilter = 'Todos', int page = 1}) : _typeFilter = typeFilter, _page = page {
    fetch();
  }

  bool isLoading = true;
  String? errorMessage;

  Map<String, dynamic>? stats;
  List<dynamic> trades = [];
  Map<String, dynamic>? pagination;

  String _typeFilter;
  String get typeFilter => _typeFilter;

  String _period = 'all';
  String get period => _period;

  int _page;
  int get page => _page;

  String _symbolQuery = '';
  String _strategyQuery = '';

  Timer? _searchDebounce;

  void setTypeFilter(String value) {
    if (_typeFilter == value) return;
    _typeFilter = value;
    _page = 1;
    fetch();
  }

  void setPeriod(String value) {
    if (_period == value) return;
    _period = value;
    _page = 1;
    fetch();
  }

  void setPage(int value) {
    if (_page == value) return;
    _page = value;
    fetch();
  }

  /// Debounced: no pega una request por cada tecla.
  void setSymbolQuery(String value) {
    _symbolQuery = value;
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 400), () {
      _page = 1;
      fetch();
    });
  }

  void setStrategyQuery(String value) {
    _strategyQuery = value;
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 400), () {
      _page = 1;
      fetch();
    });
  }

  Future<void> fetch() async {
    isLoading = true;
    notifyListeners();

    final query = <String, String>{
      'page': '$_page',
      'limit': '20',
      'filter': _typeFilter,
      'period': _period,
      if (_symbolQuery.trim().isNotEmpty) 'symbol': _symbolQuery.trim(),
      if (_strategyQuery.trim().isNotEmpty) 'strategy': _strategyQuery.trim(),
    };
    final queryString = query.entries.map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}').join('&');

    try {
      final res = await ApiClient.get('/api/history?$queryString');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        stats = data['stats'];
        pagination = data['pagination'];
        trades = data['trades'] ?? [];
        errorMessage = null;
      } else {
        errorMessage = 'No se pudo cargar el historial.';
      }
    } catch (e) {
      errorMessage = 'No se pudo conectar con el servidor.';
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    super.dispose();
  }
}
