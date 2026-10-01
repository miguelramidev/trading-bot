import 'dart:convert';
import 'package:flutter/material.dart';
import '../../core/theme/ds_colors.dart';
import '../../core/network/api_client.dart';
import 'trade_detail_screen.dart';
import 'package:go_router/go_router.dart';

/// Loads a trade by ID from the API if no preloaded data is available.
/// This ensures the URL /history/trade/:id is always protected by the user's
/// Firebase auth token — unauthenticated users will get a 401 from the API.
class TradeDetailLoader extends StatefulWidget {
  final String tradeId;
  final Map<String, dynamic>? preloaded;

  const TradeDetailLoader({super.key, required this.tradeId, this.preloaded});

  @override
  State<TradeDetailLoader> createState() => _TradeDetailLoaderState();
}

class _TradeDetailLoaderState extends State<TradeDetailLoader> {
  Map<String, dynamic>? _trade;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.preloaded != null && widget.preloaded!.isNotEmpty) {
      _trade = widget.preloaded;
      _loading = false;
    } else {
      _fetchTrade();
    }
  }

  Future<void> _fetchTrade() async {
    try {
      final res = await ApiClient.get('/api/history/${widget.tradeId}');
      if (res.statusCode == 200) {
        setState(() {
          _trade = jsonDecode(res.body) as Map<String, dynamic>;
          _loading = false;
        });
      } else if (res.statusCode == 401) {
        setState(() { _error = 'No autorizado. Por favor inicia sesión.'; _loading = false; });
      } else if (res.statusCode == 404) {
        setState(() { _error = 'Esta operación no existe o no te pertenece.'; _loading = false; });
      } else {
        setState(() { _error = 'Error al cargar la operación (${res.statusCode}).'; _loading = false; });
      }
    } catch (e) {
      setState(() { _error = 'Error de conexión: $e'; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        backgroundColor: DsColors.background,
        body: Center(child: CircularProgressIndicator(color: DsColors.positive)),
      );
    }

    if (_error != null) {
      return Scaffold(
        backgroundColor: DsColors.background,
        appBar: AppBar(
          backgroundColor: DsColors.surface,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back, color: DsColors.textSecondary),
            onPressed: () => context.go('/history'),
          ),
        ),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.lock_outline, color: DsColors.textSecondary, size: 48),
              const SizedBox(height: 16),
              Text(_error!, style: const TextStyle(color: DsColors.textSecondary, fontSize: 16)),
              const SizedBox(height: 24),
              TextButton(onPressed: () => context.go('/history'), child: const Text('Volver al historial')),
            ],
          ),
        ),
      );
    }

    return TradeDetailScreen(trade: _trade!, isClosed: true);
  }
}
